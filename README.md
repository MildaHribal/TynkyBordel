<div align="center">

# Týnky Bordel

**A handmade-goods e-shop for a Czech artist: paintings, keychains, ashtrays and more.**

[![Nuxt](https://img.shields.io/badge/Nuxt_4-00DC82?style=flat-square&logo=nuxt&logoColor=white)](https://nuxt.com)
[![Vue](https://img.shields.io/badge/Vue_3-4FC08D?style=flat-square&logo=vuedotjs&logoColor=white)](https://vuejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Drizzle](https://img.shields.io/badge/Drizzle_ORM-C5F74F?style=flat-square&logo=drizzle&logoColor=black)](https://orm.drizzle.team)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com)
[![Caddy](https://img.shields.io/badge/Caddy-1F88C0?style=flat-square&logo=caddy&logoColor=white)](https://caddyserver.com)

**[Live site: tynkybordel.shop](https://tynkybordel.shop)**

<img src="docs/screenshot.png" alt="Týnky Bordel storefront" width="820">

</div>

## About

Týnky Bordel is a real, running online shop for one-of-a-kind handmade pieces. It covers the whole flow, from the storefront and checkout through order handling and invoicing to the shop owner's admin panel. The UI is in Czech and follows Czech consumer-protection and GDPR requirements.

## Features

- **Storefront** with categories, search, product galleries and sold pieces that stay visible (marked as sold) until taken down
- **Checkout** with Packeta (Zásilkovna) pickup points, cash on delivery and bank transfer with a scannable payment QR code
- **Accounts** via e-mail/password or Google sign-in (Better Auth), with order history and cancelling of unpaid orders
- **Invoices** issued through Fakturoid and e-mailed to the customer, plus PDF invoices generated with PDFKit
- **Admin panel** for products, orders, customers, e-mail templates, SMTP settings, editable homepage text and visitor stats
- **Privacy-friendly analytics**: visits are counted server-side without cookies or stored IPs; optional PostHog only after consent
- **Newsletter** with double opt-in, transactional e-mails over SMTP, PWA manifest and SEO (sitemap, robots)

## Tech stack

| Layer | Tools |
| --- | --- |
| Frontend | Nuxt 4, Vue 3, Nuxt UI, Tailwind CSS 4, Pinia |
| Backend | Nitro server routes, Better Auth, Drizzle ORM, PostgreSQL 17 |
| Integrations | Packeta, Fakturoid, Nodemailer, PayPal (prepared, currently off) |
| Infra | Docker Compose, Caddy (auto HTTPS), Cloudflare, GitHub Actions to GHCR |

## Getting started

```bash
cp .env.production.example .env   # fill in DB, auth and SMTP values
docker compose -f docker/docker-compose.yml up -d   # local Postgres on :5435 (reads docker/.env)
npm install
npm run dev                       # http://localhost:3000
npm run seed                      # optional: sample products
```

Production runs with `docker compose -f docker-compose.prod.yml up -d --build`. Database migrations apply automatically on boot. See [DEPLOY.md](DEPLOY.md) for the full VPS setup.

## Project structure

```
app/          pages, components, composables, Pinia stores
server/api/   REST endpoints (products, orders, auth, admin, newsletter)
server/utils/ e-mail, invoices, Fakturoid, analytics, rate limiting
server/database/  Drizzle schema, SQL migrations, seed scripts
shared/       shop config shared by client and server (fees, shipping)
docker/       local Postgres for development
Caddyfile     reverse proxy config for production
```
