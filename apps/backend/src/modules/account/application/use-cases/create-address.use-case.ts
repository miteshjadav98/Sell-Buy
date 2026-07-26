import { Inject, Injectable } from '@nestjs/common';
import { BusinessRuleError } from '../../../../common/errors/domain.errors';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../core/application/transaction-manager.port';
import { IUseCase } from '../../../../core/application/use-case.interface';
import { MAX_ADDRESSES_PER_USER, canAddAnother, shouldBecomeDefault } from '../../domain/address.policy';
import {
  ADDRESS_REPOSITORY,
  AddressInput,
  AddressRecord,
  IAddressRepository,
} from '../../domain/ports/address.ports';

export interface CreateAddressInput extends AddressInput {
  userId: string;
  isDefault?: boolean;
}

/**
 * Saves an address, keeping the one-default invariant intact.
 *
 * The whole thing runs in a transaction because promoting a new default is two
 * writes — clear the old flag, set the new one — and a failure between them
 * leaves the user with either two defaults or none. Both are states the
 * checkout address step handles badly and neither is recoverable without
 * someone noticing.
 */
@Injectable()
export class CreateAddressUseCase implements IUseCase<CreateAddressInput, AddressRecord> {
  constructor(
    @Inject(TRANSACTION_MANAGER) private readonly transactions: ITransactionManager,
    @Inject(ADDRESS_REPOSITORY) private readonly addresses: IAddressRepository,
  ) {}

  async execute(input: CreateAddressInput): Promise<AddressRecord> {
    const { userId, isDefault, ...address } = input;

    return this.transactions.runInTransaction(async (tx) => {
      const existingCount = await this.addresses.countForUser(userId, tx);

      if (canAddAnother(existingCount).isFailure) {
        throw new BusinessRuleError(
          `You can save at most ${MAX_ADDRESSES_PER_USER} addresses. Delete one to add another.`,
        );
      }

      const becomesDefault = shouldBecomeDefault(isDefault ?? false, existingCount);
      // Clear first, then create as default — never the other way round, which
      // would briefly leave two defaults and then clear the one just made.
      if (becomesDefault) await this.addresses.clearDefault(tx, userId);

      return this.addresses.create(tx, userId, address, becomesDefault);
    });
  }
}
