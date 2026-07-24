import { Schema, model, type Document } from 'mongoose';

export interface ReservationDoc extends Document {
  orderId: string;
  status: 'reserved' | 'rejected';
  reason?: string;
  createdAt: Date;
}

/**
 * Records that an order was already processed. The unique index on orderId is
 * what makes the order.created consumer idempotent — Kafka delivers at least
 * once, so a redelivery must not decrement stock twice.
 */
const reservationSchema = new Schema<ReservationDoc>(
  {
    orderId: { type: String, required: true, unique: true, index: true },
    status: { type: String, required: true, enum: ['reserved', 'rejected'] },
    reason: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const Reservation = model<ReservationDoc>('Reservation', reservationSchema);
