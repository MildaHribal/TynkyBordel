<script setup lang="ts">

definePageMeta({ layout: 'admin', middleware: 'admin' })

// The pink strip under the hero. It was a hardcoded array in the homepage, so
// changing four words needed a deploy — for the one bit of copy most likely to
// change with a promotion or a shipping delay.
type SiteContent = {
  ticker: string[]
  isDefault: boolean
  defaults: string[]
  limits: { maxItems: number; maxLength: number }
}

const toast = useCosmicToast()
const { data, refresh, pending } = await useFetch<SiteContent>('/api/admin/site-content')

const text = ref('')
watch(data, (v) => { if (v) text.value = v.ticker.join('\n') }, { immediate: true })

const lines = computed(() => text.value.split('\n').map((l) => l.trim()).filter(Boolean))
const tooMany = computed(() => !!data.value && lines.value.length > data.value.limits.maxItems)
const tooLong = computed(() =>
  !!data.value && lines.value.some((l) => l.length > data.value!.limits.maxLength))

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    await $fetch('/api/admin/site-content', { method: 'PUT', body: { ticker: text.value } })
    await refresh()
    toast.success('Uloženo', 'Pruh na hlavní stránce je aktualizovaný.')
  } catch (e: any) {
    toast.error('Uložení selhalo', e?.data?.statusMessage || 'Zkus to znovu.')
  } finally {
    saving.value = false
  }
}

async function resetToDefault() {
  if (!confirm('Vrátit původní texty v pruhu?')) return
  saving.value = true
  try {
    // Empty clears the override; the storefront falls back to the built-in text.
    await $fetch('/api/admin/site-content', { method: 'PUT', body: { ticker: '' } })
    await refresh()
    toast.info('Obnoveno', 'Pruh je zase ve výchozím znění.')
  } catch (e: any) {
    toast.error('Nepodařilo se', e?.data?.statusMessage || 'Zkus to znovu.')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <h1 class="page-title">Obsah webu</h1>
        <p class="page-subtitle">Texty, které se dají měnit bez zásahu do kódu.</p>
      </div>
    </div>

    <div v-if="pending" class="loading-state">
      <Icon name="lucide:loader-2" class="animate-spin" height="22" />
      <span>Načítám…</span>
    </div>

    <section v-else class="admin-card">
      <header class="card-head">
        <div>
          <h2 class="card-title">Jezdící pruh na hlavní stránce</h2>
          <p class="card-hint">
            Ten růžový pás pod úvodním obrázkem. Každý řádek = jeden text, mezi nimi se
            automaticky doplní hvězdička. Texty se dokola opakují, takže stačí pár krátkých.
          </p>
        </div>
        <span v-if="data" class="src-badge" :class="data.isDefault ? 'src-default' : 'src-custom'">
          {{ data.isDefault ? 'Výchozí' : 'Upraveno' }}
        </span>
      </header>

      <div class="card-body">
        <!-- Preview first: it is the whole point of the screen, and it makes the
             one-line-per-phrase rule obvious without explaining it twice. -->
        <div class="preview-label">Náhled</div>
        <div class="preview-strip">
          <div class="preview-track">
            <template v-for="n in 2" :key="n">
              <template v-for="(t, i) in lines" :key="`${n}-${i}`">
                <span class="preview-star">✦</span>
                <span class="preview-item">{{ t }}</span>
              </template>
            </template>
            <span v-if="!lines.length" class="preview-empty">
              (prázdné — po uložení se použije výchozí text)
            </span>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Texty — jeden na řádek</label>
          <textarea
            v-model="text"
            rows="6"
            class="form-input form-textarea"
            spellcheck="false"
            placeholder="odesílám do 2 dnů&#10;handmade&#10;platba převodem i dobírkou"
          ></textarea>
          <p class="form-hint" :class="{ 'hint-danger': tooMany || tooLong }">
            <template v-if="tooMany">
              Maximálně {{ data?.limits.maxItems }} textů — máš {{ lines.length }}.
            </template>
            <template v-else-if="tooLong">
              Jeden z textů je delší než {{ data?.limits.maxLength }} znaků.
            </template>
            <template v-else>
              {{ lines.length }} {{ lines.length === 1 ? 'text' : 'textů' }}, max
              {{ data?.limits.maxItems }}. Píše se malými písmeny — velká zajistí web sám.
            </template>
          </p>
        </div>
      </div>

      <footer class="card-foot">
        <button class="btn-ghost" :disabled="saving || data?.isDefault" @click="resetToDefault">
          <Icon name="lucide:rotate-ccw" height="16" />
          Vrátit výchozí
        </button>
        <button class="btn-primary" :disabled="saving || tooMany || tooLong" @click="save">
          <Icon v-if="saving" name="lucide:loader-2" class="animate-spin" height="16" />
          <Icon v-else name="lucide:save" height="16" />
          Uložit
        </button>
      </footer>
    </section>
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

.admin-card { padding: 0; }

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.1rem 1.25rem 0.85rem;
  border-bottom: 1px solid var(--ad-border);
}
.card-title {
  margin: 0;
  font-family: var(--font-gloock), Georgia, serif;
  font-size: 1.15rem;
  color: var(--ad-ink);
  letter-spacing: -0.01em;
}
.card-hint {
  margin: 0.25rem 0 0;
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--ad-ink-soft);
  max-width: 62ch;
}

.src-badge {
  flex-shrink: 0;
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border: 1px solid transparent;
}
.src-default {
  color: var(--ad-ink-soft);
  background: var(--adx-surface-2);
  border-color: var(--ad-border);
}
.src-custom {
  color: var(--adx-accent);
  background: var(--adx-accent-10);
  border-color: var(--adx-accent-25);
}

.card-body {
  padding: 1rem 1.25rem 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.preview-label {
  font-size: 0.68rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--adx-vink-55);
  font-weight: 700;
}
/* Mirrors the storefront strip closely enough to judge the wording — same pink,
   same mono caps, same star separators — without importing the marquee's
   animation into the admin. */
.preview-strip {
  overflow: hidden;
  border-radius: 8px;
  background: #f5a3c2;
  border: 1px solid var(--adx-accent-25);
}
.preview-track {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.55rem 0.75rem;
  white-space: nowrap;
}
.preview-star { color: #2a1340; font-size: 0.7rem; flex-shrink: 0; }
.preview-item {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #2a1340;
  font-weight: 700;
  flex-shrink: 0;
}
.preview-empty {
  font-size: 0.72rem;
  color: #2a1340;
  opacity: 0.7;
  font-style: italic;
}

.form-textarea {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 0.85rem;
  line-height: 1.7;
  resize: vertical;
}
.form-hint {
  font-size: 0.75rem;
  color: var(--ad-muted);
  margin: 0.35rem 0 0;
}
.hint-danger { color: var(--adx-accent); font-weight: 600; }

.card-foot {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.85rem 1.25rem;
  border-top: 1px solid var(--ad-border);
  background: var(--ad-surface-2);
}

@media (max-width: 640px) {
  .card-foot { flex-direction: column-reverse; }
  .card-foot button { width: 100%; justify-content: center; }
}
</style>
