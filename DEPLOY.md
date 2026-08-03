# Deploy — tynkybordel.shop

Production stack: Nuxt 4 + Postgres 17 + Caddy (auto Let's Encrypt), all in Docker Compose.

## Prerequisites on the VPS

1. Ubuntu 22.04+ / Debian 12+ / anything with a modern kernel
2. Ports **80** and **443** open to the internet
3. **DNS pointing to the VPS**:
   - In Cloudflare add:
     - `A  @   <VPS_IPv4>` (Proxy: **on** — orange cloud OK)
     - `A  www <VPS_IPv4>` (Proxy: on)
   - SSL/TLS mode in Cloudflare → **Full (strict)**

## First-time VPS setup

```bash
# 1. Docker + compose plugin
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# 2. Clone the project
git clone <your-repo-url> shopik
cd shopik

# 3. Fill in production env
cp .env.production.example .env.production
nano .env.production          # set POSTGRES_PASSWORD, BETTER_AUTH_SECRET,
                              # Google OAuth, SMTP, Packeta keys…

# 4. Build & start
docker compose -f docker-compose.prod.yml up -d --build

# 5. Seed initial products (only the first time, or after wiping the DB)
docker compose -f docker-compose.prod.yml exec app npm run seed
```

**Migrations run themselves.** `server/plugins/01-run-migrations.ts` applies every
pending file in `server/database/migrations/` on each boot in production, so a
plain code deploy is enough to migrate. The manual `npx tsx server/database/migrate.ts`
step is only for debugging (set `DISABLE_BOOT_MIGRATE=true` to turn the automatic
run off).

Caddy will request a Let's Encrypt cert on first request to `https://tynkybordel.shop`. You'll see the cert issuance in `docker compose logs caddy`.

## Before the first real customer

- [ ] Fill in `shared/shop.ts` — IČO and the registered address appear on the
      terms, privacy and returns pages. Empty values render as visible
      `[DOPLNIT: …]` markers.
- [ ] Set `PAYPAL_ENV=live` with live credentials (sandbox takes no real money).
- [ ] Send yourself a test order and confirm both emails arrive (customer
      confirmation + the shop notification).
- [ ] Set up the nightly backup cron (see Backups below).

## Google OAuth

After DNS + HTTPS are live, edit the Google Cloud OAuth client:
- Authorized JavaScript origins: `https://tynkybordel.shop`
- Authorized redirect URIs: `https://tynkybordel.shop/api/auth/callback/google`

## Deploy updates

A push to `master` triggers `.github/workflows/build.yml`, which builds the image,
pushes it to GHCR, calls `DEPLOY_WEBHOOK_URL` on the VPS and then purges the
Cloudflare cache. Pending migrations are applied by the app itself on restart.

To deploy by hand instead:

```bash
cd shopik
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Zero downtime is not configured — compose will restart the app container in ~5s during `up -d --build`. For a small artisan shop that's fine.

The GitHub Actions secrets involved: `DEPLOY_WEBHOOK_URL`, `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ZONE_ID`. Each step skips itself (without failing) when its secret is
missing.

## Backups

The DB lives in the `pgdata` docker volume. Uploaded images live in `uploads`.
Losing either means losing every order and every product photo, so this is not
optional.

`scripts/backup.sh` dumps both and prunes anything older than 30 days. Install it
as a nightly cron:

```bash
chmod +x scripts/backup.sh

# Every night at 03:15. Adjust the project path if you cloned elsewhere.
crontab -e
15 3 * * * cd /home/$USER/shopik && ./scripts/backup.sh >> /var/log/shopik-backup.log 2>&1
```

Backups land in `./backups/`. **Copy them off the VPS** — a backup on the same
disk doesn't survive the failure it exists for. Restore with:

```bash
gunzip -c backups/db-20260727.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres psql -U shopik shopik
```

## Common issues

- **Caddy fails to get cert** → Cloudflare "orange cloud" must be on and SSL mode "Full (strict)". Or temporarily set to "Full" if Caddy hasn't got a cert yet — LE HTTP-01 challenge needs to reach port 80.
- **Emails not going out** → Check `docker compose logs app | grep mail`. Seznam requires SMTP_SECURE=true and port 465. Try authenticating manually first.
- **Uploaded images disappear after rebuild** → confirm the `uploads` named volume in `docker-compose.prod.yml` mounts to `/app/.output/public/uploads`.

## Local dev (unchanged)

```bash
docker compose -f docker/docker-compose.yml up -d   # postgres only on :5435
npm run dev                                          # nuxt on :3000
```
