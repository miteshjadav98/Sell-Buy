export type UserRole = 'customer' | 'seller';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface Shop {
  id: string;
  name: string;
  description: string;
  sellerId: string;
  sellerName: string;
}

export interface Product {
  id: string;
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
}

export interface OrderItem {
  productId: string;
  shopId: string;
  sellerId: string;
  title: string;
  price: number;
  quantity: number;
}

export interface Order {
  id: string;
  customerId: string;
  customerEmail: string;
  items: OrderItem[];
  total: number;
  status: 'pending' | 'confirmed' | 'cancelled';
  statusReason?: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: string;
}
