<script setup lang="ts">


useSeoMeta({
  title: 'Potvrzení odběru newsletteru',
  description: 'Potvrď odběr novinek Tynky Bordel.',
  robots: 'noindex,nofollow',
});

const route = useRoute();

// Both come from the signed link in the confirmation email; without them there
// is nothing to confirm, since the token is what proves the address is yours.
const email = ref(String(route.query.email || ''));
const token = ref(String(route.query.token || ''));

const isSubmitting = ref(false);
const done = ref(false);
const errorMessage = ref('');

async function confirm() {
  if (isSubmitting.value || !email.value.trim() || !token.value) return;
  isSubmitting.value = true;
  errorMessage.value = '';

  try {
    await $fetch('/api/newsletter/confirm', {
      method: 'POST',
      body: { email: email.value.trim(), token: token.value },
    });
    done.value = true;
  } catch (err: any) {
    errorMessage.value =
      err?.data?.statusMessage || err?.statusMessage || 'Potvrzení se nepodařilo. Zkus to prosím znovu.';
  } finally {
    isSubmitting.value = false;
  }
}

// The click on the emailed button IS the consent — don't make it a second click.
onMounted(() => {
  if (email.value && token.value) confirm();
  else errorMessage.value = 'Odkaz je neúplný. Otevři prosím celý odkaz z e-mailu.';
});
</script>

<template>
  <div class="max-w-xl mx-auto px-4 md:px-8 py-16 md:py-24 text-white/80">
    <div class="glass-card-strong p-8 md:p-10 text-center">
      <div class="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-6">
        <Icon :name="done ? 'mdi:email-check-outline' : 'mdi:email-outline'" height="30" class="text-primary-300" />
      </div>

      <template v-if="done">
        <h1 class="text-2xl md:text-3xl font-black text-white mb-3">Odběr potvrzen</h1>
        <p class="mb-8">
          Adresu <strong class="text-white">{{ email }}</strong> jsme přidali k odběru novinek.
          Ozveme se, až přibude nový kousek — a odhlásit se můžeš kdykoliv jedním klikem.
        </p>
        <NuxtLink to="/" class="btn-cosmic px-8 py-3 inline-flex items-center gap-2">
          <Icon name="mdi:arrow-left" />
          Zpět do obchodu
        </NuxtLink>
      </template>

      <template v-else-if="errorMessage">
        <h1 class="text-2xl md:text-3xl font-black text-white mb-3">Odkaz nefunguje</h1>
        <p class="mb-6 text-sm">{{ errorMessage }}</p>
        <p class="mb-8 text-sm">
          Zkus prosím odkaz z e-mailu otevřít znovu, nebo se přihlas ještě jednou ve formuláři v patičce.
        </p>
        <NuxtLink to="/" class="btn-cosmic px-8 py-3 inline-flex items-center gap-2">
          <Icon name="mdi:arrow-left" />
          Zpět do obchodu
        </NuxtLink>
      </template>

      <template v-else>
        <h1 class="text-2xl md:text-3xl font-black text-white mb-3">Potvrzuji odběr…</h1>
        <p class="mb-8 text-sm inline-flex items-center gap-2">
          <Icon name="lucide:loader-2" height="18" class="animate-spin" />
          Chvilku strpení.
        </p>
      </template>
    </div>
  </div>
</template>
