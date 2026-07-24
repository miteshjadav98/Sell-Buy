import { randomUUID } from 'crypto';
import { Kafka, logLevel, type Consumer, type Producer } from 'kafkajs';
import { config } from './config';
import { ALL_TOPICS, type EventEnvelope, type EventMap, type Topic } from './events';
import type { Logger } from './logger';

export type EventHandler<K extends Topic> = (event: EventEnvelope<EventMap[K]>) => Promise<void>;

type HandlerMap = { [K in Topic]?: EventHandler<K> };

/**
 * Thin wrapper over KafkaJS so services deal in domain events instead of
 * buffers. When KAFKA_ENABLED=false it degrades to a no-op, which keeps the
 * HTTP layer runnable without a broker.
 */
export class EventBus {
  private readonly kafka: Kafka | null;
  private producer: Producer | null = null;
  private readonly consumers: Consumer[] = [];

  constructor(
    private readonly clientId: string,
    private readonly logger: Logger,
  ) {
    this.kafka = config.kafka.enabled
      ? new Kafka({
          clientId,
          brokers: config.kafka.brokers,
          logLevel: logLevel.ERROR,
          retry: { initialRetryTime: 300, retries: 10 },
        })
      : null;
  }

  get enabled(): boolean {
    return this.kafka !== null;
  }

  async connect(): Promise<void> {
    if (!this.kafka) {
      this.logger.warn('kafka disabled — events will not be published');
      return;
    }
    await this.ensureTopics();
    this.producer = this.kafka.producer({ allowAutoTopicCreation: true });
    await this.producer.connect();
    this.logger.info('kafka producer connected', { brokers: config.kafka.brokers });
  }

  /** Creates the topics up front so consumers don't race the first publish. */
  private async ensureTopics(): Promise<void> {
    if (!this.kafka) return;
    const admin = this.kafka.admin();
    try {
      await admin.connect();
      const existing = await admin.listTopics();
      const missing = ALL_TOPICS.filter((t) => !existing.includes(t));
      if (missing.length > 0) {
        await admin.createTopics({
          topics: missing.map((topic) => ({ topic, numPartitions: 1, replicationFactor: 1 })),
          waitForLeaders: true,
        });
        this.logger.info('created kafka topics', { topics: missing });
      }
    } catch (err) {
      this.logger.warn('could not ensure topics (continuing)', { err: String(err) });
    } finally {
      await admin.disconnect().catch(() => undefined);
    }
  }

  async publish<K extends Topic>(topic: K, data: EventMap[K], key?: string): Promise<void> {
    const event: EventEnvelope<EventMap[K]> = {
      id: randomUUID(),
      type: topic,
      occurredAt: new Date().toISOString(),
      data,
    };

    if (!this.producer) {
      this.logger.debug('event dropped (bus disabled)', { topic });
      return;
    }

    await this.producer.send({
      topic,
      messages: [{ key: key ?? event.id, value: JSON.stringify(event) }],
    });
    this.logger.info('event published', { topic, eventId: event.id });
  }

  /**
   * Subscribes one consumer group to a set of topics. Each service uses its
   * own groupId so every service sees its own copy of the stream.
   */
  async subscribe(groupId: string, handlers: HandlerMap): Promise<void> {
    if (!this.kafka) return;
    const topics = Object.keys(handlers) as Topic[];
    if (topics.length === 0) return;

    const consumer = this.kafka.consumer({ groupId });
    await consumer.connect();
    for (const topic of topics) {
      await consumer.subscribe({ topic, fromBeginning: false });
    }

    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        if (!message.value) return;
        const event = JSON.parse(message.value.toString()) as EventEnvelope;
        const handler = handlers[topic as Topic] as EventHandler<Topic> | undefined;
        if (!handler) return;
        try {
          await handler(event as EventEnvelope<EventMap[Topic]>);
          this.logger.info('event handled', { topic, eventId: event.id });
        } catch (err) {
          // Swallowing keeps one poison message from stalling the partition.
          // A production system would route this to a dead-letter topic.
          this.logger.error('event handler failed', { topic, eventId: event.id, err: String(err) });
        }
      },
    });

    this.consumers.push(consumer);
    this.logger.info('kafka consumer running', { groupId, topics });
  }

  async disconnect(): Promise<void> {
    await Promise.allSettled([
      ...this.consumers.map((c) => c.disconnect()),
      this.producer?.disconnect() ?? Promise.resolve(),
    ]);
  }
}
