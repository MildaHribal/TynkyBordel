import { pgTable, serial, text, doublePrecision, integer, timestamp, jsonb, boolean, uniqueIndex, check, customType } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// Drizzle has no built-in bytea column; postgres.js maps it to/from Buffer.
const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

// ── Product images ──────────────────────────────────────────────────────────
// The encoded WebP bytes live in Postgres — the only store on this deployment
// that provably survives redeploys. The filesystem copy under
// .output/public/uploads is just an IPX cache, rebuilt from this table on
// every boot (see server/plugins/03-image-store.ts and migration 0010).
export const productImages = pgTable('product_images', {
  fileName: text('file_name').primaryKey(),
  data: bytea('data').notNull(),
  contentType: text('content_type').notNull().default('image/webp'),
  size: integer('size').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ── Better-auth: user ────────────────────────────────────────────────────────
// Better-auth expects: id (text), name, email, emailVerified (bool), image, createdAt, updatedAt
// We add custom profile fields (phone, street, city, zip) via additionalFields.
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  // Custom profile fields
  phone: text('phone'),
  street: text('street'),
  city: text('city'),
  zip: text('zip'),
  role: text('role').notNull().default('user'), // 'user' | 'admin'
  // Simple admin flag — flip to true in the DB to grant admin access.
  isAdmin: boolean('is_admin').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ── Better-auth: session ─────────────────────────────────────────────────────
export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
});

// ── Better-auth: account (oauth + email/password) ────────────────────────────
export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ── Better-auth: verification ────────────────────────────────────────────────
export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ── Categories ──────────────────────────────────────────────────────────────────
export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  parentId: integer('parent_id'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ── Products ────────────────────────────────────────────────────────────────────
export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  // Random, non-sequential public reference number (see migration 0007). The
  // serial id stays the internal PK; product_number is what humans see.
  productNumber: text('product_number').unique(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  shortDescription: text('short_description'),
  price: doublePrecision('price').notNull(),
  stock: integer('stock').notNull().default(0),
  image: text('image'),
  images: jsonb('images').$type<string[]>().default([]),
  categoryId: integer('category_id').references(() => categories.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ── Orders ──────────────────────────────────────────────────────────────────────
export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  // Customer-facing, randomized so sequential IDs don't leak order volume.
  orderNumber: text('order_number').unique(),
  // Bank-transfer variable symbol (randomized, numeric, ≤ 10 digits per SPAYD spec).
  variableSymbol: text('variable_symbol'),
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  customerName: text('customer_name').notNull(),
  customerEmail: text('customer_email').notNull(),
  customerPhone: text('customer_phone'),
  shippingAddress: text('shipping_address').notNull(),
  shippingMethod: text('shipping_method'),
  paymentMethod: text('payment_method'),
  packetaBranchId: text('packeta_branch_id'),
  packetaBranchName: text('packeta_branch_name'),
  stripeSessionId: text('stripe_session_id'),
  totalPrice: doublePrecision('total_price').notNull(),
  status: text('status').notNull().default('pending'),
  paymentStatus: text('payment_status').notNull().default('unpaid'),
  // When the payment was confirmed. Payments are NOT reconciled automatically —
  // the admin checks the bank statement and marks the order paid, which stamps
  // this. Nullable: unpaid orders (and every order created before this column
  // existed) simply have no timestamp.
  paidAt: timestamp('paid_at'),
  // When the customer ticked the terms/GDPR checkbox — evidence of consent.
  termsAcceptedAt: timestamp('terms_accepted_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ── Order Items ─────────────────────────────────────────────────────────────────
export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  // SET NULL, not the default NO ACTION: these rows already snapshot `title`,
  // `price` and `image`, so a deleted product leaves the order intact and only
  // loses its link to a product page that no longer exists. See migration 0009.
  productId: integer('product_id').references(() => products.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  price: doublePrecision('price').notNull(),
  quantity: integer('quantity').notNull().default(1),
  image: text('image'),
});

// ── Fakturoid subjects ──────────────────────────────────────────────────────────
// Maps a buyer's e-mail address to the `subject` (odběratel) we created for them
// in Fakturoid, so a repeat buyer is never duplicated over there.
//
// Why its own table rather than a column on `user`: most checkouts are guest
// checkouts — `orders.user_id` is nullable and the only identity every order is
// guaranteed to carry is `orders.customer_email`. A column on `user` would only
// ever cover registered buyers. It is deliberately NOT called `customers`: it
// holds no customer data of its own (orders keep their own name/address
// snapshot), it is purely an external-id mapping.
//
// `email` must be stored lower-cased/trimmed by the caller — the unique index is
// plain, not case-insensitive.
export const fakturoidSubjects = pgTable('fakturoid_subjects', {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  // Fakturoid subject id (numeric in API v3).
  fakturoidId: integer('fakturoid_id').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('fakturoid_subjects_email_unique_idx').on(t.email),
]);

// ── Invoices ────────────────────────────────────────────────────────────────────
// One invoice per order, created on demand when the admin clicks "Issue invoice"
// (never at checkout — the confirmation e-mail only carries a payment request).
//
// The UNIQUE INDEX on order_id is what makes issuing idempotent: two concurrent
// clicks race to INSERT and the database rejects the loser. Do not rely on an
// application-level "has this order been invoiced?" read instead — that check is
// not atomic.
//
// No monetary column lives here on purpose: the amount belongs to the order, and
// Fakturoid is the system of record for the issued document.
export const invoices = pgTable('invoices', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  // 'pending' — row claimed, Fakturoid call not finished yet
  // 'issued'  — created in Fakturoid, fakturoid_id/number/pdf_key populated
  // 'failed'  — the call failed; `error` says why, the row may be retried
  status: text('status').$type<'pending' | 'issued' | 'failed'>().notNull().default('pending'),
  // Fakturoid invoice id (numeric in API v3).
  fakturoidId: integer('fakturoid_id'),
  // Human-facing invoice number as assigned by Fakturoid, e.g. "2026-0001".
  number: text('number'),
  // Storage key of the archived PDF.
  pdfKey: text('pdf_key'),
  // When the invoice was e-mailed to the customer.
  sentAt: timestamp('sent_at'),
  // Last failure message, for the admin to see why issuing did not work.
  error: text('error'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('invoices_order_id_unique_idx').on(t.orderId),
  check('invoices_status_check', sql`${t.status} IN ('pending', 'issued', 'failed')`),
]);

// ── Reviews ─────────────────────────────────────────────────────────────────────
export const reviews = pgTable('reviews', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  userName: text('user_name').notNull(),
  rating: integer('rating').notNull(),
  comment: text('comment'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ── Email templates ─────────────────────────────────────────────────────────────
// Editable in /admin/emails. Falls back to hardcoded defaults in server/utils/email.ts
// when a row is missing.
export const emailTemplates = pgTable('email_templates', {
  key: text('key').primaryKey(), // 'created' | 'paid' | 'shipped' | 'delivered'
  subject: text('subject').notNull(),
  headline: text('headline').notNull(),
  body: text('body').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ── Favorites ───────────────────────────────────────────────────────────────────
export const favorites = pgTable('favorites', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow(),
});

// ── Relations ───────────────────────────────────────────────────────────────────
export const categoriesRelations = relations(categories, ({ many, one }) => ({
  products: many(products),
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: 'subcategory',
  }),
  subcategories: many(categories, {
    relationName: 'subcategory',
  }),
}));

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  orders: many(orders),
  reviews: many(reviews),
  favorites: many(favorites),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const ordersRelations = relations(orders, ({ many, one }) => ({
  items: many(orderItems),
  user: one(user, { fields: [orders.userId], references: [user.id] }),
  invoice: one(invoices, { fields: [orders.id], references: [invoices.orderId] }),
}));

export const invoicesRelations = relations(invoices, ({ one }) => ({
  order: one(orders, { fields: [invoices.orderId], references: [orders.id] }),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  product: one(products, { fields: [reviews.productId], references: [products.id] }),
  user: one(user, { fields: [reviews.userId], references: [user.id] }),
}));

export const favoritesRelations = relations(favorites, ({ one }) => ({
  product: one(products, { fields: [favorites.productId], references: [products.id] }),
  user: one(user, { fields: [favorites.userId], references: [user.id] }),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  reviews: many(reviews),
  favorites: many(favorites),
}));

// ── Newsletter subscribers ───────────────────────────────────────────────────
export const newsletterSubscribers = pgTable('newsletter_subscribers', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ── Runtime settings ─────────────────────────────────────────────────────────
// Config that has to be editable without SSH access to the VPS — currently the
// SMTP credentials, edited in /admin/emails/smtp. Read through
// server/utils/settings.ts, which also decrypts the values marked secret.
// Env vars remain the fallback, so nothing changes for a correctly configured box.
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
