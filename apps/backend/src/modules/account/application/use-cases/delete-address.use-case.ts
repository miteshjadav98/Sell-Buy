import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../../common/errors/domain.errors';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../core/application/transaction-manager.port';
import { IUseCase } from '../../../../core/application/use-case.interface';
import { requiresPromotionAfterDelete } from '../../domain/address.policy';
import { ADDRESS_REPOSITORY, IAddressRepository } from '../../domain/ports/address.ports';

export interface DeleteAddressInput {
  userId: string;
  addressId: string;
}

/**
 * Removes an address and, if it was the default, promotes another.
 *
 * The promotion is the whole reason this is not a one-line delete. Without it,
 * deleting your default leaves an address book with three entries and no
 * default, so checkout opens with nothing selected — which every user reads as
 * "it lost my addresses".
 */
@Injectable()
export class DeleteAddressUseCase implements IUseCase<DeleteAddressInput, void> {
  constructor(
    @Inject(TRANSACTION_MANAGER) private readonly transactions: ITransactionManager,
    @Inject(ADDRESS_REPOSITORY) private readonly addresses: IAddressRepository,
  ) {}

  async execute({ userId, addressId }: DeleteAddressInput): Promise<void> {
    await this.transactions.runInTransaction(async (tx) => {
      const existing = await this.addresses.findOwned(userId, addressId);
      if (!existing) throw new NotFoundError('Address', addressId);

      const deleted = await this.addresses.softDelete(tx, userId, addressId);
      if (!deleted) throw new NotFoundError('Address', addressId);

      const remaining = await this.addresses.countForUser(userId, tx);
      if (!requiresPromotionAfterDelete(existing.isDefault, remaining)) return;

      // Newest survivor wins — the most recently added address is the best
      // guess at where someone lives now.
      const successor = await this.addresses.findPromotionCandidate(tx, userId, addressId);
      if (successor) await this.addresses.markDefault(tx, userId, successor.id);
    });
  }
}
