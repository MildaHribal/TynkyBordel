<script setup lang="ts">
import { ref } from 'vue'
import { useAuth } from '~/composables/useAuth'


const { signUpWithPassword, signInWithGoogle } = useAuth()
const router = useRouter()
const toast = useCosmicToast()

useSeoMeta({
  title: 'Registrace',
  description: 'Vytvořte si účet v Tynky Bordel.',
  robots: 'noindex,nofollow',
})

const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const error = ref('')
const loading = ref(false)

const handleRegister = async () => {
  loading.value = true
  error.value = ''

  if (password.value.length < 8) {
    error.value = 'Heslo musí mít alespoň 8 znaků.'
    loading.value = false
    return
  }

  if (password.value !== confirmPassword.value) {
    error.value = 'Hesla se neshodují.'
    loading.value = false
    return
  }

  try {
    const result = await signUpWithPassword(email.value, password.value)
    if (result.error) {
      error.value = result.error
    } else {
      toast.success('Registrace', 'Vítejte v naší kosmické komunitě! Na email jsme poslali ověřovací odkaz ✨')
      await router.push('/')
    }
  } catch (e: any) {
    error.value = 'Nastala chyba při registraci: ' + (e.message || 'Neznámá chyba')
  } finally {
    loading.value = false
  }
}

const handleGoogleRegister = async () => {
  loading.value = true
  error.value = ''

  try {
    const result = await signInWithGoogle()
    if (result.error) error.value = result.error
  } catch (e: any) {
    error.value = 'Chyba při registraci přes Google: ' + (e.message || 'Neznámá chyba')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-[80vh] flex-col items-center justify-center px-4 md:px-6 py-8 md:py-12 relative">
    <!-- Decorative elements - hidden on mobile -->
    <div class="hidden sm:block absolute top-16 right-16 text-4xl hippie-float opacity-10">🍄</div>
    <div class="hidden sm:block absolute bottom-16 left-16 text-3xl hippie-float-delayed opacity-10">🌌</div>
    <div class="hidden sm:block absolute top-1/4 left-10 text-2xl hippie-float opacity-10">🔮</div>

    <div class="w-full max-w-md">
      <!-- Header -->
      <div class="text-center mb-8 md:mb-10">
        <div class="text-4xl md:text-5xl mb-3 md:mb-4">🌀</div>
        <h2 class="text-2xl md:text-3xl font-extrabold text-white neon-text-pink">Registrace</h2>
        <p class="mt-2 auth-lede text-sm md:text-base">Připojte se ke kosmické komunitě</p>
      </div>

      <!-- Form Card -->
      <div class="glass-card-strong p-5 md:p-8 gradient-border">
        <form class="space-y-5" @submit.prevent="handleRegister">
          <div>
            <label for="email" class="block text-sm font-semibold text-white/90 mb-2">Email</label>
            <input
              id="email"
              v-model="email"
              name="email"
              type="email"
              autocomplete="email"
              required
              class="input-cosmic"
              placeholder="vas@email.cz"
            >
          </div>

          <div>
            <label for="password" class="block text-sm font-semibold text-white/90 mb-2">Heslo</label>
            <input
              id="password"
              v-model="password"
              name="password"
              type="password"
              autocomplete="new-password"
              required
              class="input-cosmic"
              placeholder="alespoň 8 znaků"
            >
          </div>

          <div>
            <label for="confirm-password" class="block text-sm font-semibold text-white/90 mb-2">Potvrdit heslo</label>
            <input
              id="confirm-password"
              v-model="confirmPassword"
              name="confirm-password"
              type="password"
              autocomplete="new-password"
              required
              class="input-cosmic"
              placeholder="••••••••"
            >
          </div>

          <div v-if="error" class="glass-card p-3 border-red-500/40 text-center">
            <p class="text-red-300 text-sm">{{ error }}</p>
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="btn-cosmic w-full py-3.5 text-base flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Icon v-if="loading" name="mdi:loading" class="animate-spin" height="20" />
            {{ loading ? 'Registrace...' : 'Registrovat se 🌌' }}
          </button>

          <!-- Art. 13 GDPR: the information duty is owed at the moment the data
               is collected, so it belongs on the form itself, not only on the
               legal page. Deliberately NOT a consent checkbox — the privacy
               policy files "Uživatelský účet" and "Vyřízení objednávky" under
               plnění smlouvy (Art. 6(1)(b)), and asking for a consent we do not
               rely on would misstate the legal basis and imply a withdrawal
               right that does not exist here. -->
          <p class="reg-note">
            Registrací potvrzujete, že znáte
            <NuxtLink to="/obchodni-podminky" class="reg-note-link">obchodní podmínky</NuxtLink>.
            Váš e-mail a údaje v účtu zpracováváme kvůli vedení účtu a vyřízení objednávek —
            na základě plnění smlouvy, ne souhlasu. Víc v
            <NuxtLink to="/ochrana-osobnich-udaju" class="reg-note-link">zásadách ochrany osobních údajů</NuxtLink>.
          </p>
        </form>

        <!-- Divider -->
        <div class="relative my-8">
          <div class="cosmic-divider"></div>
          <div class="absolute inset-0 flex items-center justify-center">
            <span class="px-4 text-sm text-white/70 auth-divider-label">nebo pokračujte přes</span>
          </div>
        </div>

        <!-- Social Login -->
        <button
          @click="handleGoogleRegister"
          :disabled="loading"
          type="button"
          class="w-full flex items-center justify-center gap-3 glass-card py-3.5 text-white hover:bg-white/10 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <Icon name="logos:google-icon" class="h-5 w-5" />
          <span class="text-sm font-semibold">Google</span>
        </button>
      </div>

      <!-- Footer link -->
      <p class="mt-8 text-center text-sm auth-foot">
        Již máte účet?
        <NuxtLink to="/user/login" class="font-semibold auth-foot-link transition-colors">
          Přihlaste se ✨
        </NuxtLink>
      </p>
    </div>
  </div>
</template>

<style scoped>
.input-cosmic {
  font-size: 1rem;
  padding: 0.85rem 1rem;
}
/* zine.css already forces this token with !important, so the fixed white that
   used to be here never actually painted. Spelled out so the two agree. */
.input-cosmic::placeholder {
  color: var(--pop-ink-faint);
}

/* ── Text that lands on the PAGE, not on the dark form card ──────────────
   .glass-card-strong is --pop-panel, dark in BOTH themes, so the white-ish
   labels inside it are correct. This lede and the footer line sit OUTSIDE it,
   on the page ground, which is cream in light mode — fixed white was invisible
   there. These follow the theme instead. */
.auth-lede,
.auth-foot { color: var(--pop-ink-mute); }

/* The rose link has to clear AA on BOTH grounds: --pop-pink-ink is only 4.12:1
   on cream, and Tailwind's primary-300/700 do not flip at all. Two branches,
   the same idiom main.css uses for the palette itself. */
.auth-foot-link { color: var(--color-primary-700, #97325c); }
@supports (color: light-dark(#fff, #000)) {
  .auth-foot-link { color: light-dark(#97325c, var(--pop-pink-ink)); }
}
.auth-foot-link:hover { color: var(--pop-ink); }

/* Masks the divider rule behind the label, so it has to be exactly the card's
   own fill — it used to be a fixed near-black that only matched by accident. */
.auth-divider-label { background: var(--pop-panel); }

/* ── GDPR fine print ─────────────────────────────────────────────────────
   This one sits INSIDE .glass-card-strong, which zine.css pins to --pop-panel
   (dark in both themes), so unlike .auth-lede above it must stay light in both
   — the theme-flipping ink tokens would go dark-on-dark in light mode. Muted
   enough to read as a footnote, still ~7:1 on the panel. */
/* No margin-top here on purpose: the form's own space-y-5 wins on specificity
   (`.space-y-5 > :not([hidden]) ~ :not([hidden])`), so setting one would be a
   dead declaration — the note keeps the form's rhythm instead. */
.reg-note {
  font-size: 0.72rem;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.62);
}
/* --pop-pink-ink is the on-paper rose and flips to a deep #b34a72 in light
   mode, which would be near-invisible on a panel that never lightens; the dark
   branch of that same token is pinned here instead. */
.reg-note-link {
  color: #F5A3C2;
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: color 0.2s ease;
}
.reg-note-link:hover { color: #ffffff; }
</style>
