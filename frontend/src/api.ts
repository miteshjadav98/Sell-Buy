import type { Notification, Order, Product, Shop, User } from './types';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
const TOKEN_KEY = 'sellbuy.token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (response.status === 204) return undefined as T;

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, (body as { error?: string }).error ?? 'Request failed');
  }
  return body as T;
}

/** Everything goes through the gateway on one origin. */
export const api = {
  register: (input: { name: string; email: string; password: string; role: string }) =>
    request<{ token: string; user: User }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  login: (input: { email: string; password: string }) =>
    request<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  me: () => request<{ user: User }>('/api/auth/me'),

  listProducts: (search?: string) =>
    request<{ products: Product[] }>(
      `/api/products${search ? `?search=${encodeURIComponent(search)}` : ''}`,
    ),

  myProducts: () => request<{ products: Product[] }>('/api/products/mine'),

  createProduct: (input: {
    title: string;
    description: string;
    price: number;
    stock: number;
    category: string;
    imageUrl: string;
  }) => request<{ product: Product }>('/api/products', { method: 'POST', body: JSON.stringify(input) }),

  updateProduct: (id: string, input: Partial<Product>) =>
    request<{ product: Product }>(`/api/products/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  deleteProduct: (id: string) => request<void>(`/api/products/${id}`, { method: 'DELETE' }),

  listShops: () => request<{ shops: Shop[] }>('/api/shops'),

  getShop: (id: string) => request<{ shop: Shop; products: Product[] }>(`/api/shops/${id}`),

  myShop: () => request<{ shop: Shop | null }>('/api/shops/mine'),

  createShop: (input: { name: string; description: string }) =>
    request<{ shop: Shop }>('/api/shops', { method: 'POST', body: JSON.stringify(input) }),

  createOrder: (items: Array<{ productId: string; quantity: number }>) =>
    request<{ order: Order }>('/api/orders', { method: 'POST', body: JSON.stringify({ items }) }),

  myOrders: () => request<{ orders: Order[] }>('/api/orders/mine'),

  sellerOrders: () => request<{ orders: Order[] }>('/api/orders/seller'),

  notifications: () =>
    request<{ notifications: Notification[]; unread: number }>('/api/notifications'),

  markNotificationsRead: () => request<{ ok: true }>('/api/notifications/read', { method: 'POST' }),
};
