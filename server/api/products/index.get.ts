import { db } from '../../utils/db';
import { products, categories } from '../../database/schema';
import { and, eq, or, sql, desc, gt, type SQLWrapper } from 'drizzle-orm';

// Diakritika: `ilike` je v Postgresu case-insensitive, ale NE accent-insensitive,
// takže „klicenka" nikdy nenašlo „Klíčenka" — a to je u českého shopu většina
// dotazů. Extension `unaccent` na DB nainstalovaná není a novou migraci sem
// tahat nechceme, takže obě strany srovnáme ručně: DB stranu přes translate(),
// hledaný výraz v JS přes NFD. Oba řetězce musí mít stejný počet znaků!
const ACCENTED = 'áàâäãåčćďéèêëěíìîïĺľňñóòôöõřŕšśťúùûüůýÿžźż';
const PLAIN    = 'aaaaaaccdeeeeeiiiillnnooooorrsstuuuuuyyzzz';

/** Sloupec převedený na malá písmena bez diakritiky (NULL → prázdný řetězec). */
const fold = (column: SQLWrapper) =>
  sql`translate(lower(coalesce(${column}, '')), ${ACCENTED}, ${PLAIN})`;

/** Totéž pro vstup od uživatele — NFD rozloží znak na písmeno + háček/čárku. */
const foldInput = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** `%` a `_` jsou v LIKE zástupné znaky, ve vyhledávaném textu je chceme doslova. */
const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&');

export default defineCachedEventHandler(async (event) => {
  const query = getQuery(event);
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  // Filter by category NAME (matches what the product detail page passes when
  // fetching "podobné kousky"). Without this the `category` param was ignored
  // and the similar-products row was just the newest 8 products.
  const category = typeof query.category === 'string' ? query.category.trim() : '';

  const conditions = [];
  // Public storefront: hide sold-out products (stock reached 0). Admin has its
  // own endpoints, so out-of-stock items stay visible/editable there.
  conditions.push(gt(products.stock, 0));
  // Každé slovo z dotazu musí sedět (v názvu, popisu nebo kategorii) — díky tomu
  // najde „meduza klicenka" i „Klíčenka Medúza z hlubin", nejen ve správném pořadí.
  const terms = search ? foldInput(search).split(/\s+/).filter(Boolean).slice(0, 6) : [];
  for (const term of terms) {
    const needle = `%${escapeLike(term)}%`;
    conditions.push(or(
      sql`${fold(products.name)} like ${needle}`,
      sql`${fold(products.description)} like ${needle}`,
      sql`${fold(categories.name)} like ${needle}`,
    ));
  }
  if (category) {
    conditions.push(eq(categories.name, category));
  }
  const whereClause = conditions.length ? and(...conditions) : undefined;

  let queryBuilder = db
    .select({
      id: products.id,
      title: products.name,
      name: products.name,
      slug: products.slug,
      description: products.description,
      price: products.price,
      image: products.image,
      images: products.images,
      stock: products.stock,
      category: categories.name,
      categoryId: products.categoryId,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(whereClause)
    .$dynamic();

  if (query.random === 'true') {
    queryBuilder = queryBuilder.orderBy(sql`RANDOM()`);
  } else if (terms.length) {
    // Shoda v názvu je pro uživatele relevantnější než zmínka kdesi v popisu.
    const phrase = `%${escapeLike(foldInput(search))}%`;
    queryBuilder = queryBuilder.orderBy(
      sql`(${fold(products.name)} like ${phrase}) desc`,
      desc(products.id),
    );
  } else {
    queryBuilder = queryBuilder.orderBy(desc(products.id));
  }

  if (query.limit && !isNaN(Number(query.limit))) {
    queryBuilder = queryBuilder.limit(Number(query.limit));
  }

  return await queryBuilder;
}, {
  maxAge: 60 * 60,
  // Search is typed live in the navbar, so its result set is effectively
  // unbounded and each distinct query would occupy its own cache entry for an
  // hour — a slow memory leak that buys nothing, since almost no two shoppers
  // type the same string. Worse, a stale hit can offer a product that has since
  // sold out, and clicking it 404s. Listing requests (the homepage grid, the
  // category rows) are the ones that repeat and are worth caching, so only
  // those get an entry.
  shouldBypassCache: event => Boolean((getQuery(event).search as string | undefined)?.trim()),
  shouldInvalidateCache: event => Boolean((getQuery(event).search as string | undefined)?.trim()),
});
