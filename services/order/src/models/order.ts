import { Schema, model, type Document } from 'mongoose';
import { jsonOptions, type OrderItem } from '@sellbuy/common';

export type OrderStatus = 'pending' | 'confirmed' | 'cancelled';

export interface OrderDoc extends Document {
  customerId: string;
  customerEmail: string;
  items: OrderItem[];
  sellerIds: string[];
  total: number;
  status: OrderStatus;
  statusReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<OrderItem>(
  {
    productId: { type: String, required: true },
    shopId: { type: String, required: true },
    sellerId: { type: String, required: true },
    title: { type: String, required: true },
    // Price is snapshotted at checkout — a later price change must not alter
    // an order that was already placed.
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const orderSchema = new Schema<OrderDoc>(
  {
    customerId: { type: String, required: true, index: true },
    customerEmail: { type: String, required: true },
    items: { type: [orderItemSchema], required: true },
    sellerIds: { type: [String], default: [], index: true },
    total: { type: Number, required: true },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'confirmed', 'cancelled'],
      default: 'pending',
    },
    statusReason: { type: String },
  },
  { timestamps: true, toJSON: jsonOptions() },
);

export const Order = model<OrderDoc>('Order', orderSchema);
