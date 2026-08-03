<script setup lang="ts">
import { Icon } from '@iconify/vue'

// Analytics stays off until "Souhlasím" is clicked — see useCookieConsent.
const { needsDecision, accept, reject } = useCookieConsent()
</script>

<template>
  <Transition name="cookie-slide">
    <div v-if="needsDecision" class="cookie-bar" role="dialog" aria-live="polite" aria-label="Souhlas s cookies">
      <div class="cookie-inner">
        <div class="cookie-icon" aria-hidden="true">
          <Icon icon="mdi:cookie-outline" height="22" />
        </div>

        <div class="cookie-text">
          <p class="cookie-title">Můžeme měřit návštěvnost?</p>
          <p class="cookie-desc">
            Pro provoz e-shopu (košík, přihlášení) používáme jen nezbytné úložiště — to běží vždy.
            Navíc bychom rádi anonymně měřili, jak se ti web používá, abychom ho mohli vylepšovat.
            Bez tvého souhlasu žádnou analytiku nespouštíme.
            <NuxtLink to="/ochrana-osobnich-udaju" class="cookie-link">Více v zásadách ochrany údajů</NuxtLink>.
          </p>
        </div>

        <div class="cookie-actions">
          <button type="button" class="cookie-btn cookie-btn--ghost" @click="reject">
            Jen nezbytné
          </button>
          <button type="button" class="cookie-btn cookie-btn--primary" @click="accept">
            Souhlasím
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.cookie-bar {
  position: fixed;
  z-index: 9999;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 0.75rem;
  padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
  pointer-events: none;
}

.cookie-inner {
  pointer-events: auto;
  max-width: 1100px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.15rem 1.25rem;
  background: #1a0f28;
  color: #F1EBDF;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 1.15rem;
  box-shadow: 0 18px 50px rgba(10, 4, 20, 0.45);
}
@media (min-width: 860px) {
  .cookie-inner {
    flex-direction: row;
    align-items: center;
    gap: 1.5rem;
    padding: 1.25rem 1.6rem;
  }
}

.cookie-icon {
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  border-radius: 9999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #ffc9de;
}

.cookie-text { flex-grow: 1; min-width: 0; }

.cookie-title {
  font-family: 'Manrope', system-ui;
  font-weight: 700;
  font-size: 0.95rem;
  margin: 0 0 0.3rem;
  color: #ffffff;
}

.cookie-desc {
  font-family: 'Manrope', system-ui;
  font-weight: 500;
  font-size: 0.82rem;
  line-height: 1.55;
  color: rgba(241, 235, 223, 0.72);
  margin: 0;
  max-width: 70ch;
}

.cookie-link {
  color: #ffc9de;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.cookie-link:hover { color: #ffffff; }

.cookie-actions {
  display: flex;
  gap: 0.6rem;
  flex-shrink: 0;
}
@media (max-width: 859px) {
  .cookie-actions .cookie-btn { flex: 1; }
}

.cookie-btn {
  padding: 0.7rem 1.35rem;
  border-radius: 9999px;
  font-family: 'Manrope', system-ui;
  font-weight: 700;
  font-size: 0.78rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
}
.cookie-btn:hover { transform: translateY(-1px); }

.cookie-btn--ghost {
  background: transparent;
  color: rgba(241, 235, 223, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.22);
}
.cookie-btn--ghost:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.4);
  color: #ffffff;
}

.cookie-btn--primary {
  background: #F1EBDF;
  color: #1a0f28;
  border: 1px solid transparent;
}
.cookie-btn--primary:hover { background: #ffffff; }

/* Slide up on first paint; slide away once a choice is made. */
.cookie-slide-enter-active,
.cookie-slide-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.cookie-slide-enter-from,
.cookie-slide-leave-to {
  opacity: 0;
  transform: translateY(14px);
}

@media (prefers-reduced-motion: reduce) {
  .cookie-slide-enter-active,
  .cookie-slide-leave-active { transition: none; }
  .cookie-btn:hover { transform: none; }
}
</style>
