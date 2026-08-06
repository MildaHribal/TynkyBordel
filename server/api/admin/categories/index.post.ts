import { db } from '../../../utils/db';
import { categories } from '../../../database/schema';
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

  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Název kategorie je povinný',
    });
  }

  // Optional parent — lets a new category be created as a subcategory straight
  // from the product form. Validate it exists so we never orphan a row.
  let parentId: number | null = null;
  if (body?.parentId !== undefined && body?.parentId !== null && body?.parentId !== '') {
    parentId = Number(body.parentId);
    if (!Number.isInteger(parentId) || parentId <= 0) {
      throw createError({ statusCode: 400, statusMessage: 'Neplatná nadřazená kategorie' });
    }
    const [parent] = await db.select().from(categories).where(eq(categories.id, parentId)).limit(1);
    if (!parent) {
      throw createError({ statusCode: 400, statusMessage: 'Nadřazená kategorie neexistuje' });
    }
  }

  const baseSlug = slugify(name) || 'kategorie';
  // Slugs must be unique — suffix -2, -3… on collision.
  let slug = baseSlug;
  for (let i = 2; ; i++) {
    const [clash] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug)).limit(1);
    if (!clash) break;
    slug = `${baseSlug}-${i}`;
  }

  const [category] = await db
    .insert(categories)
    .values({
      name,
      slug,
      parentId,
    })
    .returning();

  return category;
});
