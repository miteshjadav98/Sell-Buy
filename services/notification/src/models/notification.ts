import { jsonOptions } from '@sellbuy/common';
import { Schema, model, type Document } from 'mongoose';

export interface NotificationDoc extends Document {
  userId: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
}

const notificationSchema = new Schema<NotificationDoc>(
  {
    userId: { type: String, required: true, index: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false }, toJSON: jsonOptions() },
);

export const Notification = model<NotificationDoc>('Notification', notificationSchema);
