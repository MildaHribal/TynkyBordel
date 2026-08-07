<script setup lang="ts">
import { ref } from 'vue'
import { useAuth } from '~/composables/useAuth'


const { signInWithPassword, signInWithGoogle } = useAuth()
const router = useRouter()
const toast = useCosmicToast()

useSeoMeta({
  title: 'Přihlášení',
  description: 'Přihlaste se ke svému účtu v Tynky Bordel.',
  robots: 'noindex,nofollow',
})

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

const handleLogin = async () => {
  loading.value = true
  error.value = ''

  try {
    const result = await signInWithPassword(email.value, password.value)
    if (result.error) {
      error.value = result.error
    } else {
      toast.success('Přihlášení', 'Vítejte zpět v kosmické dimenzi! 👽')
      await router.push('/')
    }
  } catch (e: any) {
    error.value = 'Nastala chyba při přihlašování: ' + (e.message || 'Neznámá chyba')
  } finally {
    loading.value = false
  }
}

const handleGoogleLogin = async () => {
  loading.value = true
  error.value = ''

  try {
    const result = await signInWithGoogle()
    if (result.error) error.value = result.error
  } catch (e: any) {
    error.value = 'Chyba při přihlašování přes Google: ' + (e.message || 'Neznámá chyba')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-[80vh] flex-col items-center justify-center px-4 md:px-6 py-8 md:py-12 relative">
    <!-- Decorative elements - hidden on mobile -->
    <div class="hidden sm:block absolute top-20 left-20 text-4xl hippie-float opacity-10">☮</div>
    <div class="hidden sm:block absolute bottom-20 right-20 text-3xl hippie-float-delayed opacity-10">🌀</div>
    <div class="hidden sm:block absolute top-1/3 right-10 text-2xl hippie-float opacity-10">✨</div>

    <div class="w-full max-w-md">
      <!-- Header -->
      <div class="text-center mb-8 md:mb-10">
        <h2 class="text-2xl md:text-3xl font-extrabold text-white neon-text">Přihlášení</h2>
        <p class="mt-2 text-white/70 text-sm md:text-base">Vstupte do kosmické dimenze</p>
      </div>

      <!-- Form Card -->
      <div class="glass-card-strong p-5 md:p-8 gradient-border">
        <form class="space-y-5" @submit.prevent="handleLogin">
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
              autocomplete="current-password"
              required
              class="input-cosmic"
              placeholder="••••••••"
            >
          </div>

          <div class="-mt-2 text-right">
            <NuxtLink to="/user/forgot-password" class="text-sm text-white/70 hover:text-primary-200 transition-colors">
              Zapomenuté heslo?
            </NuxtLink>
          </div>

          <div v-if="error" class="glass-card p-3 border-red-500/40 text-center">
            <p class="text-red-300 text-sm">{{ error }}</p>
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="btn-cosmic w-full py-3.5 text-base flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Icon v-if="loading" icon="mdi:loading" class="animate-spin" height="20" />
            {{ loading ? 'Přihlašování...' : 'Přihlásit se ✨' }}
          </button>
        </form>

        <!-- Divider -->
        <div class="relative my-8">
          <div class="cosmic-divider"></div>
          <div class="absolute inset-0 flex items-center justify-center">
            <span class="px-4 text-sm text-white/70 bg-[#0d0020]">nebo pokračujte přes</span>
          </div>
        </div>

        <!-- Social Login -->
        <button
          @click="handleGoogleLogin"
          :disabled="loading"
          type="button"
          class="w-full flex items-center justify-center gap-3 glass-card py-3.5 text-white hover:bg-white/10 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <Icon icon="logos:google-icon" class="h-5 w-5" />
          <span class="text-sm font-semibold">Google</span>
        </button>
      </div>

      <!-- Footer link -->
      <p class="mt-8 text-center text-sm text-white/75">
        Nemáte účet?
        <NuxtLink to="/user/register" class="font-semibold text-primary-300 hover:text-primary-200 transition-colors">
          Zaregistrujte se ☮
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
