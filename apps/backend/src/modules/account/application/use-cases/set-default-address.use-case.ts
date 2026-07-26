import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../../common/errors/domain.errors';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../core/application/transaction-manager.port';
import { IUseCase } from '../../../../core/application/use-case.interface';
import { ADDRESS_REPOSITORY, IAddressRepository } from '../../domain/ports/address.ports';

export interface SetDefaultAddressInput {
  userId: string;
  addressId: string;
}

/**
 * Moves the default flag.
 *
 * There is no "unset the default" operation, and that omission is deliberate: a
 * default can be moved but never removed, because a user with addresses and no
 * default is exactly the broken state the invariant exists to prevent. The API
 * simply does not offer the move that would create it.
 */
@Injectable()
export class SetDefaultAddressUseCase implements IUseCase<SetDefaultAddressInput, void> {
  constructor(
    @Inject(TRANSACTION_MANAGER) private readonly transactions: ITransactionManager,
    @Inject(ADDRESS_REPOSITORY) private readonly addresses: IAddressRepository,
  ) {}

  async execute({ userId, addressId }: SetDefaultAddressInput): Promise<void> {
    await this.transactions.runInTransaction(async (tx) => {
      // Ownership is checked before anything is cleared, so a guessed uuid
      // cannot strip a user of their default as a side effect of failing.
      const target = await this.addresses.findOwned(userId, addressId);
      if (!target) throw new NotFoundError('Address', addressId);

      await this.addresses.clearDefault(tx, userId);
      await this.addresses.markDefault(tx, userId, addressId);
    });
  }
}
