<script setup lang="ts">

definePageMeta({ layout: 'admin', middleware: 'admin' })

// Why this page exists: the shop runs on a VPS we can't SSH into, so when the
// SMTP variables in .env.production are wrong or missing, transactional email is
// dead and nothing in the deploy pipeline can fix it. Settings saved here live in
// the database and override the environment, so email is repairable from a browser.

type Source = 'db' | 'env' | 'none'

type MailSettings = {
  values: Record<string, string>
  sources: Record<string, Source>
  passwordSet: boolean
  secureSource: string
  canStoreSecrets: boolean
  updatedAt: Record<string, string>
  bank: { localFormat: string; iban: string; checksumOk: boolean; source: Source }
}

type ProbeResult = { label: string; host: string; port: number; ok: boolean; ms: number; error?: string }

type Diagnostic = {
  ok: boolean
  diagnosis: string
  config: { notificationRecipient: string | null; mailFromMatchesUser: boolean }
  verify: { ok: boolean; configured: boolean; error?: string }
  sent: { to: string; ok: boolean } | null
  // Only present when the connection failed — see server/utils/net-probe.ts.
  network: { host: string; dns: { v4: string[]; v6: string[] }; results: ProbeResult[]; verdict: string } | null
}

const toast = useCosmicToast()

const { data, refresh, pending } = await useFetch<MailSettings>('/api/admin/mail-settings')

const form = reactive({
  smtp_host: '',
  smtp_port: '',
  smtp_secure: '',
  smtp_user: '',
  mail_from: '',
  order_notification_email: '',
  smtp_pass: '',
  bank_account_prefix: '',
  bank_account_number: '',
  bank_account_bank_code: '',
  bank_account_holder: '',
})

// Re-seed from the server on load and after every save (the password box always
// starts empty — the secret is never sent back to the browser).
watch(data, (settings) => {
  if (!settings) return
  Object.assign(form, settings.values)
  form.smtp_pass = ''
}, { immediate: true })

const saving = ref(false)
const testing = ref(false)
const checking = ref(false)
const testEmail = ref('')
const diagnostic = ref<Diagnostic | null>(null)

const FIELDS = [
  {
    key: 'smtp_host',
    label: 'SMTP server',
    placeholder: 'smtp.seznam.cz',
    hint: 'Adresa odchozího serveru poskytovatele schránky.',
  },
  {
    key: 'smtp_port',
    label: 'Port',
    placeholder: '465',
    hint: 'Seznam: 465. Port 465 se automaticky posílá šifrovaně (SSL).',
  },
  {
    key: 'smtp_user',
    label: 'Přihlašovací jméno',
    placeholder: 'info@tynkybordel.shop',
    hint: 'U Seznamu celá e-mailová adresa schránky.',
  },
  {
    key: 'mail_from',
    label: 'Odesílatel (From)',
    placeholder: 'Tynky Bordel <info@tynkybordel.shop>',
    hint: 'Musí obsahovat stejnou adresu jako přihlašovací jméno, jinak Seznam e-mail odmítne.',
  },
  {
    key: 'order_notification_email',
    label: 'Kam chodí upozornění na objednávky',
    placeholder: 'info@tynkybordel.shop',
    hint: 'Nechej prázdné a použije se adresa odesílatele.',
  },
] as const

const SOURCE_LABELS: Record<Source, { text: string; title: string }> = {
  db: { text: 'z administrace', title: 'Uloženo v databázi — můžeš to změnit tady a projeví se to hned.' },
  env: { text: 'ze serveru', title: 'Načteno z proměnných prostředí na VPS. Uložením tady tuhle hodnotu přebiješ.' },
  none: { text: 'nevyplněno', title: 'Hodnota není nastavená nikde.' },
}

const sourceOf = (key: string): Source => {
  const map: Record<string, string> = {
    smtp_host: 'host',
    smtp_port: 'port',
    smtp_secure: 'secure',
    smtp_user: 'user',
    mail_from: 'mailFrom',
  }
  return (data.value?.sources?.[map[key] ?? key] as Source) ?? 'none'
}

const save = async () => {
  saving.value = true
  try {
    const payload: Record<string, string> = { ...form }
    // An absent smtp_pass means "keep the stored one" — only send a typed value.
    if (!form.smtp_pass) delete payload.smtp_pass

    const res = await $fetch<{ verify: { ok: boolean; configured: boolean; error?: string } }>('/api/admin/mail-settings', {
      method: 'PUT',
      body: payload,
    })
    await refresh()

    if (res.verify.ok) {
      toast.success('Uloženo a ověřeno', 'Připojení i přihlášení k SMTP funguje. Pošli si zkušební e-mail.')
    } else if (res.verify.configured) {
      toast.error('Uloženo, ale spojení selhalo', res.verify.error || 'Zkontroluj heslo a port.')
    } else {
      toast.info('Uloženo', 'Odesílání je zatím vypnuté — chybí server nebo přihlašovací jméno.')
    }
  } catch (err: any) {
    toast.error('Uložení selhalo', err?.data?.statusMessage || 'Zkus to znovu.')
  } finally {
    saving.value = false
  }
}

const clearPassword = async () => {
  if (!confirm('Smazat uložené heslo? Odesílání pak pojede podle nastavení na serveru (pokud tam nějaké je).')) return
  saving.value = true
  try {
    await $fetch('/api/admin/mail-settings', { method: 'PUT', body: { smtp_pass: '' } })
    await refresh()
    toast.info('Heslo smazáno', 'V databázi už žádné uložené není.')
  } catch (err: any) {
    toast.error('Nepodařilo se', err?.data?.statusMessage || 'Zkus to znovu.')
  } finally {
    saving.value = false
  }
}

const runDiagnostic = async (send?: string) => {
  const flag = send ? testing : checking
  flag.value = true
  try {
    diagnostic.value = await $fetch<Diagnostic>('/api/admin/email-diagnostic', {
      params: send ? { send } : {},
    })
    if (send) {
      if (diagnostic.value?.sent?.ok) toast.success('Odesláno', `Zkušební e-mail letí na ${send}.`)
      else toast.error('Neodesláno', diagnostic.value?.verify?.error || 'Podrobnosti níže.')
    }
  } catch (err: any) {
    toast.error('Diagnostika selhala', err?.data?.statusMessage || 'Zkus to znovu.')
  } finally {
    flag.value = false
  }
}

const formatDate = (iso?: string) => {
  if (!iso) return ''
  return new Date(iso).toLocaleString('cs-CZ', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <h1 class="page-title">Nastavení odesílání</h1>
        <p class="page-subtitle">
          Přihlašovací údaje ke schránce, ze které chodí potvrzení objednávek, faktury a obnova hesla.
        </p>
      </div>
      <NuxtLink to="/admin/emails" class="btn-ghost">
        <Icon name="lucide:arrow-left" height="16" />
        Šablony e-mailů
      </NuxtLink>
    </div>

    <div v-if="pending" class="loading-state">
      <Icon name="lucide:loader-2" class="animate-spin" height="22" />
      <span>Načítám...</span>
    </div>

    <template v-else>
      <section class="admin-card status-card" :class="data?.passwordSet && data?.values.smtp_host ? 'is-ready' : 'is-warn'">
        <Icon :name="data?.passwordSet && data?.values.smtp_host ? 'lucide:mail-check' : 'lucide:mail-warning'" height="22" />
        <div>
          <h2 class="status-title">
            {{ data?.passwordSet && data?.values.smtp_host ? 'Odesílání je nastavené' : 'Odesílání není kompletní' }}
          </h2>
          <p class="status-text">
            <template v-if="data?.passwordSet && data?.values.smtp_host">
              Ověř tlačítkem níž, že se server opravdu přihlásí — nastavené ≠ funkční.
            </template>
            <template v-else>
              Dokud tu nebude server, přihlašovací jméno a heslo, žádné automatické e-maily se neposílají.
            </template>
          </p>
        </div>
      </section>

      <section class="admin-card">
        <header class="card-head">
          <h2 class="card-title">Připojení k SMTP</h2>
          <p class="card-hint">
            Co uložíš tady, má přednost před nastavením na serveru. Prázdné pole = použije se hodnota ze serveru.
          </p>
        </header>

        <div class="card-body">
          <div v-for="field in FIELDS" :key="field.key" class="form-group">
            <label class="form-label">
              {{ field.label }}
              <span class="src-badge" :class="`src-${sourceOf(field.key)}`" :title="SOURCE_LABELS[sourceOf(field.key)].title">
                {{ SOURCE_LABELS[sourceOf(field.key)].text }}
              </span>
            </label>
            <input
              v-model="form[field.key]"
              type="text"
              class="form-input"
              :placeholder="field.placeholder"
              autocomplete="off"
              spellcheck="false"
            />
            <p class="form-hint">{{ field.hint }}</p>
          </div>

          <div class="form-group">
            <label class="form-label">
              Šifrování
              <span class="src-badge" :class="`src-${sourceOf('smtp_secure')}`">
                {{ data?.secureSource === 'auto-from-port' ? 'podle portu' : SOURCE_LABELS[sourceOf('smtp_secure')].text }}
              </span>
            </label>
            <select v-model="form.smtp_secure" class="form-input">
              <option value="">Automaticky podle portu (doporučeno)</option>
              <option value="true">Vždy šifrovaně (SSL, port 465)</option>
              <option value="false">STARTTLS / nešifrovaně (port 587)</option>
            </select>
            <p class="form-hint">
              Port 465 musí jet šifrovaně. Automatika to pozná sama, ručně to přenastavuj jen když víš proč.
            </p>
          </div>

          <div class="form-group">
            <label class="form-label">
              Heslo ke schránce
              <span class="src-badge" :class="data?.passwordSet ? 'src-db' : 'src-none'">
                {{ data?.passwordSet ? 'nastaveno' : 'chybí' }}
              </span>
            </label>
            <input
              v-model="form.smtp_pass"
              type="password"
              class="form-input"
              :placeholder="data?.passwordSet ? '•••••••• (necháš-li prázdné, zůstane stávající)' : 'heslo ke schránce'"
              autocomplete="new-password"
            />
            <p class="form-hint">
              Ukládá se zašifrovaně a nikdy se nezobrazuje zpět. U Seznamu je potřeba mít ve schránce povolený
              přístup přes SMTP.
              <span v-if="data && !data.canStoreSecrets" class="hint-danger">
                Na serveru chybí BETTER_AUTH_SECRET, takže heslo teď uložit nejde.
              </span>
            </p>
          </div>
        </div>

        <footer class="card-foot">
          <button class="btn-ghost" :disabled="saving || !data?.passwordSet" @click="clearPassword">
            <Icon name="lucide:trash-2" height="16" />
            Smazat uložené heslo
          </button>
          <button class="btn-primary" :disabled="saving" @click="save">
            <Icon v-if="saving" name="lucide:loader-2" class="animate-spin" height="16" />
            <Icon v-else name="lucide:save" height="16" />
            Uložit a ověřit
          </button>
        </footer>
      </section>

      <section class="admin-card">
        <header class="card-head">
          <h2 class="card-title">Bankovní účet pro platby</h2>
          <p class="card-hint">
            Kam chodí platby převodem — z těchhle údajů se generuje QR kód na potvrzení, v e-mailu i na faktuře.
          </p>
        </header>

        <div class="card-body">
          <div v-if="data?.bank && !data.bank.checksumOk" class="result is-bad">
            <Icon name="lucide:alert-triangle" height="18" />
            <div>
              <p class="result-text">
                Aktuální číslo účtu <strong>{{ data.bank.localFormat }}</strong> neprochází bankovním
                kontrolním součtem — takový účet neexistuje a bankovní aplikace QR kód odmítají.
                Oprav ho níže podle výpisu z banky.
              </p>
            </div>
          </div>

          <div class="bank-grid">
            <div class="form-group">
              <label class="form-label">Předčíslí</label>
              <input v-model="form.bank_account_prefix" type="text" inputmode="numeric" class="form-input" placeholder="(většinou prázdné)" autocomplete="off" />
            </div>
            <div class="form-group bank-number">
              <label class="form-label">
                Číslo účtu
                <span class="src-badge" :class="`src-${data?.bank?.source ?? 'none'}`">
                  {{ SOURCE_LABELS[data?.bank?.source ?? 'none'].text }}
                </span>
              </label>
              <input v-model="form.bank_account_number" type="text" inputmode="numeric" class="form-input" placeholder="8294444956" autocomplete="off" />
            </div>
            <div class="form-group">
              <label class="form-label">Kód banky</label>
              <input v-model="form.bank_account_bank_code" type="text" inputmode="numeric" class="form-input" placeholder="5500" autocomplete="off" />
            </div>
          </div>
          <p class="form-hint">
            Ukládá se s kontrolou proti překlepům — číslo, které neprojde bankovním součtem, nejde uložit.
          </p>

          <div class="form-group">
            <label class="form-label">Majitel účtu (jméno v QR)</label>
            <input v-model="form.bank_account_holder" type="text" class="form-input" placeholder="Tynky Bordel" autocomplete="off" />
          </div>

          <p v-if="data?.bank?.iban" class="form-hint">
            IBAN se dopočítá sám: <span class="mono-inline">{{ data.bank.iban }}</span>
          </p>
        </div>

        <footer class="card-foot">
          <button class="btn-primary" :disabled="saving" @click="save">
            <Icon v-if="saving" name="lucide:loader-2" class="animate-spin" height="16" />
            <Icon v-else name="lucide:save" height="16" />
            Uložit a ověřit
          </button>
        </footer>
      </section>

      <section class="admin-card">
        <header class="card-head">
          <h2 class="card-title">Kontrola</h2>
          <p class="card-hint">Ověří přihlášení k serveru a případně pošle zkušební e-mail.</p>
        </header>

        <div class="card-body">
          <div class="test-row">
            <input
              v-model="testEmail"
              type="email"
              class="form-input"
              placeholder="kam poslat zkušební e-mail"
              autocomplete="off"
            />
            <button class="btn-primary" :disabled="testing || !testEmail" @click="runDiagnostic(testEmail)">
              <Icon v-if="testing" name="lucide:loader-2" class="animate-spin" height="16" />
              <Icon v-else name="lucide:send" height="16" />
              Poslat zkušební
            </button>
            <button class="btn-ghost" :disabled="checking" @click="runDiagnostic()">
              <Icon v-if="checking" name="lucide:loader-2" class="animate-spin" height="16" />
              <Icon v-else name="lucide:plug-zap" height="16" />
              Jen ověřit spojení
            </button>
          </div>

          <div v-if="diagnostic" class="result" :class="diagnostic.ok ? 'is-ok' : 'is-bad'">
            <Icon :name="diagnostic.ok ? 'lucide:check-circle-2' : 'lucide:alert-triangle'" height="18" />
            <div>
              <p class="result-text">{{ diagnostic.diagnosis }}</p>
              <p v-if="diagnostic.verify.error" class="result-detail">{{ diagnostic.verify.error }}</p>
              <p v-if="diagnostic.config.notificationRecipient" class="result-detail">
                Upozornění na objednávky chodí na {{ diagnostic.config.notificationRecipient }}.
              </p>
            </div>
          </div>

          <!-- Only rendered when the connection failed: which way out of the
               server is actually open. Distinguishes a blocked provider from a
               mail server that simply said no. -->
          <div v-if="diagnostic?.network" class="probe">
            <h3 class="probe-title">Průchodnost ze serveru ven</h3>
            <ul class="probe-list">
              <li v-for="r in diagnostic.network.results" :key="r.port" class="probe-row">
                <Icon
                  :name="r.ok ? 'lucide:check' : 'lucide:x'"
                  height="15"
                  :class="r.ok ? 'probe-ok' : 'probe-bad'"
                />
                <span class="probe-label">{{ r.label }}</span>
                <span class="probe-target">{{ r.host }}:{{ r.port }}</span>
                <span class="probe-verdict">{{ r.ok ? `spojení OK (${r.ms} ms)` : (r.error || 'selhalo') }}</span>
              </li>
            </ul>
            <p class="probe-note">{{ diagnostic.network.verdict }}</p>
          </div>
        </div>
      </section>

      <p v-if="data?.updatedAt?.smtp_host || data?.updatedAt?.smtp_pass" class="saved-note">
        Naposledy uloženo {{ formatDate(data.updatedAt.smtp_pass || data.updatedAt.smtp_host) }}.
      </p>
    </template>
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

.admin-card { padding: 0; margin-bottom: 1rem; }

.status-card {
  display: flex;
  align-items: flex-start;
  gap: 0.8rem;
  padding: 1rem 1.25rem;
}
.status-card.is-ready { color: var(--adx-accent); }
.status-card.is-warn { color: var(--adx-accent); }
.status-title {
  margin: 0;
  font-family: var(--font-gloock), Georgia, serif;
  font-size: 1.1rem;
  color: var(--ad-ink);
}
.status-text {
  margin: 0.2rem 0 0;
  font-size: 0.84rem;
  color: var(--ad-ink-soft);
}

.card-head {
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
  margin: 0.2rem 0 0;
  font-size: 0.82rem;
  color: var(--ad-ink-soft);
}

.card-body {
  padding: 1rem 1.25rem 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.form-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.src-badge {
  display: inline-flex;
  padding: 0.12rem 0.5rem;
  border-radius: 999px;
  font-size: 0.63rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  border: 1px solid transparent;
  cursor: help;
}
.src-db {
  color: var(--adx-accent);
  background: var(--adx-accent-10);
  border-color: var(--adx-accent-25);
}
.src-env {
  color: var(--ad-ink-soft);
  background: var(--adx-surface-2);
  border-color: var(--ad-border);
}
.src-none {
  color: var(--ad-muted);
  background: transparent;
  border-color: var(--ad-border);
}

.form-hint {
  font-size: 0.75rem;
  color: var(--ad-muted);
  margin: 0.35rem 0 0;
}
.hint-danger {
  display: block;
  margin-top: 0.25rem;
  color: var(--adx-accent);
  font-weight: 600;
}

.card-foot {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.85rem 1.25rem;
  border-top: 1px solid var(--ad-border);
  background: var(--ad-surface-2);
}

.test-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}
.test-row .form-input { flex: 1; min-width: 220px; }

.result {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.8rem 0.9rem;
  border-radius: 10px;
  border: 1px solid var(--ad-border);
  background: var(--adx-surface-2);
}
.result.is-ok { border-color: var(--adx-accent-25); }
.result.is-bad { border-color: var(--adx-accent-40); }
.result-text {
  margin: 0;
  font-size: 0.86rem;
  color: var(--ad-ink);
}
.result-detail {
  margin: 0.3rem 0 0;
  font-size: 0.76rem;
  color: var(--ad-muted);
  font-family: ui-monospace, SFMono-Regular, monospace;
  word-break: break-word;
}

.bank-grid {
  display: grid;
  grid-template-columns: minmax(90px, 1fr) 2.2fr minmax(90px, 1fr);
  gap: 0.75rem;
}
.mono-inline {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 0.82em;
  color: var(--ad-ink);
}
@media (max-width: 560px) {
  .bank-grid { grid-template-columns: 1fr; }
}

.probe {
  border: 1px solid var(--ad-border);
  border-radius: 10px;
  padding: 0.8rem 0.9rem;
  background: var(--adx-surface-2);
}
.probe-title {
  margin: 0 0 0.55rem;
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--adx-vink-55);
  font-weight: 700;
}
.probe-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
.probe-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  font-size: 0.8rem;
  color: var(--ad-ink);
}
.probe-ok { color: light-dark(#2a7a3a, #8FE0A2); flex-shrink: 0; }
.probe-bad { color: var(--adx-accent); flex-shrink: 0; }
.probe-label { min-width: 9.5rem; }
.probe-target {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 0.74rem;
  color: var(--ad-muted);
}
.probe-verdict { color: var(--ad-ink-soft); font-size: 0.78rem; }
.probe-note {
  margin: 0.7rem 0 0;
  font-size: 0.8rem;
  line-height: 1.45;
  color: var(--ad-ink);
}

.saved-note {
  font-size: 0.75rem;
  color: var(--ad-muted);
  margin: 0.25rem 0 0;
}

@media (max-width: 640px) {
  .card-foot { flex-direction: column-reverse; }
  .card-foot button { width: 100%; justify-content: center; }
}
</style>
