import { Inject, Injectable } from '@nestjs/common';
import { IUseCase } from '../../../../core/application/use-case.interface';
import {
  ADDRESS_REPOSITORY,
  AddressRecord,
  IAddressRepository,
} from '../../domain/ports/address.ports';

/**
 * The user's address book, default first — which is the order the checkout
 * address picker renders, so the pre-selected option is the top one and the
 * common case needs no interaction at all.
 */
@Injectable()
export class ListAddressesUseCase implements IUseCase<string, AddressRecord[]> {
  constructor(@Inject(ADDRESS_REPOSITORY) private readonly addresses: IAddressRepository) {}

  async execute(userId: string): Promise<AddressRecord[]> {
    return this.addresses.listForUser(userId);
  }
}
