import { Module } from '@nestjs/common';
import { ADDRESS_REPOSITORY } from '../domain/ports/address.ports';
import { CreateAddressUseCase } from '../application/use-cases/create-address.use-case';
import { DeleteAddressUseCase } from '../application/use-cases/delete-address.use-case';
import { ListAddressesUseCase } from '../application/use-cases/list-addresses.use-case';
import { SetDefaultAddressUseCase } from '../application/use-cases/set-default-address.use-case';
import { UpdateAddressUseCase } from '../application/use-cases/update-address.use-case';
import { AddressPrismaRepository } from '../infrastructure/address.prisma.repository';
import { AddressController } from './address.controller';

/**
 * The customer's own data — addresses today; profile, wishlist and wallet as
 * they arrive.
 *
 * Checkout keeps its own narrow `CHECKOUT_ADDRESS_READER` rather than importing
 * this module's repository, and that is intentional: checkout needs a different
 * projection (the flat shape it freezes into an order) and needs it to be
 * read-only. Two small ports over one table beat one shared interface that has
 * to satisfy both an address book and an order snapshot.
 */
@Module({
  controllers: [AddressController],
  providers: [
    ListAddressesUseCase,
    CreateAddressUseCase,
    UpdateAddressUseCase,
    DeleteAddressUseCase,
    SetDefaultAddressUseCase,
    { provide: ADDRESS_REPOSITORY, useClass: AddressPrismaRepository },
  ],
})
export class AccountModule {}
