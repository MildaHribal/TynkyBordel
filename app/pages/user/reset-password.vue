<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAuth } from '~/composables/useAuth'


const { resetPassword } = useAuth()
const route = useRoute()
const router = useRouter()
const toast = useCosmicToast()

useSeoMeta({
  title: 'Nové heslo',
  description: 'Nastavení nového hesla k účtu Tynky Bordel.',
  robots: 'noindex,nofollow',
})

// better-auth appends the token (and may append ?error=invalid_token) to the URL.
const token = computed(() => String(route.query.token || ''))
const linkError = computed(() => String(route.query.error || ''))

const password = ref('')
const confirmPassword = ref('')
const error = ref('')
const loading = ref(false)

const handleSubmit = async () => {
  error.value = ''

  if (password.value.length < 8) {
    error.value = 'Heslo musí mít alespoň 8 znaků.'
    return
  }
  if (password.value !== confirmPassword.value) {
    error.value = 'Hesla se neshodují.'
    return
  }
  if (!token.value) {
    error.value = 'Chybí ověřovací token. Požádej o nový odkaz.'
    return
  }

  loading.value = true
  const result = await resetPassword(token.value, password.value)
  loading.value = false

  if (result.error) {
    error.value = result.error
    return
  }

  toast.success('Heslo změněno', 'Teď se můžeš přihlásit novým heslem ✨')
  await router.push('/user/login')
}
</script>

<template>
  <div class="flex min-h-[80vh] flex-col items-center justify-center px-4 md:px-6 py-8 md:py-12 relative">
    <div class="hidden sm:block absolute top-16 right-16 text-4xl hippie-float opacity-10">🔑</div>
    <div class="hidden sm:block absolute bottom-16 left-16 text-3xl hippie-float-delayed opacity-10">🌌</div>

    <div class="w-full max-w-md">
      <div class="text-center mb-8 md:mb-10">
        <div class="text-4xl md:text-5xl mb-3 md:mb-4">🔑</div>
        <h2 class="text-2xl md:text-3xl font-extrabold text-white neon-text-pink">Nové heslo</h2>
        <p class="mt-2 auth-lede text-sm md:text-base">Zvol si nové heslo ke svému účtu</p>
      </div>

      <div class="glass-card-strong p-5 md:p-8 gradient-border">
        <div v-if="linkError || !token" class="text-center space-y-4">
          <div class="text-4xl">⚠️</div>
          <p class="text-white/90">Tento odkaz je neplatný nebo už vypršel.</p>
          <NuxtLink to="/user/forgot-password" class="btn-cosmic inline-flex items-center justify-center gap-2 px-6 py-3">
            Požádat o nový odkaz
          </NuxtLink>
        </div>

        <form v-else class="space-y-5" @submit.prevent="handleSubmit">
          <div>
            <label for="password" class="block text-sm font-semibold text-white/90 mb-2">Nové heslo</label>
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
            {{ loading ? 'Ukládám...' : 'Nastavit heslo 🔑' }}
          </button>
        </form>
      </div>

      <p class="mt-8 text-center text-sm auth-foot">
        <NuxtLink to="/user/login" class="font-semibold auth-foot-link transition-colors">
          Zpět na přihlášení
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
   .glass-card-strong is --pop-panel, dark in BOTH themes, so the white-ish text
   inside it is correct. This lede and the footer line sit OUTSIDE it, on the
   page ground, which is cream in light mode — fixed white was invisible there. */
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
</style>
