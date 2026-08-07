<script setup lang="ts">
import { ref } from 'vue'

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
  <!--
    A compact block that sits INSIDE the footer's brand row, not a full-bleed
    banner above it. It used to be its own section with a display-sized heading
    and two decorative discs, which made the footer read as two competing
    sections stacked on each other.
  -->
  <div class="nl">
    <div class="nl-eyebrow">— Newsletter</div>
    <p class="nl-title">Nezmeškej nový kousek ✦</p>

    <form v-if="state !== 'done'" class="nl-form" @submit.prevent="submit">
      <label class="sr-only" for="nl-email">E-mail</label>
      <input
        id="nl-email"
        v-model="email"
        type="email"
        required
        autocomplete="email"
        placeholder="tvuj@email.cz"
        class="nl-input"
        :disabled="state === 'loading'"
      >
      <button type="submit" class="nl-btn" :disabled="state === 'loading'">
        <Icon v-if="state === 'loading'" name="mdi:loading" class="animate-spin" height="16" />
        <span>{{ state === 'loading' ? 'Odesílám…' : 'Odebírat' }}</span>
      </button>
    </form>

    <p v-else class="nl-done">
      <Icon name="mdi:check-circle" height="17" />
      <span>Hotovo! Tvůj e-mail máme.</span>
    </p>

    <p v-if="state === 'error'" class="nl-error">{{ errorMsg }}</p>
    <p class="nl-fineprint">
      Žádný spam,
      <NuxtLink to="/newsletter/odhlaseni" class="nl-fineprint-link">odhlásit</NuxtLink>
      se můžeš kdykoliv.
    </p>
  </div>
</template>

<style scoped>
/* The wine ground comes from .site-footer in layouts/default.vue; this block is
   transparent and sits directly on it. Every foreground below is contrast-
   checked against that wine (#5A1F2E), not the old near-black panel. */
.nl {
  width: 100%;
  max-width: 420px;

  /* Local, deliberately theme-invariant paper. No shared token fits: every
     --pop-* surface flips dark, and this one must not, because the wine behind
     it is already dark in both themes. */
  --nl-paper: #fbf7ee;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.nl-eyebrow {
  font-family: var(--font-mono, monospace);
  font-size: 0.63rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--pop-pink, #E585AA);
  font-weight: 700;
  margin-bottom: 0.4rem;
}

/* A <p>, not an <h2>: this is no longer a section of its own, and a second
   heading level here competed with the real footer column headings. */
.nl-title {
  font-family: var(--font-zine, system-ui);
  font-weight: 700;
  font-size: 1.05rem;
  line-height: 1.15;
  letter-spacing: -0.01em;
  color: #F1EBDF;
  margin: 0 0 0.7rem;
}

.nl-form {
  display: flex;
  gap: 0.4rem;
}

/* The input keeps a paper-light fill in BOTH themes: it sits on the wine, which
   is dark in both, so flipping it to a dark surface would make the field vanish
   into the footer. Its ink therefore has to be --pop-ink-on-accent (constant
   dark) — plain --pop-ink flips to near-white and the typed e-mail would be
   invisible in dark mode. */
.nl-input {
  flex: 1;
  min-width: 0;
  padding: 0.5rem 0.7rem;
  border-radius: 7px;
  background: var(--nl-paper);
  border: 2px solid var(--pop-ink-on-accent, #14231a);
  color: var(--pop-ink-on-accent, #14231a);
  font-family: var(--font-mono, monospace);
  font-size: 0.82rem;
  transition: box-shadow 0.2s ease;
}
.nl-input::placeholder { color: rgba(20, 35, 26, 0.42); }
.nl-input:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--pop-pink, #E585AA);
}

.nl-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.5rem 0.8rem;
  border-radius: 7px;
  /* Lime stays light in dark mode, so the glyph on it must stay dark ink —
     --pop-ink would flip to near-white and disappear on the lime. */
  border: 2px solid var(--pop-ink-on-accent, #14231a);
  cursor: pointer;
  background: var(--pop-lime, #B9E14B);
  color: var(--pop-ink-on-accent, #14231a);
  font-family: var(--font-mono, monospace);
  font-weight: 700;
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
  box-shadow: 3px 3px 0 rgba(20, 35, 26, 0.55);
}
.nl-btn:hover:not(:disabled) { transform: translate(-1px, -1px); box-shadow: 4px 4px 0 rgba(20, 35, 26, 0.55); }
.nl-btn:active:not(:disabled) { transform: translate(2px, 2px); box-shadow: 1px 1px 0 rgba(20, 35, 26, 0.55); }
.nl-btn:disabled { opacity: 0.72; cursor: default; }
.nl-btn:focus-visible { outline: 2px solid var(--nl-paper); outline-offset: 2px; }

.nl-done {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  color: var(--pop-lime, #B9E14B);
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 0.86rem;
}

.nl-error {
  margin: 0.5rem 0 0;
  color: #FFC98A;
  font-family: var(--font-body);
  font-size: 0.78rem;
}

.nl-fineprint {
  margin: 0.55rem 0 0;
  font-family: var(--font-body);
  font-size: 0.71rem;
  line-height: 1.5;
  color: rgba(241, 235, 223, 0.58);
}
.nl-fineprint-link {
  color: rgba(241, 235, 223, 0.82);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.nl-fineprint-link:hover { color: #ffffff; }
</style>
