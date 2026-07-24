import { jsonOptions } from '@sellbuy/common';
import { Schema, model, type Document } from 'mongoose';

export interface ShopDoc extends Document {
  sellerId: string;
  sellerName: string;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

const shopSchema = new Schema<ShopDoc>(
  {
    // One shop per seller keeps the model simple for a small marketplace.
    sellerId: { type: String, required: true, unique: true, index: true },
    sellerName: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
  },
  { timestamps: true, toJSON: jsonOptions() },
);

export const Shop = model<ShopDoc>('Shop', shopSchema);
