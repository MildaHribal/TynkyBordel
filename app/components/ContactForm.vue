<script setup lang="ts">


const form = ref({
  name: '',
  email: '',
  message: ''
});

const isSubmitting = ref(false);
const toast = useCosmicToast();

const handleSubmit = async () => {
  if (isSubmitting.value) return;
  isSubmitting.value = true;

  try {
    await $fetch('/api/contact', { method: 'POST', body: { ...form.value } });
    toast.success('Zpráva odeslána!', 'Brzy se ti ozvu zpátky.');
    form.value = { name: '', email: '', message: '' };
  } catch (err: any) {
    toast.error(
      'Zprávu se nepodařilo odeslat',
      err?.data?.statusMessage || err?.statusMessage || 'Zkus to prosím znovu, nebo napiš na info@tynkybordel.shop.',
    );
  } finally {
    isSubmitting.value = false;
  }
};
</script>

<template>
  <div class="contact-card">
    <div class="contact-grid">
      <!-- Left: Info -->
      <div class="contact-info">
        <h2 class="contact-title">
          Napiš mi,<br />
          <span class="contact-title-accent">klidně ve čtyři ráno</span>
        </h2>
        <p class="contact-desc">
          Sháníš originál na míru? Nesedí barva, velikost, nálada?
          Ozvi se — odepisuju, jak se probudím.
        </p>

        <ul class="contact-list">
          <li class="contact-item">
            <span class="contact-icon"><Icon name="mdi:account-outline" height="18" /></span>
            <!-- The artist persona, not the legal identity — the IČO holder
                 (Miroslav Turhobr) is stated on the legal pages via BUSINESS. -->
            <span class="contact-item-text">Kristýna</span>
          </li>
          <li class="contact-item">
            <span class="contact-icon"><Icon name="mdi:email-outline" height="18" /></span>
            <a href="mailto:info@tynkybordel.shop" class="contact-item-text contact-link">info@tynkybordel.shop</a>
          </li>
        </ul>
      </div>

      <!-- Right: Form -->
      <form @submit.prevent="handleSubmit" class="contact-form">
        <div class="form-row">
          <div class="form-field">
            <label class="form-label">Jméno</label>
            <input
              v-model="form.name"
              type="text"
              placeholder="Tvé jméno"
              required
              class="form-input"
            />
          </div>
          <div class="form-field">
            <label class="form-label">E-mail</label>
            <input
              v-model="form.email"
              type="email"
              placeholder="tvuj@email.cz"
              required
              class="form-input"
            />
          </div>
        </div>

        <div class="form-field">
          <label class="form-label">Zpráva</label>
          <textarea
            v-model="form.message"
            rows="5"
            placeholder="Co máš na srdci?"
            required
            class="form-input form-textarea"
          ></textarea>
        </div>

        <button
          type="submit"
          :disabled="isSubmitting"
          class="form-submit"
        >
          <Icon v-if="isSubmitting" name="lucide:loader-2" height="20" class="animate-spin" />
          <span v-else>Odeslat zprávu</span>
          <Icon v-if="!isSubmitting" name="mdi:send" height="18" />
        </button>

        <!-- Art. 13 GDPR: the information duty falls due when the data is
             collected, i.e. here. Wording tracks what /api/contact actually
             does — sendContactMessage() only mails the shop mailbox with the
             sender as Reply-To, nothing is written to the database — so no
             consent box: answering the question you asked is the legitimate
             interest, and a consent we do not rely on would be misleading. -->
        <p class="form-note">
          Jméno, e-mail a text zprávy použijeme jen k zodpovězení tvého dotazu — zpráva se
          pošle do e-mailové schránky obchodu a nikam se neukládá. Víc v
          <NuxtLink to="/ochrana-osobnich-udaju" class="form-note-link">zásadách ochrany osobních údajů</NuxtLink>.
        </p>
      </form>
    </div>
  </div>
</template>

<style scoped>
/* ── Local colours ─────────────────────────────────────────────────────────
   Everything else here rides main.css's --pop-* tokens, which flip themselves
   through light-dark(). These two have no shared equivalent:

   --contact-accent        the italic "klidně ve čtyři ráno" and the e-mail link
                           hover. The shared on-paper rose is --pop-pink-ink
                           (#b34a72), a slightly different hue from this
                           component's #b3324c, and light mode has to stay
                           byte-identical — so the rose is lifted locally for
                           dark instead, the same way --pop-pink-ink is.
   --contact-submit-hover  the submit button's hover fill. The button's resting
                           fill is var(--pop-ink), which inverts to near-white
                           in dark, so "one step further from the resting
                           fill" means darker in light and brighter in dark.
   Guarded exactly like main.css: with no light-dark() the plain block below
   stands and light mode is untouched. */
.contact-card {
  --contact-accent: #b3324c;
  --contact-submit-hover: #21382a;
}
@supports (color: light-dark(#fff, #000)) {
  .contact-card {
    --contact-accent: light-dark(#b3324c, #F2A2B2);
    --contact-submit-hover: light-dark(#21382a, #ffffff);
  }
}

.contact-card {
  background: var(--pop-sheet);
  border: 1px solid var(--pop-line);
  border-radius: 1.5rem;
  padding: 2rem 1.5rem;
  /* --pop-shadow-soft is the blurred zine shadow at 0.18; this card carries it
     at 0.08, hence the mix rather than the bare token. */
  box-shadow: 0 12px 32px color-mix(in srgb, var(--pop-shadow-soft) 44%, transparent);
}
@media (min-width: 768px) {
  .contact-card { padding: 3rem 2.5rem; }
}
@media (min-width: 1024px) {
  .contact-card { padding: 4rem 3rem; }
}

.contact-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2.5rem;
}
@media (min-width: 900px) {
  .contact-grid { grid-template-columns: 1fr 1fr; gap: 3.5rem; }
}

/* ── Info column ── */
.contact-title {
  font-family: var(--font-body);
  font-weight: 700;
  font-size: 2rem;
  line-height: 1.05;
  letter-spacing: -0.03em;
  color: var(--pop-ink);
  margin: 0 0 1.25rem;
}
@media (min-width: 768px) {
  .contact-title { font-size: 2.75rem; }
}
.contact-title-accent {
  font-style: italic;
  font-weight: 500;
  color: var(--contact-accent);
}

.contact-desc {
  font-family: var(--font-body);
  font-style: italic;
  font-weight: 500;
  font-size: 1.05rem;
  line-height: 1.55;
  /* Was #1a0a30, a leftover near-black from the pre-zine cosmic palette. This
     is body copy on paper, so it belongs to --pop-ink. */
  color: var(--pop-ink);
  margin: 0 0 2rem;
  max-width: 42ch;
}

.contact-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.contact-item {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}
.contact-icon {
  width: 42px;
  height: 42px;
  border-radius: 9999px;
  background: var(--pop-card-2);
  border: 1px solid var(--pop-line);
  color: var(--pop-ink);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.contact-item-text {
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--pop-ink);
}
.contact-link {
  text-decoration: none;
  transition: color 0.2s ease;
}
.contact-link:hover { color: var(--contact-accent); }

/* ── Form column ── */
.contact-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.form-row {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.25rem;
}
@media (min-width: 640px) {
  .form-row { grid-template-columns: 1fr 1fr; }
}

.form-field { display: flex; flex-direction: column; gap: 0.4rem; }
.form-label {
  font-family: var(--font-body);
  font-weight: 700;
  font-size: 0.68rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  /* Was a flat 60% ink, which main.css measures at 4.37:1 on white — under AA.
     --pop-ink-mute is the palette's muted-text token and exists at 0.64 for
     exactly this reason (4.96:1), and it inverts for dark. */
  color: var(--pop-ink-mute);
  margin-left: 0.2rem;
}
.form-input {
  width: 100%;
  background: var(--pop-card-2);
  border: 1px solid var(--pop-line);
  border-radius: 0.85rem;
  padding: 0.9rem 1rem;
  color: var(--pop-ink);
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 0.95rem;
  transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
}
.form-input::placeholder {
  color: var(--pop-ink-faint);
}
.form-input:focus {
  outline: none;
  border-color: var(--pop-ink);
  /* --pop-sheet and --pop-card-2 are the same violet in dark mode, so there the
     focus state is carried by the border and the ring rather than by the fill —
     which is how it already read in light mode. */
  background: var(--pop-sheet);
  box-shadow: 0 0 0 3px var(--pop-ink-wash-2);
}
.form-textarea { resize: vertical; min-height: 130px; line-height: 1.5; }

.form-submit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  padding: 1rem 1.75rem;
  background: var(--pop-ink);
  /* --pop-sheet is #ffffff in light and #33244C in dark, i.e. it is the exact
     inverse of --pop-ink in both themes — the label rides the fill instead of
     going white-on-white. */
  color: var(--pop-sheet);
  border: none;
  border-radius: 9999px;
  font-family: var(--font-body);
  font-weight: 700;
  font-size: 0.85rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease;
  margin-top: 0.5rem;
}
.form-submit:hover:not(:disabled) {
  background: var(--contact-submit-hover);
  transform: translateY(-2px);
}
.form-submit:disabled { opacity: 0.7; cursor: wait; }

/* ── GDPR fine print ─────────────────────────────────────────────────────
   Footnote under the button, so it takes the same muted token as .form-label
   rather than body ink — it must recede, not compete with the form. The card
   ground is --pop-sheet, which flips through light-dark(), and --pop-ink-mute
   flips with it, so both themes are covered by the one declaration. */
.form-note {
  font-family: var(--font-body);
  font-size: 0.72rem;
  line-height: 1.5;
  color: var(--pop-ink-mute);
  margin: -0.4rem 0 0;
}
/* Inheriting the muted colour keeps the link legible in both themes for free —
   the underline is what marks it as a link. Hover borrows the card's accent,
   which is already theme-guarded above. */
.form-note-link {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: color 0.2s ease;
}
.form-note-link:hover { color: var(--contact-accent); }
</style>
