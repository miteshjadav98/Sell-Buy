/**
 * The API contract, mirrored.
 *
 * Hand-written rather than generated, because the backend's DTOs are NestJS
 * classes with decorators and generating from them would drag class-validator
 * into the browser bundle. The honest cost is that these can drift; the honest
 * mitigation is that they live in one file, so a contract change is one diff.
 *
 * (`packages/shared-types` in docs/05 is where these belong once the repo grows
 * a workspace. One app does not justify a package.)
 */

/** Every successful response is wrapped by the API's TransformInterceptor. */
export interface ApiEnvelope<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
  correlationId: string;
  timestamp: string;
}

export interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    correlationId: string;
    timestamp: string;
    path: string;
  };
}

export interface PaginationMeta {
  total?: number;
  page?: number;
  limit: number;
  totalPages?: number;
  hasNext: boolean;
  nextCursor?: string;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

// --- Auth -----------------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  isVerified: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
}

// --- Catalog --------------------------------------------------------------

export interface ProductListItem {
  id: string;
  slug: string;
  title: string;
  brandName: string | null;
  categoryName: string;
  ratingAverage: number;
  ratingCount: number;
  minPrice: number;
  maxPrice: number;
  compareAtPrice: number | null;
  primaryImageUrl: string | null;
  isFeatured: boolean;
}

export interface ProductVariant {
  id: string;
  sku: string;
  name: string;
  price: number;
  compareAtPrice: number | null;
  isDefault: boolean;
  /** Option name → chosen value, e.g. `{ Color: 'Blue', Storage: '256GB' }`. */
  options: Record<string, string>;
}

export interface ProductDetail {
  id: string;
  slug: string;
  title: string;
  description: string;
  highlights: string[];
  status: string;
  brand: { name: string; slug: string } | null;
  category: { name: string; slug: string };
  seller: { businessName: string; slug: string; rating: number };
  ratingAverage: number;
  ratingCount: number;
  totalSold: number;
  taxRate: number;
  options: Array<{ name: string; values: Array<{ value: string; hexCode: string | null }> }>;
  variants: ProductVariant[];
  media: Array<{ url: string; thumbnailUrl: string | null; altText: string | null; type: string }>;
  specifications: Array<{ group: string; key: string; value: string }>;
}

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  children?: CategoryNode[];
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
}

export type ProductSort = 'newest' | 'price_asc' | 'price_desc' | 'rating' | 'popular';

export interface ProductQuery {
  category?: string;
  brands?: string;
  q?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: ProductSort;
  cursor?: string;
  limit?: number;
}

// --- Cart -----------------------------------------------------------------

export interface CartLine {
  itemId: string;
  variantId: string;
  productId: string;
  productSlug: string;
  title: string;
  variantName: string;
  imageUrl: string | null;
  unitPrice: number;
  compareAtPrice: number | null;
  priceSnapshot: number;
  quantity: number;
  savedForLater: boolean;
  purchasable: boolean;
  lineTotal: number;
  lineSavings: number;
  available: number;
  inStock: boolean;
  exceedsStock: boolean;
  priceChanged: boolean;
}

export interface Cart {
  cartId: string;
  items: CartLine[];
  savedForLater: CartLine[];
  summary: {
    distinctItems: number;
    totalQuantity: number;
    subtotal: number;
    totalMrp: number;
    totalSavings: number;
    hasIssues: boolean;
  };
}

// --- Addresses ------------------------------------------------------------

export type AddressType = 'HOME' | 'WORK' | 'OTHER';

export interface Address {
  id: string;
  type: AddressType;
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  isDefault: boolean;
  createdAt: string;
}

export interface AddressInput {
  type: AddressType;
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  landmark?: string;
  city: string;
  state: string;
  country?: string;
  postalCode: string;
  isDefault?: boolean;
}

// --- Checkout -------------------------------------------------------------

export type PaymentMethod = 'CARD' | 'UPI' | 'NET_BANKING' | 'WALLET' | 'EMI' | 'COD';
export type PaymentGateway = 'RAZORPAY' | 'STRIPE' | 'WALLET' | 'COD';

export interface CheckoutLine {
  variantId: string;
  productTitle: string;
  variantName: string;
  sku: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  discount: number;
  tax: number;
  available: number;
  priceChanged: boolean;
  unavailable: boolean;
  insufficientStock: boolean;
}

export interface CheckoutSummary {
  cartId: string;
  currency: string;
  lines: CheckoutLine[];
  address: Address | null;
  totals: {
    subtotal: number;
    discount: number;
    tax: number;
    /** Under GST-inclusive pricing the tax sits *inside* the subtotal. */
    taxIncludedInPrice: boolean;
    shipping: number;
    giftWrap: number;
    total: number;
    totalWeightGrams: number;
  };
  coupon: {
    code: string | null;
    applied: boolean;
    discount: number;
    freeShipping: boolean;
    rejectedReason: string | null;
  };
  availablePaymentMethods: PaymentMethod[];
  blockers: string[];
  addressRequired: boolean;
}

export interface PlaceOrderInput {
  addressId: string;
  billingAddressId?: string;
  paymentMethod: PaymentMethod;
  preferredGateway?: PaymentGateway;
  couponCode?: string;
  giftWrap?: boolean;
  customerNote?: string;
}

export interface PlacedOrder {
  orderId: string;
  orderNumber: string;
  status: string;
  total: number;
  currency: string;
  payment: {
    gateway: PaymentGateway;
    method: PaymentMethod;
    gatewayOrderId: string;
    clientToken?: string;
    requiresClientAction: boolean;
  };
  idempotentReplay: boolean;
}
