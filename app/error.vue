<script setup lang="ts">


const props = defineProps<{
  error: {
    statusCode: number
    statusMessage?: string
    message?: string
    url?: string
  }
}>()

const is404 = computed(() => props.error?.statusCode === 404)

const title = computed(() =>
  is404.value ? 'Stránka neexistuje' : 'Něco se pokazilo',
)
const description = computed(() =>
  is404.value
    ? 'Odkaz vede do prázdna. Zkus se vrátit na hlavní stránku.'
    : props.error?.statusMessage || 'Zkus obnovit stránku nebo se vrať později.',
)

useSeoMeta({
  title: title.value,
  robots: 'noindex,nofollow',
})

function handleError() {
  clearError({ redirect: '/' })
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center px-6 py-16" style="background:#0d0020;">
    <div class="max-w-lg w-full text-center">
      <div class="relative inline-block mb-8">
        <div class="absolute inset-0 rounded-full scale-150 animate-pulse" style="background:rgba(139,92,246,0.25);filter:blur(30px);"></div>
        <div class="relative w-24 h-24 rounded-full flex items-center justify-center mx-auto text-white shadow-2xl"
          style="background:linear-gradient(135deg,#8b5cf6,#ec4899);">
          <Icon :name="is404 ? 'mdi:compass-off-outline' : 'mdi:alert-circle-outline'" height="48" />
        </div>
      </div>

      <div class="text-sm uppercase tracking-widest text-white/40 mb-3">
        Chyba {{ error?.statusCode }}
      </div>
      <h1 class="text-4xl md:text-5xl font-black text-white mb-4">
        {{ title }}
      </h1>
      <p class="text-lg text-white/60 mb-10">
        {{ description }}
      </p>

      <button
        @click="handleError"
        class="px-10 py-4 text-lg inline-flex items-center gap-3 rounded-full text-white font-semibold"
        style="background:linear-gradient(135deg,#8b5cf6,#ec4899);"
      >
        <Icon name="mdi:home-outline" height="22" />
        Zpět na hlavní stránku
      </button>
    </div>
  </div>
</template>
