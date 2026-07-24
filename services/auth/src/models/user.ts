import { Schema, model, type Document } from 'mongoose';
import { jsonOptions, type UserRole } from '@sellbuy/common';

export interface UserDoc extends Document {
  email: string;
  passwordHash: string;
  name: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDoc>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, required: true, enum: ['customer', 'seller'], default: 'customer' },
  },
  {
    timestamps: true,
    // The password hash never leaves the service.
    toJSON: jsonOptions(['passwordHash']),
  },
);

export const User = model<UserDoc>('User', userSchema);
