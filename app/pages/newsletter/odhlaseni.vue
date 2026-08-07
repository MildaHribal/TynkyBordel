<script setup lang="ts">


useSeoMeta({
  title: 'Odhlášení z newsletteru',
  description: 'Odhlaste se z odběru novinek Tynky Bordel.',
  robots: 'noindex,nofollow',
});

const route = useRoute();

// Prefilled when arriving from the unsubscribe link in an email.
const email = ref(String(route.query.email || ''));
const isSubmitting = ref(false);
const done = ref(false);
const errorMessage = ref('');

async function unsubscribe() {
  if (isSubmitting.value || !email.value.trim()) return;
  isSubmitting.value = true;
  errorMessage.value = '';

  try {
    await $fetch('/api/newsletter/unsubscribe', {
      method: 'POST',
      body: { email: email.value.trim(), token: route.query.token || undefined },
    });
    done.value = true;
  } catch (err: any) {
    errorMessage.value =
      err?.data?.statusMessage || err?.statusMessage || 'Odhlášení se nepodařilo. Zkus to prosím znovu.';
  } finally {
    isSubmitting.value = false;
  }
}

// Arriving with a signed link means the intent is already clear — do it right away.
onMounted(() => {
  if (route.query.email && route.query.token) unsubscribe();
});
</script>

<template>
  <div class="max-w-xl mx-auto px-4 md:px-8 py-16 md:py-24 text-white/80">
    <div class="glass-card-strong p-8 md:p-10 text-center">
      <div class="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-6">
        <Icon :name="done ? 'mdi:email-off-outline' : 'mdi:email-outline'" height="30" class="text-primary-300" />
      </div>

      <template v-if="done">
        <h1 class="text-2xl md:text-3xl font-black text-white mb-3">Odhlášeno</h1>
        <p class="mb-8">
          Adresu <strong class="text-white">{{ email }}</strong> jsme odstranili z odběru novinek.
          Už ti nic posílat nebudeme.
        </p>
        <NuxtLink to="/" class="btn-cosmic px-8 py-3 inline-flex items-center gap-2">
          <Icon name="mdi:arrow-left" />
          Zpět do obchodu
        </NuxtLink>
      </template>

      <template v-else>
        <h1 class="text-2xl md:text-3xl font-black text-white mb-3">Odhlášení z newsletteru</h1>
        <p class="mb-8 text-sm">
          Zadej e-mail, na který ti novinky chodí. Odhlášení je okamžité a bez otázek.
        </p>

        <form class="flex flex-col gap-4" @submit.prevent="unsubscribe">
          <input
            v-model="email"
            type="email"
            required
            placeholder="tvuj@email.cz"
            class="input-cosmic w-full text-center"
            autocomplete="email"
          />
          <button
            type="submit"
            :disabled="isSubmitting || !email.trim()"
            class="btn-cosmic px-8 py-3 inline-flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Icon v-if="isSubmitting" name="lucide:loader-2" height="18" class="animate-spin" />
            {{ isSubmitting ? 'Odhlašuji…' : 'Odhlásit se' }}
          </button>
        </form>

        <p v-if="errorMessage" class="mt-4 text-sm text-red-300">{{ errorMessage }}</p>
      </template>
    </div>
  </div>
</template>
