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
  <div class="min-h-screen flex items-center justify-center px-6 py-16 error-ground">
    <div class="max-w-lg w-full text-center">
      <div class="relative inline-block mb-8">
        <div class="absolute inset-0 rounded-full scale-150 animate-pulse" style="background:rgba(139,92,246,0.25);filter:blur(30px);"></div>
        <div class="relative w-24 h-24 rounded-full flex items-center justify-center mx-auto text-white shadow-2xl"
          style="background:linear-gradient(135deg,#8b5cf6,#ec4899);">
          <Icon :name="is404 ? 'mdi:compass-off-outline' : 'mdi:alert-circle-outline'" height="48" />
        </div>
      </div>

      <div class="text-sm uppercase tracking-widest text-white/60 mb-3">
        Chyba {{ error?.statusCode }}
      </div>
      <h1 class="text-4xl md:text-5xl font-black text-white mb-4">
        {{ title }}
      </h1>
      <p class="text-lg text-white/60 mb-10">
        {{ description }}
      </p>

      <!--
        Was white on a violet→pink gradient: 3.53:1 at one end and 4.23:1 at the
        other, i.e. below AA in both themes, and the last piece of the pre-zine
        cosmic palette still sitting on a user-facing button. .zine-btn is the
        site's own sticker button (pink fill, constant dark ink, 13.8:1), and
        --ondark swaps its hard offset for a colour that reads on this splash.
      -->
      <button @click="handleError" class="zine-btn zine-btn--ondark">
        <Icon name="mdi:home-outline" height="22" />
        Zpět na hlavní stránku
      </button>
    </div>
  </div>
</template>

<style scoped>
/* This splash is dark in BOTH themes — that is the design, and it is why every
   text on it is white or a white alpha rather than --pop-ink (which flips to
   near-white and would vanish here in light mode).
   The one thing that must follow the theme is the ground: in dark mode it drops
   onto the palette's own page ground so a 404 does not flash a different black
   than the rest of the shop. No shared token fits — --pop-cream is cream in
   light and --pop-panel is the warm near-black used by cards — so the light
   value stays byte-identical to what shipped and only the dark side is new. */
.error-ground { background: #0d0020; }
@supports (color: light-dark(#fff, #000)) {
  .error-ground { background: light-dark(#0d0020, #1B1129); }
}
</style>
