import { Module } from '@nestjs/common';
import {
  CART_REPOSITORY,
  INVENTORY_READER,
  VARIANT_PRICING_READER,
} from '../domain/ports/cart.ports';
import { CartQueryService } from '../application/services/cart-query.service';
import { AddToCartUseCase } from '../application/use-cases/add-to-cart.use-case';
import { ClearCartUseCase } from '../application/use-cases/clear-cart.use-case';
import { GetCartUseCase } from '../application/use-cases/get-cart.use-case';
import { MergeCartUseCase } from '../application/use-cases/merge-cart.use-case';
import { RemoveCartItemUseCase } from '../application/use-cases/remove-cart-item.use-case';
import { SaveForLaterUseCase } from '../application/use-cases/save-for-later.use-case';
import { UpdateCartItemUseCase } from '../application/use-cases/update-cart-item.use-case';
import { CartPrismaRepository } from '../infrastructure/cart.prisma.repository';
import { VariantPricingPrismaReader } from '../infrastructure/variant-pricing.prisma.reader';
import { InventoryModule } from '../../inventory/inventory.module';
import { INVENTORY_AVAILABILITY_READER } from '../../inventory/domain/ports/inventory.ports';
import { CartController } from './cart.controller';

/**
 * Composition root for the cart. The use cases ask for CART_REPOSITORY,
 * VARIANT_PRICING_READER and INVENTORY_READER — interfaces they own — and this
 * module decides who answers them.
 *
 * INVENTORY_READER is answered by the inventory module's exported availability
 * port rather than a local adapter. Stock arithmetic (on-hand − reserved, across
 * warehouses) has exactly one correct definition, and two modules each keeping
 * their own copy of it is how "available" comes to mean two different numbers.
 * The cart still depends only on its own interface — the binding is the one line
 * that knows who satisfies it.
 *
 * PrismaService comes from the @Global PrismaModule, so nothing else to import.
 */
@Module({
  imports: [InventoryModule],
  controllers: [CartController],
  providers: [
    // --- Use cases + the shared view assembler ---
    GetCartUseCase,
    AddToCartUseCase,
    UpdateCartItemUseCase,
    RemoveCartItemUseCase,
    SaveForLaterUseCase,
    ClearCartUseCase,
    MergeCartUseCase,
    CartQueryService,

    // --- Port bindings (Dependency Inversion) ---
    { provide: CART_REPOSITORY, useClass: CartPrismaRepository },
    { provide: VARIANT_PRICING_READER, useClass: VariantPricingPrismaReader },
    { provide: INVENTORY_READER, useExisting: INVENTORY_AVAILABILITY_READER },
  ],
})
export class CartModule {}
