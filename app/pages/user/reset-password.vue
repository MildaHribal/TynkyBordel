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
        <p class="mt-2 text-white/70 text-sm md:text-base">Zvol si nové heslo ke svému účtu</p>
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

      <p class="mt-8 text-center text-sm text-white/75">
        <NuxtLink to="/user/login" class="font-semibold text-primary-300 hover:text-primary-200 transition-colors">
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
.input-cosmic::placeholder {
  color: rgba(255, 255, 255, 0.45);
}
</style>
