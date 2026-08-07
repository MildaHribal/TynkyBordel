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
          Napiš nám na<br />
          <span class="contact-title-accent">domovskou planetu</span>
        </h2>
        <p class="contact-desc">
          Máš dotaz ohledně objednávky? Chceš originál na míru?
          Napiš — odpovídám ráno u čaje.
        </p>

        <ul class="contact-list">
          <li class="contact-item">
            <span class="contact-icon"><Icon name="mdi:account-outline" height="18" /></span>
            <span class="contact-item-text">Kristýna Egnerová</span>
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
      </form>
    </div>
  </div>
</template>

<style scoped>
.contact-card {
  background: #ffffff;
  border: 1px solid rgba(20, 35, 26, 0.1);
  border-radius: 1.5rem;
  padding: 2rem 1.5rem;
  box-shadow: 0 12px 32px rgba(20, 35, 26, 0.08);
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
  color: #b3324c;
}

.contact-desc {
  font-family: var(--font-body);
  font-style: italic;
  font-weight: 500;
  font-size: 1.05rem;
  line-height: 1.55;
  color: #1a0a30;
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
  background: #F1EBDF;
  border: 1px solid rgba(20, 35, 26, 0.1);
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
.contact-link:hover { color: #b3324c; }

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
  color: rgba(20, 35, 26, 0.6);
  margin-left: 0.2rem;
}
.form-input {
  width: 100%;
  background: #F1EBDF;
  border: 1px solid rgba(20, 35, 26, 0.15);
  border-radius: 0.85rem;
  padding: 0.9rem 1rem;
  color: var(--pop-ink);
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 0.95rem;
  transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
}
.form-input::placeholder {
  color: rgba(20, 35, 26, 0.4);
}
.form-input:focus {
  outline: none;
  border-color: var(--pop-ink);
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(20, 35, 26, 0.1);
}
.form-textarea { resize: vertical; min-height: 130px; line-height: 1.5; }

.form-submit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  padding: 1rem 1.75rem;
  background: var(--pop-ink);
  color: #ffffff;
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
  background: #21382a;
  transform: translateY(-2px);
}
.form-submit:disabled { opacity: 0.7; cursor: wait; }
</style>
