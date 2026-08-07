<script setup lang="ts">


definePageMeta({ layout: 'admin', middleware: 'admin' })

type Template = {
  key: 'created' | 'paid' | 'shipped' | 'delivered';
  subject: string;
  headline: string;
  body: string;
  isCustom: boolean;
  defaults: { subject: string; headline: string; body: string };
  updatedAt: string | null;
};

const toast = useCosmicToast()

const KEY_LABELS: Record<string, { label: string; hint: string; icon: string }> = {
  created:   { label: 'Nová objednávka',      hint: 'Odesláno hned po vytvoření objednávky.',       icon: 'lucide:sparkles' },
  paid:      { label: 'Platba přijata',       hint: 'Odesláno když admin označí objednávku jako zaplacenou.', icon: 'lucide:banknote' },
  shipped:   { label: 'Odesláno',             hint: 'Odesláno když admin přepne status na "odesláno".',      icon: 'lucide:truck' },
  delivered: { label: 'Doručeno',             hint: 'Odesláno když admin přepne status na "doručeno".',      icon: 'lucide:package-check' },
};

const { data: templates, refresh, pending } = await useFetch<Template[]>('/api/admin/email-templates')

const savingKey = ref<string | null>(null)
const resetingKey = ref<string | null>(null)

const saveTemplate = async (t: Template) => {
  savingKey.value = t.key;
  try {
    await $fetch(`/api/admin/email-templates/${t.key}`, {
      method: 'PUT',
      body: { subject: t.subject, headline: t.headline, body: t.body },
    });
    toast.success('Uloženo', `Šablona „${KEY_LABELS[t.key].label}" byla aktualizována.`);
    await refresh();
  } catch (err: any) {
    toast.error('Uložení selhalo', err?.data?.statusMessage || 'Zkus to znovu.');
  } finally {
    savingKey.value = null;
  }
}

const resetTemplate = async (t: Template) => {
  if (!confirm(`Vrátit šablonu „${KEY_LABELS[t.key].label}" na výchozí?`)) return;
  resetingKey.value = t.key;
  try {
    await $fetch(`/api/admin/email-templates/${t.key}/reset`, { method: 'POST' });
    toast.info('Obnoveno', 'Šablona byla vrácena na výchozí.');
    await refresh();
  } catch (err: any) {
    toast.error('Nepodařilo se', err?.data?.statusMessage || 'Zkus to znovu.');
  } finally {
    resetingKey.value = null;
  }
}

const formatDate = (iso: string | null) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('cs-CZ', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <h1 class="page-title">E-mailové šablony</h1>
        <p class="page-subtitle">Uprav texty automatických e-mailů, které se posílají zákazníkům.</p>
      </div>
    </div>

    <div v-if="pending" class="loading-state">
      <Icon name="lucide:loader-2" class="animate-spin" height="22" />
      <span>Načítám...</span>
    </div>

    <div v-else-if="templates?.length" class="tpl-grid">
      <section
        v-for="tpl in templates"
        :key="tpl.key"
        class="admin-card tpl-card"
      >
        <header class="tpl-header">
          <div class="tpl-icon">
            <Icon :name="KEY_LABELS[tpl.key].icon" height="20" />
          </div>
          <div class="tpl-header-copy">
            <h2 class="tpl-title">{{ KEY_LABELS[tpl.key].label }}</h2>
            <p class="tpl-hint">{{ KEY_LABELS[tpl.key].hint }}</p>
          </div>
          <div class="tpl-status">
            <span class="tpl-badge" :class="tpl.isCustom ? 'is-custom' : 'is-default'">
              {{ tpl.isCustom ? 'Upraveno' : 'Výchozí' }}
            </span>
            <span class="tpl-updated">{{ tpl.isCustom ? formatDate(tpl.updatedAt) : '' }}</span>
          </div>
        </header>

        <div class="tpl-body">
          <div class="form-group">
            <label class="form-label">Předmět</label>
            <input v-model="tpl.subject" type="text" class="form-input" :placeholder="tpl.defaults.subject" />
          </div>

          <div class="form-group">
            <label class="form-label">Nadpis v e-mailu</label>
            <input v-model="tpl.headline" type="text" class="form-input" :placeholder="tpl.defaults.headline" />
          </div>

          <div class="form-group">
            <label class="form-label">Text zprávy</label>
            <textarea v-model="tpl.body" rows="4" class="form-input form-textarea" :placeholder="tpl.defaults.body"></textarea>
            <p class="form-hint">Prostý text. Objeví se v odstavci hned pod nadpisem, nad seznamem položek objednávky.</p>
          </div>
        </div>

        <footer class="tpl-footer">
          <button
            class="btn-ghost"
            :disabled="resetingKey === tpl.key || !tpl.isCustom"
            @click="resetTemplate(tpl)"
          >
            <Icon v-if="resetingKey === tpl.key" name="lucide:loader-2" class="animate-spin" height="16" />
            <Icon v-else name="lucide:rotate-ccw" height="16" />
            Vrátit výchozí
          </button>
          <button
            class="btn-primary"
            :disabled="savingKey === tpl.key"
            @click="saveTemplate(tpl)"
          >
            <Icon v-if="savingKey === tpl.key" name="lucide:loader-2" class="animate-spin" height="16" />
            <Icon v-else name="lucide:save" height="16" />
            Uložit
          </button>
        </footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  padding: 3rem;
  color: var(--ad-muted);
  font-size: 0.9rem;
}

.tpl-grid {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.tpl-card { padding: 0; }

.tpl-header {
  display: flex;
  align-items: flex-start;
  gap: 0.85rem;
  padding: 1.1rem 1.25rem 0.85rem;
  border-bottom: 1px solid var(--ad-border);
}
.tpl-icon {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  background: var(--ad-accent-bg);
  color: var(--ad-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.tpl-header-copy { flex: 1; min-width: 0; }
.tpl-title {
  font-family: var(--font-gloock), Georgia, serif;
  font-size: 1.15rem;
  color: var(--ad-ink);
  margin: 0;
  letter-spacing: -0.01em;
}
.tpl-hint {
  font-size: 0.82rem;
  color: var(--ad-ink-soft);
  margin: 0.2rem 0 0;
}

.tpl-status {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.25rem;
  flex-shrink: 0;
}
.tpl-badge {
  display: inline-flex;
  padding: 0.2rem 0.65rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border: 1px solid transparent;
}
.tpl-badge.is-default {
  color: var(--ad-ink-soft);
  background: var(--ad-surface-2);
  border-color: var(--ad-border);
}
.tpl-badge.is-custom {
  color: var(--ad-accent);
  background: var(--ad-accent-bg);
  border-color: rgba(179, 50, 76, 0.25);
}
.tpl-updated {
  font-size: 0.7rem;
  color: var(--ad-muted);
  font-family: ui-monospace, SFMono-Regular, monospace;
}

.tpl-body {
  padding: 1rem 1.25rem 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}
.form-hint {
  font-size: 0.75rem;
  color: var(--ad-muted);
  margin: 0.35rem 0 0;
}

.tpl-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.85rem 1.25rem;
  border-top: 1px solid var(--ad-border);
  background: var(--ad-surface-2);
}
</style>
