<script setup lang="ts">
import { ref } from 'vue'
import { useAuth } from '~/composables/useAuth'


const { requestPasswordReset } = useAuth()

useSeoMeta({
  title: 'Zapomenuté heslo',
  description: 'Obnovení hesla k účtu Tynky Bordel.',
  robots: 'noindex,nofollow',
})

const email = ref('')
const error = ref('')
const loading = ref(false)
const sent = ref(false)

const handleSubmit = async () => {
  loading.value = true
  error.value = ''

  const result = await requestPasswordReset(email.value)
  loading.value = false

  if (result.error) {
    error.value = result.error
    return
  }
  // Always show the same confirmation — we don't reveal whether the email exists.
  sent.value = true
}
</script>

<template>
  <div class="flex min-h-[80vh] flex-col items-center justify-center px-4 md:px-6 py-8 md:py-12 relative">
    <div class="hidden sm:block absolute top-16 left-16 text-4xl hippie-float opacity-10">🔮</div>
    <div class="hidden sm:block absolute bottom-16 right-16 text-3xl hippie-float-delayed opacity-10">✨</div>

    <div class="w-full max-w-md">
      <div class="text-center mb-8 md:mb-10">
        <div class="text-4xl md:text-5xl mb-3 md:mb-4">🔐</div>
        <h2 class="text-2xl md:text-3xl font-extrabold text-white neon-text-pink">Zapomenuté heslo</h2>
        <p class="mt-2 text-white/70 text-sm md:text-base">Pošleme ti odkaz pro nastavení nového hesla</p>
      </div>

      <div class="glass-card-strong p-5 md:p-8 gradient-border">
        <div v-if="sent" class="text-center space-y-4">
          <div class="text-4xl">💌</div>
          <p class="text-white/90">
            Pokud u nás existuje účet s adresou <strong>{{ email }}</strong>,
            poslali jsme na něj odkaz pro obnovení hesla.
          </p>
          <p class="text-white/60 text-sm">Zkontroluj i složku se spamem.</p>
          <NuxtLink to="/user/login" class="btn-cosmic inline-flex items-center justify-center gap-2 px-6 py-3">
            Zpět na přihlášení
          </NuxtLink>
        </div>

        <form v-else class="space-y-5" @submit.prevent="handleSubmit">
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

          <div v-if="error" class="glass-card p-3 border-red-500/40 text-center">
            <p class="text-red-300 text-sm">{{ error }}</p>
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="btn-cosmic w-full py-3.5 text-base flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Icon v-if="loading" name="mdi:loading" class="animate-spin" height="20" />
            {{ loading ? 'Odesílám...' : 'Poslat odkaz 💌' }}
          </button>
        </form>
      </div>

      <p class="mt-8 text-center text-sm text-white/75">
        Vzpomněl/a sis?
        <NuxtLink to="/user/login" class="font-semibold text-primary-300 hover:text-primary-200 transition-colors">
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
.input-cosmic::placeholder {
  color: rgba(255, 255, 255, 0.45);
}
</style>
