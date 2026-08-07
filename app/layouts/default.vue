<script setup lang="ts">
import Navbar from "~/components/Navbar.vue";
import CartDrawer from "~/components/CartDrawer.vue";
import { Icon } from "@iconify/vue";
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
          <!-- Big brand row -->
          <div class="footer-brand-row">
            <NuxtLink to="/" class="footer-brand">
              <NuxtImg src="/hero/logo-mushroom.png" alt="" class="footer-brand-logo" width="72" height="72" format="webp" quality="85" loading="lazy" />
              <span class="footer-brand-name">Týnky Bordel</span>
            </NuxtLink>
            <p class="footer-tagline">
              Ručně dělané originály — obrazy, sochy, klíčenky.<br />
              Každý kousek je jeden na světě.
            </p>
          </div>

          <!-- Link columns -->
          <div class="footer-columns">
            <div class="footer-col">
              <h4 class="footer-heading">Nakupování</h4>
              <ul class="footer-links">
                <li><NuxtLink to="/" class="footer-link">Domů</NuxtLink></li>
                <li><NuxtLink to="/#kolekce" class="footer-link">Katalog</NuxtLink></li>
                <li><NuxtLink to="/cart" class="footer-link">Košík</NuxtLink></li>
                <li><NuxtLink to="/user" class="footer-link">Můj účet</NuxtLink></li>
              </ul>
            </div>

            <div class="footer-col">
              <h4 class="footer-heading">Podpora</h4>
              <ul class="footer-links">
                <li><NuxtLink to="/reklamace" class="footer-link">Doprava &amp; reklamace</NuxtLink></li>
                <li><NuxtLink to="/obchodni-podminky" class="footer-link">Obchodní podmínky</NuxtLink></li>
                <li><NuxtLink to="/ochrana-osobnich-udaju" class="footer-link">Ochrana soukromí</NuxtLink></li>
              </ul>
            </div>

            <div class="footer-col">
              <h4 class="footer-heading">Sleduj</h4>
              <div class="footer-socials">
                <a href="https://www.instagram.com/_kristyna_aaa/" target="_blank" rel="noopener noreferrer" class="footer-social footer-social--instagram" aria-label="Instagram Kristýna">
                  <Icon icon="mdi:instagram" height="18" />
                  <span>Instagram</span>
                </a>
                <a href="https://www.instagram.com/tynky_bordel/" target="_blank" rel="noopener noreferrer" class="footer-social footer-social--instagram" aria-label="Instagram Tynky Bordel">
                  <Icon icon="mdi:instagram" height="18" />
                  <span>Instagram (Tynky Bordel)</span>
                </a>
                <a href="https://www.tiktok.com/@_kristyna_aaa" target="_blank" rel="noopener noreferrer" class="footer-social footer-social--tiktok" aria-label="TikTok">
                  <Icon icon="ic:baseline-tiktok" height="18" />
                  <span>TikTok</span>
                </a>
              </div>
            </div>
          </div>

          <!-- Bottom bar -->
          <div class="footer-bottom">
            <div class="footer-copyright">
              © {{ new Date().getFullYear() }} {{ BUSINESS.legalName }} · Ručně dělané originály
            </div>
            <div class="footer-payments">
              <span class="footer-payments-label">Platby</span>
              <Icon icon="mdi:bank-transfer" class="footer-pay-icon" height="22" />
              <Icon icon="mdi:cash" class="footer-pay-icon" height="22" />
              <Icon icon="mdi:qrcode" class="footer-pay-icon" height="20" />
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
  margin-top: 6rem;
  background: var(--pop-panel, #331825);
  color: #F1EBDF;
  padding: 4rem 1.25rem 2rem;
  position: relative;
}
.site-footer::before {
  content: "";
  position: absolute;
  top: 0;
  inset-inline: 0;
  height: 4px;
  background: repeating-linear-gradient(
    90deg,
    var(--pop-pink, #E585AA) 0, var(--pop-pink, #E585AA) 28px,
    var(--pop-lime, #B9E14B) 28px, var(--pop-lime, #B9E14B) 56px
  );
  opacity: 0.85;
}
@media (min-width: 768px) {
  .site-footer { padding: 5.5rem 2rem 2rem; }
}

.site-footer-inner {
  max-width: 1400px;
  margin: 0 auto;
}

/* Brand row */
.footer-brand-row {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding-bottom: 3rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
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
  font-family: 'Bricolage Grotesque', system-ui;
  font-weight: 800;
  font-size: 1.5rem;
  letter-spacing: -0.01em;
  text-transform: uppercase;
  line-height: 1;
}
.footer-tagline {
  font-family: 'Fraunces', Georgia, serif;
  font-style: italic;
  font-weight: 400;
  font-size: 1.1rem;
  line-height: 1.5;
  color: rgba(241, 235, 223, 0.75);
  max-width: 34ch;
  margin: 0;
}

/* Link columns */
.footer-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2.5rem 2rem;
  padding: 3rem 0 2.5rem;
}
@media (min-width: 700px) {
  .footer-columns { grid-template-columns: repeat(3, 1fr); }
}

.footer-heading {
  font-family: var(--font-mono, monospace);
  font-weight: 700;
  font-size: 0.68rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--pop-pink, #E585AA);
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
  font-family: 'Manrope', system-ui;
  font-weight: 500;
  font-size: 0.95rem;
  color: rgba(241, 235, 223, 0.85);
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
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.03);
  color: rgba(241, 235, 223, 0.9);
  font-family: 'Manrope', system-ui;
  font-weight: 600;
  font-size: 0.82rem;
  text-decoration: none;
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
  width: fit-content;
}
.footer-social:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.3);
  transform: translateY(-2px);
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

/* Bottom bar */
.footer-bottom {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-top: 2rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  align-items: center;
  justify-content: space-between;
}
@media (min-width: 700px) {
  .footer-bottom { flex-direction: row; }
}
.footer-copyright {
  font-family: 'Manrope', system-ui;
  font-weight: 500;
  font-size: 0.78rem;
  color: rgba(241, 235, 223, 0.5);
}
.footer-payments {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.4rem 0.9rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.03);
}
.footer-payments-label {
  font-family: 'Manrope', system-ui;
  font-weight: 700;
  font-size: 0.65rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(241, 235, 223, 0.5);
  margin-right: 0.2rem;
}
.footer-pay-icon {
  color: rgba(241, 235, 223, 0.7);
  transition: color 0.2s ease;
}
.footer-pay-icon:hover { color: #ffffff; }
</style>
