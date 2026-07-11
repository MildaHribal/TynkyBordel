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
        <p class="nl-fineprint">Žádný spam, odhlásit se můžeš kdykoliv.</p>
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
  border-radius: 1.75rem;
  padding: 2rem 1.5rem;
  background: #1c0d2e;
  background-image: radial-gradient(120% 140% at 0% 0%, #35174f 0%, #1c0d2e 55%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 18px 44px rgba(28, 13, 46, 0.28);
}
@media (min-width: 768px) {
  .nl-card { padding: 3.25rem 3rem; border-radius: 2.5rem; }
}

/* Decorative gradient blobs */
.nl-ring {
  position: absolute;
  border-radius: 9999px;
  filter: blur(48px);
  opacity: 0.5;
  pointer-events: none;
}
.nl-ring--a {
  width: 260px; height: 260px;
  top: -120px; right: -60px;
  background: radial-gradient(circle, #ff5c8a, transparent 70%);
}
.nl-ring--b {
  width: 240px; height: 240px;
  bottom: -140px; left: -40px;
  background: radial-gradient(circle, #a878ff, transparent 70%);
}

.nl-content { position: relative; max-width: 620px; }

.nl-eyebrow {
  font-family: 'Manrope', system-ui;
  font-size: 0.72rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: #ffb3d0;
  font-weight: 700;
  margin-bottom: 0.75rem;
}
.nl-title {
  font-family: 'Fraunces', Georgia, serif;
  font-weight: 700;
  font-size: 1.7rem;
  line-height: 1.1;
  letter-spacing: -0.02em;
  color: #fbf4ea;
  margin: 0 0 0.75rem;
}
@media (min-width: 768px) {
  .nl-title { font-size: 2.5rem; }
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
  padding: 0.95rem 1rem 0.95rem 2.85rem;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: #fbf4ea;
  font-family: 'Manrope', system-ui;
  font-size: 1rem;
  transition: border-color 0.2s ease, background 0.2s ease;
}
.nl-input::placeholder { color: rgba(251, 244, 234, 0.4); }
.nl-input:focus {
  outline: none;
  border-color: #ff5c8a;
  background: rgba(255, 255, 255, 0.1);
}

.nl-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.95rem 1.6rem;
  border-radius: 9999px;
  border: none;
  cursor: pointer;
  background: #fbf4ea;
  color: #1c0d2e;
  font-family: 'Manrope', system-ui;
  font-weight: 700;
  font-size: 0.85rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.nl-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 10px 24px rgba(255, 92, 138, 0.3);
}
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
  color: rgba(251, 244, 234, 0.4);
}
</style>
