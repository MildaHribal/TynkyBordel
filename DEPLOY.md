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
- **Emails not going out** → **Fix it in the browser first: `/admin/emails/smtp`.**
  That page stores the SMTP host, login, password and From address in the database
  (password encrypted with `BETTER_AUTH_SECRET`), and those values take precedence
  over the `SMTP_*` env vars. It exists because the container is built by CI and
  `.env.production` needs SSH — so without it, an env var that never reached the
  container leaves email permanently broken with no way to repair it. The page
  verifies the connection on save and sends a test message on request.

  With SSH access, the app also runs an SMTP self-check on every boot:

  ```bash
  docker compose -f docker-compose.prod.yml logs app | grep '\[mail\]'
  ```

  - `[mail] DISABLED — no SMTP host/user in app_settings or the environment`
    → neither source is configured. Either set it at `/admin/emails/smtp`, or fix
    the env vars — in which case there are two usual reasons they didn't arrive:
    1. They were added to **`.env`** instead of **`.env.production`**. Only
       `.env.production` is passed to the app (`env_file:`); the plain `.env` is
       just Compose's variable-interpolation file for `${POSTGRES_PASSWORD}`.
    2. The container was **restarted** rather than **recreated**. `docker compose
       restart` does NOT reload `env_file` — you must run
       `docker compose -f docker-compose.prod.yml up -d`.

    Confirm what the container actually sees:
    ```bash
    docker compose -f docker-compose.prod.yml exec app printenv | grep -E 'SMTP|MAIL_FROM'
    ```
  - `[mail] CONNECTION/LOGIN FAILED: ... code=EAUTH` → wrong `SMTP_PASS`, or SMTP
    access is disabled for the mailbox in Seznam's settings.
  - `[mail] CONNECTION/LOGIN FAILED: ... code=ETIMEDOUT/ECONNREFUSED` → the VPS
    cannot reach `smtp.seznam.cz:465`. Many providers block outbound SMTP ports by
    default; verify with
    `docker compose -f docker-compose.prod.yml exec app node -e "require('net').connect(465,'smtp.seznam.cz').on('connect',()=>{console.log('open');process.exit(0)}).on('error',e=>{console.log('blocked',e.code);process.exit(1)})"`
    and open a support ticket if it is blocked.
  - `[mail] connection + login OK` but customers get nothing → look for the
    per-message lines. Every send now logs either `[mail] sent to …` with the
    Seznam queue id, or `[mail] SEND FAILED … code=…`.

  Seznam also requires `SMTP_SECURE=true`, port 465, and `MAIL_FROM` containing the
  same address as `SMTP_USER` — the self-check warns when they differ.
- **Uploaded images disappear after rebuild** → confirm the `uploads` named volume in `docker-compose.prod.yml` mounts to `/app/.output/public/uploads`.

## Local dev (unchanged)

```bash
docker compose -f docker/docker-compose.yml up -d   # postgres only on :5435
npm run dev                                          # nuxt on :3000
```
