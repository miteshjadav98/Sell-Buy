/**
 * The Prisma CLI loads `.env` for us; plain `ts-node` does not. Without this the
 * seed dies on "Environment variable not found: DATABASE_URL", which looks like
 * a missing file rather than a missing loader.
 */
import 'dotenv/config';

import {
  AddressType,
  CouponType,
  MediaType,
  PrismaClient,
  ProductStatus,
  SellerStatus,
  UserStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';

/**
 * Development seed.
 *
 * Two jobs. The first is mandatory: registration connects a new user to a Role
 * by name, so without the roles below the API cannot create a single account.
 * The second is convenience — a seller, a catalogue and real inventory rows, so
 * checkout has something to lock and reserve.
 *
 * Every write is an upsert keyed on a natural unique field, which makes the
 * whole script idempotent. Re-running it after a schema change must not
 * duplicate the catalogue or fail on a unique constraint.
 */
const prisma = new PrismaClient();

/** Coarse roles. Permissions below are what actually gate anything. */
const ROLES = [
  { name: 'CUSTOMER', description: 'Buys things', isSystem: true },
  { name: 'SELLER', description: 'Runs a storefront', isSystem: true },
  { name: 'ADMIN', description: 'Governs the marketplace', isSystem: true },
  { name: 'SUPER_ADMIN', description: 'Unrestricted', isSystem: true },
];

/**
 * Permissions are `resource.action`. Roles change shape as a business grows
 * ("a junior admin who can refund but not delete"), and permission checks
 * absorb that without a code change — which is why the guards prefer these over
 * role names.
 */
const PERMISSIONS = [
  ['product.create', 'product', 'create'],
  ['product.update', 'product', 'update'],
  ['product.delete', 'product', 'delete'],
  ['product.review', 'product', 'review'],
  ['category.manage', 'category', 'manage'],
  ['brand.manage', 'brand', 'manage'],
  ['order.view.own', 'order', 'view.own'],
  ['order.view.all', 'order', 'view.all'],
  ['order.fulfil', 'order', 'fulfil'],
  ['order.cancel', 'order', 'cancel'],
  ['order.refund', 'order', 'refund'],
  ['seller.approve', 'seller', 'approve'],
  ['user.manage', 'user', 'manage'],
] as const;

const ROLE_PERMISSIONS: Record<string, string[]> = {
  CUSTOMER: ['order.view.own'],
  SELLER: ['product.create', 'product.update', 'order.view.own', 'order.fulfil'],
  ADMIN: [
    'product.review',
    'product.delete',
    'category.manage',
    'brand.manage',
    'order.view.all',
    'order.cancel',
    'order.refund',
    'seller.approve',
  ],
  SUPER_ADMIN: PERMISSIONS.map(([code]) => code),
};

async function seedRbac(): Promise<void> {
  for (const role of ROLES) {
    await prisma.role.upsert({ where: { name: role.name }, update: {}, create: role });
  }

  for (const [code, resource, action] of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code },
      update: {},
      create: { code, resource, action },
    });
  }

  for (const [roleName, codes] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    for (const code of codes) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { code } });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  console.log(`  roles: ${ROLES.length}, permissions: ${PERMISSIONS.length}`);
}

async function createUser(input: {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  role: string;
}): Promise<string> {
  // Hashed with the same algorithm the API uses, so these accounts can actually
  // sign in rather than merely existing.
  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });

  /**
   * Both the timestamp and the status must be set.
   *
   * `emailVerifiedAt` records *when* verification happened, but the sign-in gate
   * in `User.canSignIn()` tests `status !== PENDING_VERIFICATION` — and the
   * column defaults to PENDING_VERIFICATION. Setting only the timestamp seeds
   * accounts that look verified in the database and are still refused at login.
   */
  const verified = {
    status: UserStatus.ACTIVE,
    emailVerifiedAt: new Date(),
  };

  const user = await prisma.user.upsert({
    where: { email: input.email },
    // Re-applied on update so an account seeded before this fix is repaired
    // rather than left in the broken state by an idempotent no-op.
    update: verified,
    create: {
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      ...verified,
    },
  });

  const role = await prisma.role.findUniqueOrThrow({ where: { name: input.role } });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });

  return user.id;
}

async function main(): Promise<void> {
  console.log('Seeding…');

  await seedRbac();

  // ---- People -------------------------------------------------------------
  const sellerUserId = await createUser({
    email: 'seller@sell-buy.local',
    firstName: 'Asha',
    lastName: 'Rao',
    password: 'Seller@12345',
    role: 'SELLER',
  });

  await createUser({
    email: 'admin@sell-buy.local',
    firstName: 'Admin',
    lastName: 'User',
    password: 'Admin@12345',
    role: 'ADMIN',
  });

  const customerId = await createUser({
    email: 'customer@sell-buy.local',
    firstName: 'Rohan',
    lastName: 'Mehta',
    password: 'Customer@12345',
    role: 'CUSTOMER',
  });

  await prisma.address.upsert({
    where: { id: '11111111-1111-4111-8111-111111111111' },
    update: {},
    create: {
      id: '11111111-1111-4111-8111-111111111111',
      userId: customerId,
      type: AddressType.HOME,
      fullName: 'Rohan Mehta',
      phone: '9876543210',
      addressLine1: '14, Brigade Road',
      addressLine2: 'Ashok Nagar',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560001',
      isDefault: true,
    },
  });

  const seller = await prisma.seller.upsert({
    where: { userId: sellerUserId },
    update: {},
    create: {
      userId: sellerUserId,
      businessName: 'Nilgiri Trading Co.',
      slug: 'nilgiri-trading',
      description: 'Everyday goods, honestly priced.',
      status: SellerStatus.APPROVED,
      approvedAt: new Date(),
      rating: 4.6,
      ratingCount: 218,
    },
  });

  const warehouse = await prisma.warehouse.upsert({
    where: { code: 'BLR-01' },
    update: {},
    create: {
      sellerId: seller.id,
      name: 'Bengaluru fulfilment centre',
      code: 'BLR-01',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560068',
    },
  });

  // ---- Catalogue ----------------------------------------------------------
  const categories = [
    { name: 'Apparel', slug: 'apparel' },
    { name: 'Electronics', slug: 'electronics' },
    { name: 'Home', slug: 'home' },
  ];

  for (const [index, category] of categories.entries()) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: {},
      create: { ...category, path: `/${category.slug}`, level: 0, position: index },
    });
  }

  const brands = [
    { name: 'Nilgiri', slug: 'nilgiri' },
    { name: 'Kaveri', slug: 'kaveri' },
  ];

  for (const brand of brands) {
    await prisma.brand.upsert({ where: { slug: brand.slug }, update: {}, create: brand });
  }

  const apparel = await prisma.category.findUniqueOrThrow({ where: { slug: 'apparel' } });
  const electronics = await prisma.category.findUniqueOrThrow({ where: { slug: 'electronics' } });
  const nilgiri = await prisma.brand.findUniqueOrThrow({ where: { slug: 'nilgiri' } });
  const kaveri = await prisma.brand.findUniqueOrThrow({ where: { slug: 'kaveri' } });

  /**
   * The t-shirt is deliberately ₹999 with 18% GST — the exact figure the
   * storefront hero uses to demonstrate inclusive pricing, so the claim on the
   * home page is verifiable against a real product.
   */
  const products = [
    {
      slug: 'cotton-crew-tee',
      title: 'Cotton crew-neck t-shirt',
      description:
        'A heavyweight 240gsm cotton tee, pre-shrunk and cut for everyday wear.\n\nMade in Tiruppur.',
      highlights: ['240gsm combed cotton', 'Pre-shrunk', 'Machine washable'],
      categoryId: apparel.id,
      brandId: nilgiri.id,
      taxRate: 18,
      options: [
        { name: 'Colour', values: [{ value: 'Indigo', hexCode: '#2B4C7E' }, { value: 'Ecru', hexCode: '#EDE6D6' }] },
        { name: 'Size', values: [{ value: 'M', hexCode: null }, { value: 'L', hexCode: null }] },
      ],
      variants: [
        { sku: 'TEE-IND-M', name: 'Indigo / M', price: 999, compareAtPrice: 1299, weightGrams: 220, options: { Colour: 'Indigo', Size: 'M' }, stock: 24 },
        { sku: 'TEE-IND-L', name: 'Indigo / L', price: 999, compareAtPrice: 1299, weightGrams: 240, options: { Colour: 'Indigo', Size: 'L' }, stock: 11 },
        { sku: 'TEE-ECR-M', name: 'Ecru / M', price: 949, compareAtPrice: null, weightGrams: 220, options: { Colour: 'Ecru', Size: 'M' }, stock: 3 },
        { sku: 'TEE-ECR-L', name: 'Ecru / L', price: 949, compareAtPrice: null, weightGrams: 240, options: { Colour: 'Ecru', Size: 'L' }, stock: 0 },
      ],
    },
    {
      slug: 'desk-lamp-brass',
      title: 'Brass desk lamp',
      description: 'A weighted brass task lamp with a linen shade and a dimmable warm LED.',
      highlights: ['Solid brass', 'Dimmable 2700K LED', '2-year warranty'],
      categoryId: electronics.id,
      brandId: kaveri.id,
      taxRate: 18,
      options: [{ name: 'Finish', values: [{ value: 'Polished', hexCode: '#C9A227' }, { value: 'Antique', hexCode: '#6B5321' }] }],
      variants: [
        { sku: 'LAMP-POL', name: 'Polished', price: 4499, compareAtPrice: 5299, weightGrams: 1800, options: { Finish: 'Polished' }, stock: 8 },
        { sku: 'LAMP-ANT', name: 'Antique', price: 4699, compareAtPrice: null, weightGrams: 1850, options: { Finish: 'Antique' }, stock: 5 },
      ],
    },
    {
      slug: 'steel-water-bottle',
      title: 'Insulated steel water bottle, 750ml',
      description: 'Double-walled stainless steel. Holds heat for 12 hours, cold for 24.',
      highlights: ['750ml', '18/8 stainless steel', 'Leak-proof lid'],
      categoryId: apparel.id,
      brandId: nilgiri.id,
      taxRate: 12,
      options: [],
      variants: [
        { sku: 'BOTL-750', name: 'Standard', price: 1299, compareAtPrice: 1699, weightGrams: 420, options: {}, stock: 40 },
      ],
    },
  ];

  for (const product of products) {
    const created = await prisma.product.upsert({
      where: { slug: product.slug },
      update: {},
      create: {
        sellerId: seller.id,
        categoryId: product.categoryId,
        brandId: product.brandId,
        title: product.title,
        slug: product.slug,
        description: product.description,
        highlights: product.highlights,
        // ACTIVE + publishedAt is what makes it visible on the storefront; the
        // listing query filters on exactly this.
        status: ProductStatus.ACTIVE,
        publishedAt: new Date(),
        taxRate: product.taxRate,
        ratingAverage: 4.3,
        ratingCount: 57,
        totalSold: 130,
        isFeatured: product.slug === 'cotton-crew-tee',
      },
    });

    await prisma.productMedia.deleteMany({ where: { productId: created.id } });
    await prisma.productMedia.create({
      data: {
        productId: created.id,
        type: MediaType.IMAGE,
        // A placeholder service, so the grid has real imagery without shipping
        // binaries in the repo.
        url: `https://picsum.photos/seed/${product.slug}/800/1000`,
        thumbnailUrl: `https://picsum.photos/seed/${product.slug}/200/250`,
        altText: product.title,
        position: 0,
      },
    });

    // Options and their values, so the variant picker has something to render.
    const valueIds = new Map<string, string>();
    for (const [position, option] of product.options.entries()) {
      const createdOption = await prisma.productOption.upsert({
        where: { productId_name: { productId: created.id, name: option.name } },
        update: {},
        create: { productId: created.id, name: option.name, position },
      });

      for (const [valuePosition, value] of option.values.entries()) {
        const createdValue = await prisma.productOptionValue.upsert({
          where: { optionId_value: { optionId: createdOption.id, value: value.value } },
          update: {},
          create: {
            optionId: createdOption.id,
            value: value.value,
            hexCode: value.hexCode,
            position: valuePosition,
          },
        });
        valueIds.set(`${option.name}:${value.value}`, createdValue.id);
      }
    }

    for (const [position, variant] of product.variants.entries()) {
      const createdVariant = await prisma.productVariant.upsert({
        where: { sku: variant.sku },
        update: {},
        create: {
          productId: created.id,
          sku: variant.sku,
          name: variant.name,
          price: variant.price,
          compareAtPrice: variant.compareAtPrice,
          weightGrams: variant.weightGrams,
          isDefault: position === 0,
          position,
        },
      });

      for (const [optionName, value] of Object.entries(variant.options)) {
        const optionValueId = valueIds.get(`${optionName}:${value}`);
        if (!optionValueId) continue;
        await prisma.variantOptionValue.upsert({
          where: {
            variantId_optionValueId: { variantId: createdVariant.id, optionValueId },
          },
          update: {},
          create: { variantId: createdVariant.id, optionValueId },
        });
      }

      /**
       * Real inventory rows. Without these every variant reads as zero
       * available and checkout refuses the order — availability is
       * quantity − reserved, and a variant with no rows is treated as no stock
       * rather than infinite.
       *
       * One variant is seeded at zero on purpose, so the out-of-stock path is
       * reachable without editing data by hand.
       */
      await prisma.inventoryItem.upsert({
        where: {
          variantId_warehouseId: { variantId: createdVariant.id, warehouseId: warehouse.id },
        },
        update: {},
        create: {
          variantId: createdVariant.id,
          warehouseId: warehouse.id,
          quantity: variant.stock,
          reserved: 0,
          reorderLevel: 5,
        },
      });
    }
  }

  /**
   * The seed writes variants directly rather than through
   * `ProductPrismaRepository`, so it also has to maintain the denormalised
   * `products.minPrice` the price sort orders by. Left null, every seeded
   * product would sort last under "price: low to high" — a broken sort that
   * looks like a broken *seed*, which is a slow thing to diagnose.
   */
  await prisma.$executeRaw`
    UPDATE products p
    SET "minPrice" = sub.min_price
    FROM (
      SELECT "productId", MIN(price) AS min_price
      FROM product_variants
      WHERE "isActive" = true
      GROUP BY "productId"
    ) AS sub
    WHERE p.id = sub."productId"
  `;

  // ---- Coupons ------------------------------------------------------------
  const now = new Date();
  const nextYear = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

  await prisma.coupon.upsert({
    where: { code: 'WELCOME10' },
    update: {},
    create: {
      code: 'WELCOME10',
      description: '10% off your first order, up to ₹200',
      type: CouponType.PERCENTAGE,
      value: 10,
      minCartValue: 500,
      maxDiscount: 200,
      perUserLimit: 1,
      firstOrderOnly: true,
      applicableCategoryIds: [],
      startsAt: now,
      expiresAt: nextYear,
    },
  });

  await prisma.coupon.upsert({
    where: { code: 'FREESHIP' },
    update: {},
    create: {
      code: 'FREESHIP',
      description: 'Free delivery, any order',
      type: CouponType.FREE_SHIPPING,
      value: 0,
      minCartValue: 0,
      perUserLimit: 5,
      applicableCategoryIds: [],
      startsAt: now,
      expiresAt: nextYear,
    },
  });

  console.log('  3 products, 7 variants, 2 coupons, 3 accounts');
  console.log('\nSign in with:');
  console.log('  customer@sell-buy.local / Customer@12345');
  console.log('  seller@sell-buy.local   / Seller@12345');
  console.log('  admin@sell-buy.local    / Admin@12345');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
