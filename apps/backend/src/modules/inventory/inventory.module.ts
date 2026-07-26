import { Module } from '@nestjs/common';
import {
  INVENTORY_AVAILABILITY_READER,
  INVENTORY_RESERVATION_WRITER,
} from './domain/ports/inventory.ports';
import { InventoryAvailabilityPrismaReader } from './infrastructure/inventory-availability.prisma.reader';
import { InventoryReservationPrismaRepository } from './infrastructure/inventory-reservation.prisma.repository';

/**
 * Inventory as a module in its own right, with no controllers — for now it is
 * pure capability, consumed by the cart (availability) and checkout
 * (reservations), and by returns in Step 9.
 *
 * Exporting only the port symbols, never the Prisma classes, is what keeps the
 * ownership rule enforceable: a consumer can ask for a reservation, and cannot
 * reach past the port to `UPDATE inventory_items SET reserved = …` on its own.
 */
@Module({
  providers: [
    InventoryAvailabilityPrismaReader,
    InventoryReservationPrismaRepository,
    { provide: INVENTORY_AVAILABILITY_READER, useExisting: InventoryAvailabilityPrismaReader },
    { provide: INVENTORY_RESERVATION_WRITER, useExisting: InventoryReservationPrismaRepository },
  ],
  exports: [INVENTORY_AVAILABILITY_READER, INVENTORY_RESERVATION_WRITER],
})
export class InventoryModule {}
