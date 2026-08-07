    <script setup lang="ts">
import { ref } from 'vue'
import { Icon } from '@iconify/vue'

const email = ref('')
const state = ref<'idle' | 'loading' | 'done' | 'error'>('idle')
const errorMsg = ref('')

const submit = async () => {
  if (state.value === 'loading') return
  errorMsg.value = ''
  state.value = 'loading'
  try {
    await $fetch('/api/newsletter', { method: 'POST', body: { email: email.value } })
    state.value = 'done'
    email.value = ''
  } catch (e: any) {
    state.value = 'error'
    errorMsg.value = e?.data?.statusMessage || 'Něco se pokazilo. Zkus to prosím znovu.'
  }
}
</script>

<template>
  <section class="nl-section">
    <div class="nl-card">
      <div class="nl-ring nl-ring--a" />
      <div class="nl-ring nl-ring--b" />

      <div class="nl-content">
        <div class="nl-eyebrow">— Newsletter</div>
        <h2 class="nl-title">Nezmeškej nový kousek ✦</h2>
        <p class="nl-desc">
          Každý originál je jen jednou. Nech nám email a dáme ti vědět, když
          přibydou nové kousky nebo poběží něco extra.
        </p>

        <form v-if="state !== 'done'" class="nl-form" @submit.prevent="submit">
          <div class="nl-input-wrap">
            <Icon icon="mdi:email-outline" class="nl-input-icon" height="20" />
            <input
              v-model="email"
              type="email"
              required
              autocomplete="email"
              placeholder="tvuj@email.cz"
              class="nl-input"
              :disabled="state === 'loading'"
            >
          </div>
          <button type="submit" class="nl-btn" :disabled="state === 'loading'">
            <Icon v-if="state === 'loading'" icon="mdi:loading" class="animate-spin" height="18" />
            <span>{{ state === 'loading' ? 'Odesílám…' : 'Odebírat' }}</span>
            <Icon v-if="state !== 'loading'" icon="lucide:arrow-right" height="17" />
          </button>
        </form>

        <div v-else class="nl-done">
          <Icon icon="mdi:check-circle" height="22" />
          <span>Hotovo! Tvůj email je v naší kosmické databázi. 💌</span>
        </div>

        <p v-if="state === 'error'" class="nl-error">{{ errorMsg }}</p>
        <p class="nl-fineprint">
          Žádný spam. Přihlášením souhlasíš se zasíláním novinek —
          <NuxtLink to="/newsletter/odhlaseni" class="nl-fineprint-link">odhlásit</NuxtLink>
          se můžeš kdykoliv. Podrobnosti v
          <NuxtLink to="/ochrana-osobnich-udaju" class="nl-fineprint-link">zásadách ochrany údajů</NuxtLink>.
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.nl-section {
  max-width: 1400px;
  margin: 0 auto;
  padding: 1rem 1rem 2.5rem;
}
@media (min-width: 768px) {
  .nl-section { padding: 2rem 2rem 3.5rem; }
}

.nl-card {
  position: relative;
  overflow: hidden;
  border-radius: 16px;
  padding: 2rem 1.5rem;
  background: var(--pop-panel, #331825);
  border: 2px solid var(--pop-ink, #14231a);
  box-shadow: 6px 6px 0 rgba(20, 35, 26, 0.85);
}
@media (min-width: 768px) {
  .nl-card { padding: 3rem 3rem; }
}

/* Flat zine accent bars instead of blurred blobs */
.nl-ring {
  position: absolute;
  pointer-events: none;
}
.nl-ring--a {
  width: 120px; height: 120px; border-radius: 50%;
  top: -60px; right: -30px;
  background: var(--pop-pink, #E7488B);
  opacity: 0.9;
}
.nl-ring--b {
  width: 90px; height: 90px; border-radius: 50%;
  bottom: -46px; left: -24px;
  background: var(--pop-lime, #B9E14B);
  opacity: 0.85;
}

.nl-content { position: relative; max-width: 620px; }

.nl-eyebrow {
  font-family: var(--font-mono, monospace);
  font-size: 0.7rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--pop-pink, #E7488B);
  font-weight: 700;
  margin-bottom: 0.75rem;
}
.nl-title {
  font-family: var(--font-zine, system-ui);
  font-weight: 800;
  font-size: 1.9rem;
  line-height: 0.95;
  letter-spacing: -0.02em;
  text-transform: uppercase;
  color: #F0E7D2;
  margin: 0 0 0.75rem;
}
@media (min-width: 768px) {
  .nl-title { font-size: 2.6rem; }
}
.nl-desc {
  font-family: 'Manrope', system-ui;
  font-size: 0.95rem;
  line-height: 1.6;
  color: rgba(251, 244, 234, 0.72);
  margin: 0 0 1.5rem;
}

.nl-form {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
@media (min-width: 560px) {
  .nl-form { flex-direction: row; }
}

.nl-input-wrap {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
}
.nl-input-icon {
  position: absolute;
  left: 1rem;
  color: rgba(251, 244, 234, 0.45);
}
.nl-input {
  width: 100%;
  padding: 0.9rem 1rem 0.9rem 2.85rem;
  border-radius: 10px;
  background: #fbf7ee;
  border: 2px solid var(--pop-ink, #14231a);
  color: var(--pop-ink, #14231a);
  font-family: var(--font-mono, monospace);
  font-size: 1rem;
  transition: box-shadow 0.2s ease;
}
.nl-input::placeholder { color: rgba(20, 35, 26, 0.4); }
.nl-input:focus {
  outline: none;
  box-shadow: 0 0 0 3px var(--pop-pink, #E7488B);
}
.nl-input-icon { color: rgba(20, 35, 26, 0.4); }

.nl-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.9rem 1.6rem;
  border-radius: 10px;
  border: 2px solid var(--pop-cream, #F0E7D2);
  cursor: pointer;
  background: var(--pop-pink, #E585AA);
  color: var(--pop-ink, #14231a);
  font-family: var(--font-mono, monospace);
  font-weight: 700;
  font-size: 0.78rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  white-space: nowrap;
  box-shadow: 4px 4px 0 rgba(240, 231, 210, 0.35);
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.nl-btn:hover:not(:disabled) {
  transform: translate(-1px, -1px);
  box-shadow: 5px 5px 0 rgba(240, 231, 210, 0.5);
}
.nl-btn:active:not(:disabled) { transform: translate(3px, 3px); box-shadow: 1px 1px 0 rgba(240, 231, 210, 0.5); }
.nl-btn:disabled { opacity: 0.7; cursor: default; }

.nl-done {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  color: #7ff0c0;
  font-family: 'Manrope', system-ui;
  font-weight: 600;
  font-size: 0.98rem;
}
.nl-error {
  margin: 0.7rem 0 0;
  color: #ff9db8;
  font-family: 'Manrope', system-ui;
  font-size: 0.85rem;
}
.nl-fineprint {
  margin: 0.9rem 0 0;
  font-family: 'Manrope', system-ui;
  font-size: 0.75rem;
  line-height: 1.6;
  color: rgba(251, 244, 234, 0.4);
  max-width: 46ch;
}
.nl-fineprint-link {
  color: rgba(251, 244, 234, 0.7);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.nl-fineprint-link:hover { color: #ffffff; }
</style>
