import { db } from '../../utils/db';
import { products, orders, orderItems, categories } from '../../database/schema';
import { eq, sql, count, sum, desc } from 'drizzle-orm';
import { requireAdmin } from '../../utils/session';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  // Product stats
  const allProducts = await db
    .select({
      id: products.id,
      stock: products.stock,
      category: categories.name,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id));

  const totalProducts = allProducts.length;
  const lowStockProducts = allProducts.filter((p) => (p.stock ?? 0) <= 5).length;

  const categoryCounts: Record<string, number> = {};
  for (const p of allProducts) {
    const cat = p.category || 'Bez kategorie';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  }

  // Order stats
  const allOrders = await db.select().from(orders);
  const totalOrders = allOrders.length;
  const totalRevenue = allOrders
    .filter((o) => o.paymentStatus === 'paid')
    .reduce((sum, o) => sum + o.totalPrice, 0);
  const pendingOrders = allOrders.filter((o) => o.status === 'pending').length;
  const paidOrders = allOrders.filter((o) => o.paymentStatus === 'paid').length;
  const shippedOrders = allOrders.filter((o) => o.status === 'shipped').length;
  const deliveredOrders = allOrders.filter((o) => o.status === 'delivered').length;
  const cancelledOrders = allOrders.filter((o) => o.status === 'cancelled').length;

  // Customer stats
  const customerMap = new Map<string, { name: string; email: string; orders: number; totalSpent: number }>();
  for (const order of allOrders) {
    const existing = customerMap.get(order.customerEmail);
    if (existing) {
      existing.orders++;
      if (order.paymentStatus === 'paid') existing.totalSpent += order.totalPrice;
    } else {
      customerMap.set(order.customerEmail, {
        name: order.customerName,
        email: order.customerEmail,
        orders: 1,
        totalSpent: order.paymentStatus === 'paid' ? order.totalPrice : 0,
      });
    }
  }

  // Recent orders (top 5) with their items
  const recentOrdersRaw = await db
    .select()
    .from(orders)
    .orderBy(desc(orders.createdAt))
    .limit(5);

  const recentOrders = await Promise.all(
    recentOrdersRaw.map(async (order) => {
      const items = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id));
      return { ...order, items };
    })
  );

  return {
    totalOrders,
    totalRevenue,
    pendingOrders,
    paidOrders,
    shippedOrders,
    deliveredOrders,
    cancelledOrders,
    totalProducts,
    lowStockProducts,
    totalCustomers: customerMap.size,
    categoryCounts,
    recentOrders,
  };
});
