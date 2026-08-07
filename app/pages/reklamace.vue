<script setup lang="ts">

import { BUSINESS, CARD_PAYMENT_ENABLED, COD_FEE, PAYMENT_OPTIONS, SHIPPING_OPTIONS, formattedAddress, orPlaceholder } from "~~/shared/shop";

useSeoMeta({
  title: 'Doprava a reklamace | Tynky Bordel',
  description: 'Informace o přepravě a postup pro vrácení zboží a reklamace v e-shopu Tynky Bordel.',
})

const address = formattedAddress();
const ico = orPlaceholder(BUSINESS.ico, 'IČO');

// Ready-to-paste withdrawal notice — a spotřebitel must be given one.
const withdrawalTemplate = `Oznámení o odstoupení od kupní smlouvy

Adresát: ${BUSINESS.legalName}, ${address}, IČO: ${ico}
E-mail: ${BUSINESS.email}

Oznamuji, že tímto odstupuji od smlouvy o nákupu tohoto zboží:
  ...................................................

Číslo objednávky: ..................................
Datum objednání: ...................................
Datum obdržení zboží: ..............................

Jméno a příjmení spotřebitele: .....................
Adresa spotřebitele: ...............................
Číslo účtu pro vrácení peněz: ......................

Datum: .............................................
Podpis (pouze pokud je formulář zasílán v listinné podobě): ..............`;

const copied = ref(false);
const toast = useCosmicToast();

async function copyTemplate() {
  try {
    await navigator.clipboard.writeText(withdrawalTemplate);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2500);
  } catch {
    toast.error('Nepodařilo se zkopírovat', 'Text můžeš označit a zkopírovat ručně.');
  }
}
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 md:px-8 py-12 md:py-20 text-white/80 leading-relaxed">
    <div class="mb-10 text-center">
      <h1 class="text-3xl md:text-5xl font-black text-white mb-4 neon-text-rainbow uppercase">Reklamace &amp; Doprava 📦</h1>
      <p class="page-lede italic">Vracení, výměna a doprava zboží</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
      <!-- Shipping Info -->
      <div class="glass-card-strong p-6 md:p-8 flex flex-col items-center text-center">
        <div class="w-16 h-16 rounded-full bg-primary-500/20 flex items-center justify-center mb-6 border border-primary-500/30">
          <Icon name="mdi:truck-fast-outline" height="32" class="text-primary-400" />
        </div>
        <h2 class="text-xl font-bold text-white mb-4">Doprava</h2>
        <p class="text-sm mb-6">Zboží odesíláme do 2–7 pracovních dnů (u platby předem od připsání platby).</p>
        <ul class="w-full space-y-3">
          <li v-for="method in SHIPPING_OPTIONS" :key="method.id" class="flex justify-between items-center text-sm p-3 bg-white/5 rounded-lg border border-white/5 gap-3">
            <div class="flex items-center gap-2 text-left min-w-0">
              <Icon :name="method.icon" class="text-primary-300 flex-shrink-0" />
              <span class="truncate">{{ method.name }}</span>
            </div>
            <span class="font-bold text-white whitespace-nowrap">{{ method.price }} Kč</span>
          </li>
        </ul>
      </div>

      <!-- Payment Info -->
      <div class="glass-card-strong p-6 md:p-8 flex flex-col items-center text-center">
        <div class="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-6 border border-emerald-500/30">
          <Icon name="mdi:cash-multiple" height="32" class="text-emerald-400" />
        </div>
        <h2 class="text-xl font-bold text-white mb-4">Platba</h2>
        <p class="text-sm mb-6">{{ CARD_PAYMENT_ENABLED ? 'Zaplatíš dobírkou, převodem na účet s QR kódem, nebo kartou přes PayPal.' : 'Zaplatíš dobírkou nebo převodem na účet s QR kódem.' }}</p>
        <ul class="w-full space-y-3">
          <li v-for="option in PAYMENT_OPTIONS" :key="option.id" class="flex justify-between items-center text-sm p-3 bg-white/5 rounded-lg border border-white/5 gap-3">
            <div class="flex items-center gap-2 text-left min-w-0">
              <Icon name="mdi:check-circle-outline" class="text-emerald-300 flex-shrink-0" />
              <span class="truncate">{{ option.name }}</span>
            </div>
            <span class="text-white/50 text-xs whitespace-nowrap">{{ option.id === 'cash' ? `+ ${COD_FEE} Kč` : '' }}</span>
          </li>
        </ul>
      </div>
    </div>

    <div class="glass-card p-6 md:p-10 space-y-10">
      <section>
        <h2 class="text-2xl font-black text-white mb-6 border-b border-primary-500/20 pb-2">Vrácení zboží &amp; Odstoupení</h2>
        <div class="space-y-4">
          <p>
            Jako spotřebitel máš právo odstoupit od smlouvy bez udání důvodu do <strong>14 dnů</strong> od převzetí zboží.
            Lhůta je dodržena, pokud odstoupení v jejím průběhu odešleš.
          </p>
          <div class="p-5 bg-white/5 border-l-4 border-primary-500 rounded-r-xl">
            <h3 class="font-bold text-white mb-2">Postup pro vrácení:</h3>
            <ol class="list-decimal list-inside space-y-2 ml-2">
              <li>Napiš nám na <strong class="text-primary-300">{{ BUSINESS.email }}</strong> (můžeš použít formulář níže).</li>
              <li>Zboží pečlivě zabal, ideálně do původního obalu.</li>
              <li>Odešli na adresu: <strong class="text-white">{{ BUSINESS.legalName }}, {{ address }}</strong>.</li>
            </ol>
          </div>
          <ul class="list-disc list-inside space-y-2 ml-4 text-sm">
            <li>Náklady na vrácení zboží neseš ty.</li>
            <li>Peníze vracíme do 14 dnů od odstoupení, včetně poštovného ve výši nejlevnějšího nabízeného způsobu dodání — nejdříve však po převzetí zboží zpět nebo poté, co prokážeš jeho odeslání.</li>
            <li>Odpovídáš za snížení hodnoty zboží, pokud s ním bylo nakládáno jinak, než je nutné k seznámení se s jeho povahou a vlastnostmi.</li>
            <li>Odstoupit nelze u zboží vyrobeného na zakázku podle tvého individuálního přání.</li>
          </ul>
        </div>
      </section>

      <section>
        <h2 class="text-2xl font-black text-white mb-6 border-b border-sky-500/20 pb-2">Vzorový formulář pro odstoupení</h2>
        <p class="text-sm mb-4">Nemusíš ho použít — stačí i obyčejný e-mail. Ale když se ti hodí, je tady:</p>
        <pre class="p-5 bg-black/30 border border-white/10 rounded-xl text-xs md:text-sm text-white/70 overflow-x-auto whitespace-pre-wrap">{{ withdrawalTemplate }}</pre>
        <button
          type="button"
          class="mt-4 px-6 py-3 rounded-full text-xs font-bold uppercase tracking-wider bg-white on-light-fill hover:bg-white/90 transition inline-flex items-center gap-2"
          @click="copyTemplate"
        >
          <Icon :name="copied ? 'mdi:check' : 'mdi:content-copy'" height="16" />
          {{ copied ? 'Zkopírováno' : 'Zkopírovat formulář' }}
        </button>
      </section>

      <section>
        <h2 class="text-2xl font-black text-white mb-6 border-b border-amber-500/20 pb-2">Reklamační řád</h2>
        <div class="space-y-4">
          <p>
            Vadu zboží můžeš vytknout do <strong>24 měsíců</strong> od převzetí. Reklamaci vyřídíme
            nejpozději do 30 dnů od jejího uplatnění a o výsledku tě budeme informovat e-mailem.
          </p>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="p-5 bg-white/5 rounded-xl">
              <h3 class="font-bold text-white mb-3">Na co se práva z vad vztahují?</h3>
              <p class="text-sm">Na výrobní vady a vady materiálu, které se projeví v zákonné lhůtě, a na rozpor zboží s objednávkou.</p>
            </div>
            <div class="p-5 bg-white/5 rounded-xl border border-red-500/10">
              <h3 class="font-bold text-white mb-3 text-red-400">Na co se nevztahují?</h3>
              <p class="text-sm">Běžné opotřebení používáním, mechanické poškození, nevhodné zacházení a drobné odchylky dané ruční výrobou (struktura, odstín, stopy po nástroji).</p>
            </div>
          </div>
          <div class="p-5 bg-white/5 border-l-4 border-amber-500 rounded-r-xl">
            <h3 class="font-bold text-white mb-2">Jak reklamovat:</h3>
            <ol class="list-decimal list-inside space-y-2 ml-2 text-sm">
              <li>Napiš na <strong class="text-amber-300">{{ BUSINESS.email }}</strong> — přilož číslo objednávky, popis vady a ideálně fotku.</li>
              <li>Domluvíme se na dalším postupu a případném zaslání zboží na adresu {{ address }}.</li>
              <li>Po vyřízení tě e-mailem informujeme o výsledku.</li>
            </ol>
          </div>
        </div>
      </section>

      <section>
        <h2 class="text-2xl font-black text-white mb-6 border-b border-rose-500/20 pb-2">Když se nedohodneme</h2>
        <p class="text-sm">
          K mimosoudnímu řešení spotřebitelských sporů je příslušná <strong class="text-white">Česká obchodní inspekce</strong>,
          Gorazdova 1969/24, 120 00 Praha 2, IČO: 000 20 869,
          <a href="https://www.coi.cz" target="_blank" rel="noopener noreferrer" class="text-rose-300 underline">www.coi.cz</a>.
          Vždycky ale nejdřív zkus napsat nám — skoro všechno se dá vyřešit po dobrém.
        </p>
      </section>
    </div>

    <div class="mt-12 text-center">
      <NuxtLink to="/" class="btn-cosmic px-8 py-3 inline-flex items-center gap-2">
        <Icon name="mdi:arrow-left" />
        Zpět k nákupu
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
/* Everything on this page except the header block sits inside .glass-card /
   .glass-card-strong, which zine.css re-skins to --pop-panel — a surface that
   is dark in BOTH themes, so the white-ish Tailwind utilities inside the cards
   are correct there and are left alone.
   This lede is the exception: it lands on the page ground, cream in light mode,
   where the fixed `text-white/40` was effectively invisible. */
.page-lede { color: var(--pop-ink-mute); }

/* Label on a fill that stays LIGHT in both themes (bg-white), so the ink on it
   must stay dark — --pop-ink would flip to near-white and disappear. */
.on-light-fill { color: var(--pop-ink-on-accent); }
</style>
