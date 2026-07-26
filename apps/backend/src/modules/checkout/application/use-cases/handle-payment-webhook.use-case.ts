import { Inject, Injectable, Logger } from '@nestjs/common';
import { PaymentGateway } from '@prisma/client';
import { UnauthorizedError } from '../../../../common/errors/domain.errors';
import { IUseCase } from '../../../../core/application/use-case.interface';
import { PaymentGatewayFactory } from '../../../../infrastructure/payments/payment-gateway.factory';
import {
  IPaymentRepository,
  IWebhookEventRepository,
  PAYMENT_REPOSITORY,
  WEBHOOK_EVENT_REPOSITORY,
} from '../../domain/ports/checkout.ports';
import { PaymentSettlementService } from '../services/payment-settlement.service';

export interface HandlePaymentWebhookInput {
  gateway: PaymentGateway;
  /** The bytes exactly as received — see below for why this cannot be the parsed object. */
  rawBody: string;
  signature: string;
}

export interface HandlePaymentWebhookResult {
  accepted: boolean;
  /** True when this delivery had already been processed. */
  duplicate: boolean;
  action: 'captured' | 'failed' | 'ignored';
}

/** The subset of gateway event shapes this handler understands. */
interface WebhookEnvelope {
  id?: string;
  event?: string;
  type?: string;
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string; amount?: number; error_description?: string } };
  };
  data?: { object?: { id?: string; amount?: number; last_payment_error?: { message?: string } } };
}

/**
 * The authoritative payment path.
 *
 * The browser may never come back — the customer closes the tab, the phone dies,
 * the redirect is eaten by a corporate proxy. The webhook is the only signal
 * guaranteed to arrive, so it, not the client callback, is what decides whether
 * an order is real.
 *
 * Three defences, in this order, all of them load-bearing:
 *
 *   1. **HMAC over the raw bytes.** Anyone can POST to a public webhook URL.
 *      Without signature verification this endpoint is "confirm any order you
 *      like, for free". The signature must be computed over the body as
 *      received: once Express has parsed and re-serialised the JSON, key order
 *      and number formatting can change and a valid signature stops matching —
 *      which is why `main.ts` enables `rawBody`.
 *   2. **Deduplication on (gateway, eventId).** Gateways retry aggressively and
 *      will deliver the same event a dozen times. A unique constraint, not a
 *      read-then-write, because two retries can land on two pods at once.
 *   3. **Idempotent settlement.** Even past the first two, capturing twice must
 *      be a no-op — the client callback may have settled it a second earlier.
 *
 * It always answers 200 to anything it has authenticated. A non-2xx tells the
 * gateway to retry, and retrying an event we have already recorded achieves
 * nothing but load.
 */
@Injectable()
export class HandlePaymentWebhookUseCase
  implements IUseCase<HandlePaymentWebhookInput, HandlePaymentWebhookResult>
{
  private readonly logger = new Logger(HandlePaymentWebhookUseCase.name);

  constructor(
    @Inject(WEBHOOK_EVENT_REPOSITORY) private readonly deliveries: IWebhookEventRepository,
    @Inject(PAYMENT_REPOSITORY) private readonly payments: IPaymentRepository,
    private readonly gateways: PaymentGatewayFactory,
    private readonly settlement: PaymentSettlementService,
  ) {}

  async execute(input: HandlePaymentWebhookInput): Promise<HandlePaymentWebhookResult> {
    const adapter = this.gateways.forGateway(input.gateway);

    if (!adapter.verifyWebhookSignature(input.rawBody, input.signature)) {
      this.logger.warn(`Rejected an unsigned or forged ${input.gateway} webhook`);
      throw new UnauthorizedError('Invalid webhook signature');
    }

    const envelope = this.parse(input.rawBody);
    const eventId = envelope.id;
    const eventType = envelope.event ?? envelope.type ?? 'unknown';

    if (!eventId) {
      // Nothing to deduplicate on means we cannot promise to process it once.
      // Recording and ignoring beats acting on it an unknown number of times.
      this.logger.warn(`${input.gateway} webhook ${eventType} carried no event id; ignoring`);
      return { accepted: true, duplicate: false, action: 'ignored' };
    }

    const isNew = await this.deliveries.recordIfNew({
      gateway: input.gateway,
      eventId,
      eventType,
      payload: envelope,
    });
    if (!isNew) {
      return { accepted: true, duplicate: true, action: 'ignored' };
    }

    try {
      const action = await this.dispatch(input.gateway, eventType, envelope);
      await this.deliveries.markProcessed(input.gateway, eventId);
      return { accepted: true, duplicate: false, action };
    } catch (error) {
      // Recorded against the delivery so a failed event is visible and
      // replayable, rather than vanishing into a log line.
      await this.deliveries.markProcessed(input.gateway, eventId, (error as Error).message);
      throw error;
    }
  }

  private async dispatch(
    gateway: PaymentGateway,
    eventType: string,
    envelope: WebhookEnvelope,
  ): Promise<HandlePaymentWebhookResult['action']> {
    const gatewayOrderId = this.gatewayOrderIdOf(envelope);
    if (!gatewayOrderId) return 'ignored';

    const payment = await this.payments.findByGatewayOrderId(gatewayOrderId);
    if (!payment) {
      // Not necessarily an error: gateways also send events for test traffic and
      // for intents we abandoned before persisting.
      this.logger.warn(`No payment matches ${gateway} order ${gatewayOrderId}`);
      return 'ignored';
    }

    if (this.isCapture(eventType)) {
      const gatewayPaymentId = this.gatewayPaymentIdOf(envelope) ?? gatewayOrderId;
      const amountMinor = this.amountOf(envelope);

      // The signature proves the gateway sent it; it does not prove the amount
      // is right. An event reporting less than the order costs is treated as a
      // failure, not a capture.
      if (amountMinor !== null && amountMinor !== payment.amountMinor) {
        await this.settlement.fail(
          payment,
          `Amount mismatch: gateway reported ${amountMinor}, order expects ${payment.amountMinor}`,
          envelope,
        );
        return 'failed';
      }

      await this.settlement.capture(payment, { gatewayPaymentId, raw: envelope });
      return 'captured';
    }

    if (this.isFailure(eventType)) {
      await this.settlement.fail(payment, this.failureReasonOf(envelope), envelope);
      return 'failed';
    }

    return 'ignored';
  }

  private parse(rawBody: string): WebhookEnvelope {
    try {
      return JSON.parse(rawBody) as WebhookEnvelope;
    } catch {
      throw new UnauthorizedError('Webhook body is not valid JSON');
    }
  }

  /**
   * Event names differ per provider, so the matching is on substrings rather
   * than an exhaustive table. A table would need editing every time a gateway
   * adds an event; this quietly ignores what it does not recognise, which is the
   * safe direction to be wrong in.
   */
  private isCapture(eventType: string): boolean {
    return /captured|succeeded|payment\.paid/i.test(eventType);
  }

  private isFailure(eventType: string): boolean {
    return /failed|cancell?ed|expired/i.test(eventType);
  }

  private gatewayOrderIdOf(envelope: WebhookEnvelope): string | null {
    return envelope.payload?.payment?.entity?.order_id ?? envelope.data?.object?.id ?? null;
  }

  private gatewayPaymentIdOf(envelope: WebhookEnvelope): string | null {
    return envelope.payload?.payment?.entity?.id ?? envelope.data?.object?.id ?? null;
  }

  private amountOf(envelope: WebhookEnvelope): number | null {
    return envelope.payload?.payment?.entity?.amount ?? envelope.data?.object?.amount ?? null;
  }

  private failureReasonOf(envelope: WebhookEnvelope): string {
    return (
      envelope.payload?.payment?.entity?.error_description ??
      envelope.data?.object?.last_payment_error?.message ??
      'The payment did not complete'
    );
  }
}
