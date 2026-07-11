import { pgTable, serial, text, doublePrecision, integer, timestamp, jsonb, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

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
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ── Order Items ─────────────────────────────────────────────────────────────────
export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  productId: integer('product_id').references(() => products.id),
  title: text('title').notNull(),
  price: doublePrecision('price').notNull(),
  quantity: integer('quantity').notNull().default(1),
  image: text('image'),
});

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
