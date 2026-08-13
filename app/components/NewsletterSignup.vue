<script setup lang="ts">
import { ref } from 'vue'

const email = ref('')
// Starts unticked and stays required: a pre-ticked box is not a consent, and
// the server refuses the request without it anyway.
const consent = ref(false)
const state = ref<'idle' | 'loading' | 'done' | 'error'>('idle')
const errorMsg = ref('')

const submit = async () => {
  if (state.value === 'loading' || !consent.value) return
  errorMsg.value = ''
  state.value = 'loading'
  try {
    await $fetch('/api/newsletter', {
      method: 'POST',
      body: { email: email.value, consent: consent.value, source: 'footer-form' },
    })
    state.value = 'done'
    email.value = ''
    consent.value = false
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
      <button type="submit" class="nl-btn" :disabled="state === 'loading' || !consent">
        <Icon v-if="state === 'loading'" name="mdi:loading" class="animate-spin" height="16" />
        <span>{{ state === 'loading' ? 'Odesílám…' : 'Odebírat' }}</span>
      </button>
    </form>

    <!--
      The consent tick sits under the form, but it is `required`, so the browser
      blocks submitting without it even if someone tabs straight to the button.
    -->
    <label v-if="state !== 'done'" class="nl-consent" for="nl-consent">
      <input
        id="nl-consent"
        v-model="consent"
        type="checkbox"
        required
        class="nl-consent-box"
        :disabled="state === 'loading'"
      >
      <span>
        Souhlasím, aby mi Tynky Bordel posílal novinky na e-mail; souhlas můžu kdykoliv odvolat.
        Víc v
        <NuxtLink to="/ochrana-osobnich-udaju" class="nl-consent-link">zásadách ochrany osobních údajů</NuxtLink>.
      </span>
    </label>

    <!-- Not "we have your email" — nothing is subscribed until the address
         confirms itself, and saying otherwise would be the old lie. -->
    <p v-else class="nl-done">
      <Icon name="mdi:email-check" height="17" />
      <span>Poslali jsme ti e-mail — klikni v něm na potvrzení a odběr je hotový.</span>
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

/* Consent tick. On the wine ground the native box would be a dark square on a
   dark field in dark mode, so the box itself is forced to the paper fill and the
   lime accent — the same two constants the input and button already rely on. */
.nl-consent {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  margin: 0.6rem 0 0;
  cursor: pointer;
  font-family: var(--font-body);
  font-size: 0.73rem;
  line-height: 1.5;
  color: rgba(241, 235, 223, 0.86);
}

.nl-consent-box {
  flex: none;
  width: 0.95rem;
  height: 0.95rem;
  margin-top: 0.16rem;
  accent-color: var(--pop-lime, #B9E14B);
  /* Keeps the unchecked box visible against the wine in both themes. */
  background: var(--nl-paper);
  border-radius: 3px;
  cursor: pointer;
}
.nl-consent-box:focus-visible { outline: 2px solid var(--pop-pink, #E585AA); outline-offset: 2px; }
.nl-consent-box:disabled { cursor: default; opacity: 0.6; }

.nl-consent-link {
  color: #ffffff;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.nl-consent-link:hover { color: var(--pop-pink, #E585AA); }

/* Wraps to two lines now that it asks for a click in the inbox — align the icon
   to the first line instead of the middle of the block. */
.nl-done {
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
  margin: 0;
  color: var(--pop-lime, #B9E14B);
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 0.86rem;
  line-height: 1.45;
}
.nl-done :deep(svg) { flex: none; margin-top: 0.15rem; }

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
