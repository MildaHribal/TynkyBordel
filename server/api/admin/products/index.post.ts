import { db } from '../../../utils/db';
import { products, categories } from '../../../database/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '../../../utils/session';

function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const body = await readBody(event);

  if (!body.title || !body.price) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Název a cena jsou povinné',
    });
  }

  try {
    // Resolve category – prioritize categoryId if provided
    let categoryId: number | null = null;
    if (body.categoryId) {
      categoryId = Number(body.categoryId);
    } else if (body.category) {
      const existing = await db
        .select()
        .from(categories)
        .where(eq(categories.name, body.category));

      if (existing.length > 0) {
        categoryId = existing[0].id;
      } else {
        const [newCat] = await db
          .insert(categories)
          .values({ name: body.category, slug: slugify(body.category) })
          .returning();
        categoryId = newCat.id;
      }
    }

    // Generate a unique slug (append timestamp if collision)
    let slug = slugify(body.title);
    const existingSlug = await db.select().from(products).where(eq(products.slug, slug));
    if (existingSlug.length > 0) {
      slug = `${slug}-${Date.now()}`;
    }

    // Random, non-sequential public product number (retried on the rare collision).
    const randomProductNumber = () => {
      let out = String(1 + Math.floor(Math.random() * 9)); // no leading zero
      for (let i = 1; i < 8; i++) out += Math.floor(Math.random() * 10);
      return out;
    };

    let product;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        [product] = await db
          .insert(products)
          .values({
            productNumber: randomProductNumber(),
            name: body.title,
            slug,
            description: body.description || '',
            price: Number(body.price),
            image: body.image || '',
            images: body.images || [],
            stock: Number(body.stock) || 0,
            categoryId,
          })
          .returning();
        break;
      } catch (err: any) {
        // 23505 = unique violation; only retry when it's the product_number that clashed.
        if (err?.code === '23505' && String(err?.constraint_name || '').includes('product_number') && attempt < 4) continue;
        throw err;
      }
    }
    if (!product) throw createError({ statusCode: 500, statusMessage: 'Produkt se nepodařilo vytvořit' });

    return {
      ...product,
      title: product.name,
      category: body.category || null,
    };
  } catch (error: any) {
    console.error('Error creating product:', error);
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Chyba při vytváření produktu',
    });
  }
});
