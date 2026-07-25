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
import { InventoryPrismaReader } from '../infrastructure/inventory.prisma.reader';
import { VariantPricingPrismaReader } from '../infrastructure/variant-pricing.prisma.reader';
import { CartController } from './cart.controller';

/**
 * Composition root for the cart. The use cases ask for CART_REPOSITORY,
 * VARIANT_PRICING_READER and INVENTORY_READER — interfaces they own — and this
 * module decides Prisma answers all three. The two readers are separate adapters
 * over catalogue and inventory tables, so the cart never imports either module.
 *
 * PrismaService comes from the @Global PrismaModule, so nothing to import here.
 */
@Module({
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
    { provide: INVENTORY_READER, useClass: InventoryPrismaReader },
  ],
})
export class CartModule {}
