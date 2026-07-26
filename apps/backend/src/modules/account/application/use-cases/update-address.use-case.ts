import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../../common/errors/domain.errors';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../core/application/transaction-manager.port';
import { IUseCase } from '../../../../core/application/use-case.interface';
import {
  ADDRESS_REPOSITORY,
  AddressInput,
  AddressRecord,
  IAddressRepository,
} from '../../domain/ports/address.ports';

export interface UpdateAddressInput extends AddressInput {
  userId: string;
  addressId: string;
  isDefault?: boolean;
}

/**
 * Edits an address in place.
 *
 * Worth knowing what this does NOT affect: orders already placed. Each order
 * freezes its own copy of the delivery address as JSON, so correcting a typo
 * here never rewrites where a shipped parcel says it went. That separation is
 * what makes editing safe enough to expose at all.
 */
@Injectable()
export class UpdateAddressUseCase implements IUseCase<UpdateAddressInput, AddressRecord> {
  constructor(
    @Inject(TRANSACTION_MANAGER) private readonly transactions: ITransactionManager,
    @Inject(ADDRESS_REPOSITORY) private readonly addresses: IAddressRepository,
  ) {}

  async execute(input: UpdateAddressInput): Promise<AddressRecord> {
    const { userId, addressId, isDefault, ...address } = input;

    return this.transactions.runInTransaction(async (tx) => {
      const updated = await this.addresses.update(tx, userId, addressId, address);
      // Null means it does not exist *or* is not theirs — the same answer either
      // way, because distinguishing them confirms the address exists.
      if (!updated) throw new NotFoundError('Address', addressId);

      if (isDefault && !updated.isDefault) {
        await this.addresses.clearDefault(tx, userId);
        await this.addresses.markDefault(tx, userId, addressId);
        return { ...updated, isDefault: true };
      }

      return updated;
    });
  }
}
