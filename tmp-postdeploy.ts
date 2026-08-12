// READ-ONLY post-deploy verification. Temporary.
import postgres from 'postgres';

async function main() {
  const sql = postgres(process.env.PROD_DATABASE_URL!, { max: 1, onnotice: () => {} });

  const migs = await sql`SELECT name, applied_at FROM _migrations ORDER BY name`;
  console.log('migrations:', (migs as any[]).length);
  for (const m of (migs as any[]).slice(-3)) {
    console.log('   ', m.name, '@', new Date(m.applied_at).toISOString().slice(0, 19));
  }

  const [{ products }] = await sql`SELECT count(*)::int AS products FROM products`;
  const [{ imgs }] = await sql`SELECT count(*)::int AS imgs FROM product_images`;
  const [{ cats }] = await sql`SELECT count(*)::int AS cats FROM categories`;
  const [{ orders }] = await sql`SELECT count(*)::int AS orders FROM orders`;
  const [{ users }] = await sql`SELECT count(*)::int AS users FROM "user"`;
  console.log({ products, product_images: imgs, categories: cats, orders, users });

  // The two tables the new migrations create/alter.
  const settings = await sql`SELECT count(*)::int AS c FROM app_settings`;
  console.log('app_settings exists, rows:', (settings[0] as any).c);

  const fks = await sql`
    SELECT con.conname, pg_get_constraintdef(con.oid) AS def
    FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'reviews' AND con.contype = 'f' ORDER BY con.conname`;
  for (const f of fks as any[]) console.log('   reviews FK:', f.conname, '::', f.def);

  await sql.end();
}

main().then(() => process.exit(0)).catch((e) => { console.error('ERR', e.message); process.exit(1); });
