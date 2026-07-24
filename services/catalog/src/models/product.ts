import { jsonOptions } from '@sellbuy/common';
import { Schema, model, type Document } from 'mongoose';

export interface ProductDoc extends Document {
  shopId: string;
  shopName: string;
  sellerId: string;
  title: string;
  description: string;
  price: number;
  stock: number;
  category: string;
  imageUrl: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new Schema<ProductDoc>(
  {
    shopId: { type: String, required: true, index: true },
    shopName: { type: String, required: true },
    sellerId: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    price: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0, default: 0 },
    category: { type: String, default: 'general', index: true },
    imageUrl: { type: String, default: '' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, toJSON: jsonOptions() },
);

productSchema.index({ title: 'text', description: 'text' });

export const Product = model<ProductDoc>('Product', productSchema);
