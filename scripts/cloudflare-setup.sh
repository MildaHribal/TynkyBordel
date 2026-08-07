#!/usr/bin/env bash
#
# Cloudflare setup for tynkybordel.shop — makes the site fast & secure.
#
# 1. Create an API token: Cloudflare dashboard → My Profile → API Tokens →
#    Create Token → "Create Custom Token". Give it these permissions, scoped to
#    the zone tynkybordel.shop:
#       Zone · Zone Settings · Edit
#       Zone · Cache Rules   · Edit
#       Zone · Zone WAF      · Edit
#       Zone · Zone          · Read
# 2. Run:  CF_API_TOKEN=your_token_here bash scripts/cloudflare-setup.sh
#
# Everything here is safe/reversible. HSTS is intentionally left OUT (enable it
# by hand once you've confirmed HTTPS works everywhere — it's hard to undo).

set -euo pipefail

DOMAIN="tynkybordel.shop"
API="https://api.cloudflare.com/client/v4"
TOKEN="${CF_API_TOKEN:-}"

if [ -z "$TOKEN" ]; then
  echo "❌ Missing CF_API_TOKEN. Run: CF_API_TOKEN=xxx bash scripts/cloudflare-setup.sh"
  exit 1
fi

cf() { curl -s -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" "$@"; }
ok() { python3 -c "import sys,json;d=json.load(sys.stdin);print('  ✓' if d.get('success') else '  ✗ '+json.dumps(d.get('errors')))"; }

echo "→ Finding zone id for $DOMAIN ..."
ZONE=$(cf "$API/zones?name=$DOMAIN" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['result'][0]['id'] if d.get('result') else '')")
if [ -z "$ZONE" ]; then echo "❌ Zone not found (check token/domain)."; exit 1; fi
echo "  zone = $ZONE"

echo "→ Applying zone settings (speed + security) ..."
set_setting() {
  echo -n "  $1 = $2 "
  cf -X PATCH "$API/zones/$ZONE/settings/$1" --data "{\"value\":\"$2\"}" | ok
}
set_setting ssl full                      # Full (NOT Strict): encrypts CF→origin but
                                          # doesn't validate the origin cert. Strict
                                          # caused a 526 outage (origin cert didn't
                                          # validate). Switch to `strict` ONLY after
                                          # confirming Caddy serves a publicly-valid LE cert.
set_setting always_use_https on
set_setting min_tls_version 1.2
set_setting tls_1_3 on
set_setting automatic_https_rewrites on
set_setting brotli on
set_setting early_hints on
set_setting "0rtt" on
set_setting http3 on
set_setting rocket_loader off             # OFF — Rocket Loader breaks Vue hydration
set_setting security_level medium
set_setting always_online on              # serve a cached copy if the VPS is down
set_setting crawler_hints on              # tell search engines when content changes (SEO/AI discovery)

echo "→ Tiered Cache (fewer origin hits) ..."
echo -n "  tiered_caching "
cf -X PATCH "$API/zones/$ZONE/argo/tiered_caching" --data '{"value":"on"}' | ok || true

echo "→ Cache rule for /_nuxt/* and /_ipx/* (immutable assets & images) ..."
echo -n "  cache_settings ruleset "
cf -X PUT "$API/zones/$ZONE/rulesets/phases/http_request_cache_settings/entrypoint" --data '{
  "rules": [
    {
      "action": "set_cache_settings",
      "expression": "(starts_with(http.request.uri.path, \"/api/\"))",
      "description": "NEVER cache API/auth — caching /api/auth/get-session breaks login",
      "enabled": true,
      "action_parameters": { "cache": false }
    },
    {
      "action": "set_cache_settings",
      "expression": "(starts_with(http.request.uri.path, \"/_nuxt/\")) or (starts_with(http.request.uri.path, \"/_ipx/\")) or (starts_with(http.request.uri.path, \"/pwa/\"))",
      "description": "Cache Nuxt build assets and optimized images",
      "enabled": true,
      "action_parameters": {
        "cache": true,
        "edge_ttl": { "mode": "respect_origin" },
        "browser_ttl": { "mode": "respect_origin" }
      }
    }
  ]
}' | ok || true

echo "→ Rate limit on /api/auth/* (brute-force protection: 20 req / min / IP) ..."
echo -n "  ratelimit ruleset "
cf -X PUT "$API/zones/$ZONE/rulesets/phases/http_ratelimit/entrypoint" --data '{
  "rules": [{
    "action": "block",
    "expression": "(starts_with(http.request.uri.path, \"/api/auth/\"))",
    "description": "Rate limit auth endpoints",
    "enabled": true,
    "ratelimit": {
      "characteristics": ["ip.src", "cf.colo.id"],
      "period": 60,
      "requests_per_period": 20,
      "mitigation_timeout": 60
    }
  }]
}' | ok || true

# Bot Fight Mode is intentionally OFF: on the free plan it's a blunt instrument
# that can challenge AI crawlers (GPTBot, ClaudeBot, PerplexityBot…) and hurt
# discoverability, which the shop WANTS. Brute-force protection is handled by the
# /api/auth rate-limit above instead.
echo "→ Bot Fight Mode (OFF — keep AI crawlers welcome) ..."
echo -n "  bot_fight_mode "
cf -X PUT "$API/zones/$ZONE/bot_management" --data '{"fight_mode": false}' | ok || echo "  (skip — toggle manually in Security → Bots if this failed)"

echo ""
echo "✅ Done. Still do by hand in the dashboard (can't be safely scripted):"
echo "   • HSTS  (SSL/TLS → Edge Certificates) — enable AFTER confirming https works everywhere"
echo "   • Lock /admin behind Zero Trust Access (Access → Applications) for your e-mail"
