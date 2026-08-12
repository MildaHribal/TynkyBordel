<script setup lang="ts">
import Navbar from "~/components/Navbar.vue";
import CartDrawer from "~/components/CartDrawer.vue";

import { BUSINESS } from "~~/shared/shop";
</script>

<template>
  <div class="trippy-shell min-h-screen relative overflow-x-clip">
    <!-- Main content -->
    <div class="relative z-10">
      <Navbar />
      <CartDrawer />
      <main>
        <slot />
      </main>

      <!-- Footer -->
      <footer class="site-footer">
        <div class="site-footer-inner">
          <!-- Brand row: identity on the left, newsletter signup on the right.
               The signup used to be a full-bleed band above this row with a
               display-sized heading, which read as a separate section shouting
               over the footer rather than part of it. -->
          <div class="footer-brand-row">
            <div class="footer-brand-block">
              <NuxtLink to="/" class="footer-brand">
                <NuxtImg src="/hero/logo-mushroom.png" alt="" class="footer-brand-logo" width="72" height="72" format="webp" quality="85" loading="lazy" />
                <span class="footer-brand-name">Týnky Bordel</span>
              </NuxtLink>
              <p class="footer-tagline">
                Ručně dělané originály
              </p>
            </div>
            <!--
              Idle rather than on-visible: it is server-rendered either way, but
              on-visible hydrates the moment its first pixel appears, so a fast
              scroller can hit the field before the submit handler is attached
              and the form does a native GET navigation instead of subscribing.
            -->
            <LazyNewsletterSignup hydrate-on-idle />
          </div>

          <!-- Link columns -->
          <div class="footer-columns">
            <div class="footer-col">
              <h2 class="footer-heading">Nakupování</h2>
              <ul class="footer-links">
                <li><NuxtLink to="/" class="footer-link">Domů</NuxtLink></li>
                <li><NuxtLink to="/#kolekce" class="footer-link">Katalog</NuxtLink></li>
                <li><NuxtLink to="/cart" class="footer-link">Košík</NuxtLink></li>
                <li><NuxtLink to="/user" class="footer-link">Můj účet</NuxtLink></li>
              </ul>
            </div>

            <div class="footer-col">
              <h2 class="footer-heading">Podpora</h2>
              <ul class="footer-links">
                <li><NuxtLink to="/obchodni-podminky" class="footer-link">Obchodní podmínky</NuxtLink></li>
                <li><NuxtLink to="/ochrana-osobnich-udaju" class="footer-link">Ochrana soukromí</NuxtLink></li>
              </ul>
            </div>

            <div class="footer-col">
              <h2 class="footer-heading">Sleduj</h2>
              <div class="footer-socials">
                <a href="https://www.instagram.com/_kristyna_aaa/" target="_blank" rel="noopener noreferrer" class="footer-social footer-social--instagram" aria-label="Instagram Kristýna">
                  <Icon name="mdi:instagram" height="18" />
                  <span>Instagram</span>
                </a>
                <a href="https://www.instagram.com/tynky_bordel/" target="_blank" rel="noopener noreferrer" class="footer-social footer-social--instagram" aria-label="Instagram Tynky Bordel">
                  <Icon name="mdi:instagram" height="18" />
                  <span>Instagram (Tynky Bordel)</span>
                </a>
                <a href="https://www.tiktok.com/@_kristyna_aaa" target="_blank" rel="noopener noreferrer" class="footer-social footer-social--tiktok" aria-label="TikTok">
                  <Icon name="ic:baseline-tiktok" height="18" />
                  <span>TikTok</span>
                </a>
                <a href="https://linktr.ee/tynky_bordel" target="_blank" rel="noopener noreferrer" class="footer-social footer-social--linktree" aria-label="Linktree">
                  <Icon name="simple-icons:linktree" height="18" />
                  <span>Linktree</span>
                </a>
              </div>
            </div>

            <div class="footer-col">
              <h2 class="footer-heading">Kontakt</h2>
              <ul class="footer-links">
                <li><a href="mailto:info@tynkybordel.shop" class="footer-link">info@tynkybordel.shop</a></li>
              </ul>
            </div>
          </div>

          <!-- Bottom bar -->
          <div class="footer-bottom">
            <div class="footer-copyright">
              © {{ new Date().getFullYear() }} {{ BUSINESS.legalName }} · Ručně dělané originály
            </div>
            <div class="footer-payments">
              <span class="footer-payments-label">Platby</span>
              <Icon name="mdi:bank-transfer" class="footer-pay-icon" height="22" />
              <Icon name="mdi:cash" class="footer-pay-icon" height="22" />
              <Icon name="mdi:qrcode" class="footer-pay-icon" height="20" />
            </div>
          </div>
        </div>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.trippy-shell {
  background: transparent;
}

/* ── Footer ──────────────────────────────────────────── */
.site-footer {
  /* Deep wine. Local to the footer because the shared palette in main.css has
     no wine token — NewsletterSignup.vue repeats this literal so the newsletter
     band and the footer read as one continuous block with no two-tone seam. */
  --footer-wine: #5A1F2E;
  /* The footer's text cream. Local and deliberately theme-invariant for the
     same reason as the wine itself: no --pop-* ink token fits, because they all
     flip and this ground never does. It is the same literal NewsletterSignup
     uses for .nl-title, so the two blocks read as one.
     The hairlines/fills below instead go through --pop-on-dark, whose value IS
     #F0E7D2 in both themes — same idea, and it already exists as a token. */
  --footer-ink: #F1EBDF;
  /* Gutter lives on a variable so .site-footer-inner and the newsletter band
     (which pads itself by the same amount) line their content up exactly. */
  --footer-gutter: 1.25rem;
  background: var(--footer-wine);
  color: var(--footer-ink);
  padding: 0 0 2rem;
  position: relative;
}
@media (min-width: 768px) {
  .site-footer { --footer-gutter: 2rem; }
}

.site-footer-inner {
  /* max-width absorbs the gutters so the text column matches .nl-card's
     own 1400px box rather than sitting 1.25rem further in. */
  max-width: calc(1400px + 2 * var(--footer-gutter));
  margin: 0 auto;
  padding: 0 var(--footer-gutter);
}

/* Brand row */
.footer-brand-block {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  align-items: flex-start;
}

.footer-brand-row {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  padding-top: 2.75rem;
  padding-bottom: 3rem;
  /* Warm cream hairlines instead of pure white: white over wine goes cool and
     dusty, and wine is lighter than the old near-black so it needs more alpha
     to stay as visible as before. */
  border-bottom: 1px solid color-mix(in srgb, var(--pop-on-dark) 16%, transparent);
}
@media (min-width: 900px) {
  .footer-brand-row {
    flex-direction: row;
    align-items: flex-start;
    justify-content: space-between;
    gap: 3rem;
  }
}
.footer-brand {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  text-decoration: none;
  color: inherit;
}
.footer-brand-logo {
  width: 44px;
  height: 44px;
  object-fit: contain;
}
.footer-brand-name {
  font-family: var(--font-zine);
  font-weight: 800;
  font-size: 1.5rem;
  letter-spacing: -0.01em;
  text-transform: uppercase;
  line-height: 1;
}
.footer-tagline {
  font-family: var(--font-body);
  font-style: italic;
  font-weight: 400;
  font-size: 1.1rem;
  line-height: 1.5;
  color: color-mix(in srgb, var(--footer-ink) 75%, transparent);
  max-width: 34ch;
  margin: 0;
}

/* Link columns */
/* Four columns now (Nakupování · Podpora · Sleduj · Kontakt). Three of them are
   short link lists but "Sleduj" is a stack of pill buttons and "Kontakt" holds a
   full e-mail address, so four across only fits on a wide viewport: one column
   on phones, two on tablets, four from 1000px. The gutters are unchanged. */
.footer-columns {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2.5rem 2rem;
  padding: 3rem 0 2.5rem;
}
@media (min-width: 560px) {
  .footer-columns { grid-template-columns: repeat(2, 1fr); }
}
@media (min-width: 1000px) {
  .footer-columns { grid-template-columns: repeat(4, 1fr); }
}

.footer-heading {
  font-family: var(--font-mono, monospace);
  font-weight: 700;
  font-size: 0.68rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  /* NOT --pop-cream: that token is the page ground and flips to near-black in
     dark mode, which would have painted these headings almost invisible on the
     wine. --pop-on-dark is the constant cream and its light value is the same
     #F0E7D2 this used to resolve to. */
  color: var(--pop-on-dark);
  margin: 0 0 1.25rem;
}

.footer-links {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}
.footer-link {
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 0.95rem;
  color: color-mix(in srgb, var(--footer-ink) 85%, transparent);
  text-decoration: none;
  transition: color 0.2s ease, transform 0.2s ease;
  display: inline-block;
}
.footer-link:hover {
  color: var(--pop-pink, #E585AA);
  transform: translateX(2px);
}

/* Socials */
.footer-socials {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.footer-social {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.55rem 0.85rem;
  border: 1px solid color-mix(in srgb, var(--pop-on-dark) 22%, transparent);
  border-radius: 9999px;
  background: color-mix(in srgb, var(--pop-on-dark) 6%, transparent);
  color: color-mix(in srgb, var(--footer-ink) 90%, transparent);
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 0.82rem;
  text-decoration: none;
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
  width: fit-content;
}
.footer-social:hover {
  background: color-mix(in srgb, var(--pop-on-dark) 14%, transparent);
  border-color: color-mix(in srgb, var(--pop-on-dark) 45%, transparent);
  transform: translateY(-2px);
  /* Deliberate literal white: the brightest possible hover on a ground that is
     dark in both themes. No token is "brighter than the cream". */
  color: #ffffff;
}
/* Brand-coloured hovers — the buttons light up in each app's own colours. */
.footer-social--instagram:hover {
  background: linear-gradient(45deg, #f09433 0%, #e6683c 22%, #dc2743 46%, #cc2366 70%, #bc1888 100%);
  border-color: transparent;
  color: #ffffff;
  box-shadow: 0 8px 20px rgba(220, 39, 67, 0.35);
}
.footer-social--tiktok:hover {
  background: #010101;
  border-color: #25f4ee;
  color: #ffffff;
  box-shadow: 0 0 14px rgba(37, 244, 238, 0.45), 0 6px 18px rgba(254, 44, 85, 0.35);
}
/* Linktree's brand green is LIGHT, so unlike the two above the label on it has
   to go dark — --pop-ink-on-accent is the token for exactly that (dark in both
   themes), and it is what every pink/lime fill in the app already uses. */
.footer-social--linktree:hover {
  background: #43e55e;
  border-color: #43e55e;
  color: var(--pop-ink-on-accent);
  box-shadow: 0 6px 18px rgba(67, 229, 94, 0.35);
}

/* Bottom bar */
.footer-bottom {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-top: 2rem;
  border-top: 1px solid color-mix(in srgb, var(--pop-on-dark) 16%, transparent);
  align-items: center;
  justify-content: space-between;
}
@media (min-width: 700px) {
  .footer-bottom { flex-direction: row; }
}
.footer-copyright {
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 0.78rem;
  /* Raised from .5: wine is a lighter backdrop than the old near-black, and
     .5 alpha dropped this small print under 4.5:1. */
  color: color-mix(in srgb, var(--footer-ink) 62%, transparent);
}
.footer-payments {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.4rem 0.9rem;
  border: 1px solid color-mix(in srgb, var(--pop-on-dark) 18%, transparent);
  border-radius: 9999px;
  background: color-mix(in srgb, var(--pop-on-dark) 6%, transparent);
}
.footer-payments-label {
  font-family: var(--font-body);
  font-weight: 700;
  font-size: 0.65rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  /* Same reason as .footer-copyright — tiny tracked-out caps need the extra
     alpha to clear 4.5:1 on wine. */
  color: color-mix(in srgb, var(--footer-ink) 62%, transparent);
  margin-right: 0.2rem;
}
.footer-pay-icon {
  color: color-mix(in srgb, var(--footer-ink) 70%, transparent);
  transition: color 0.2s ease;
}
/* Literal white for the same reason as .footer-social:hover. */
.footer-pay-icon:hover { color: #ffffff; }
</style>
