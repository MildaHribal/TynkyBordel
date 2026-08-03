<script setup lang="ts">
import { Icon } from "@iconify/vue";
import { BUSINESS, COD_FEE, SHIPPING_FEE, SHIPPING_OPTIONS, formattedAddress, orPlaceholder } from "~~/shared/shop";

useSeoMeta({
  title: 'Obchodní podmínky | Tynky Bordel',
  description: 'Všeobecné obchodní podmínky internetového obchodu Tynky Bordel.',
})

const address = formattedAddress();
const ico = orPlaceholder(BUSINESS.ico, 'IČO');
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 md:px-8 py-12 md:py-20 text-white/80 leading-relaxed">
    <div class="mb-10 text-center">
      <h1 class="text-3xl md:text-5xl font-black text-white mb-4 neon-text-rainbow">Obchodní podmínky 📜</h1>
      <p class="text-white/40 italic">Účinné od 27. července 2026</p>
    </div>

    <div class="glass-card-strong p-6 md:p-10 space-y-8">
      <section>
        <h2 class="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Icon icon="mdi:store-outline" class="text-primary-400" />
          1. Prodávající
        </h2>
        <div class="p-5 bg-white/5 border border-white/5 rounded-2xl space-y-1 text-sm">
          <p class="text-white font-bold text-base">{{ BUSINESS.legalName }}</p>
          <p>Sídlo: {{ address }}</p>
          <p>IČO: {{ ico }}</p>
          <p v-if="BUSINESS.dic">DIČ: {{ BUSINESS.dic }}</p>
          <p>E-mail: <a :href="`mailto:${BUSINESS.email}`" class="text-primary-300">{{ BUSINESS.email }}</a></p>
          <p v-if="BUSINESS.phone">Telefon: {{ BUSINESS.phone }}</p>
          <p class="text-white/50 pt-2">
            Podnikatel zapsaný v živnostenském rejstříku.
            Dozorový orgán: {{ BUSINESS.tradeAuthority }}.
          </p>
          <p v-if="!BUSINESS.isVatPayer" class="text-white/50">Prodávající není plátcem DPH.</p>
        </div>
      </section>

      <section>
        <h2 class="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Icon icon="mdi:info-outline" class="text-primary-400" />
          2. Úvodní ustanovení
        </h2>
        <ul class="list-disc list-inside space-y-2 ml-4">
          <li>
            Tyto obchodní podmínky upravují vzájemná práva a povinnosti mezi Prodávajícím a Kupujícím
            při nákupu v internetovém obchodě <strong>{{ BUSINESS.domain }}</strong>.
          </li>
          <li>Vztahy neupravené těmito podmínkami se řídí právním řádem České republiky, zejména občanským zákoníkem a zákonem o ochraně spotřebitele.</li>
          <li>Je-li Kupujícím spotřebitel, nemají tyto podmínky vliv na jeho práva vyplývající z kogentních ustanovení zákona.</li>
        </ul>
      </section>

      <section>
        <h2 class="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Icon icon="mdi:file-certificate-outline" class="text-secondary-400" />
          3. Objednávka a uzavření kupní smlouvy
        </h2>
        <ul class="list-disc list-inside space-y-2 ml-4">
          <li>Prezentace zboží v e-shopu je informativní povahy; kupní smlouva vzniká potvrzením objednávky ze strany Prodávajícího.</li>
          <li>Odesláním objednávky Kupující stvrzuje, že se s těmito podmínkami seznámil a souhlasí s nimi.</li>
          <li>Potvrzení objednávky Prodávající zasílá na e-mail uvedený v objednávce.</li>
          <li>Předmětem prodeje jsou ručně vyráběné originály — obrazy, sochy, klíčenky a podobné autorské kusy. Většina zboží je unikát dostupný v jediném kuse.</li>
          <li>Drobné odchylky ve vzhledu oproti fotografiím jsou dané ruční výrobou a nejsou vadou zboží.</li>
        </ul>
      </section>

      <section>
        <h2 class="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Icon icon="mdi:currency-usd" class="text-emerald-400" />
          4. Ceny a platba
        </h2>
        <ul class="list-disc list-inside space-y-2 ml-4">
          <li>Všechny ceny uvedené u zboží jsou konečné<span v-if="!BUSINESS.isVatPayer"> (Prodávající není plátcem DPH)</span>.</li>
          <li>K ceně zboží se připočítává poštovné <strong>{{ SHIPPING_FEE }} Kč</strong>; u dobírky navíc doběrečné <strong>{{ COD_FEE }} Kč</strong>. Celková částka je vždy zobrazena před odesláním objednávky.</li>
          <li>Platit lze <strong>dobírkou</strong>, <strong>převodem na účet</strong> (včetně QR platby) nebo <strong>kartou přes PayPal</strong>.</li>
          <li>U platby předem je zboží odesíláno až po připsání částky na účet Prodávajícího; u dobírky se platí při převzetí.</li>
          <li>Doklad o nákupu Prodávající zasílá elektronicky na e-mail Kupujícího.</li>
        </ul>
      </section>

      <section>
        <h2 class="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Icon icon="mdi:truck-delivery-outline" class="text-sky-400" />
          5. Doprava a doručení
        </h2>
        <ul class="list-disc list-inside space-y-2 ml-4">
          <li>Zboží odesíláme obvykle do 2 pracovních dnů, nejpozději do 7 dnů (u platby předem od připsání platby).</li>
          <li v-for="option in SHIPPING_OPTIONS" :key="option.id">
            <strong>{{ option.name }}</strong> — {{ option.price }} Kč. {{ option.note }}
          </li>
          <li>Nebezpečí škody na zboží přechází na Kupujícího převzetím zásilky.</li>
          <li>Doporučujeme zásilku při převzetí zkontrolovat; zjevné poškození obalu je vhodné řešit ihned s dopravcem.</li>
        </ul>
      </section>

      <section>
        <h2 class="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Icon icon="mdi:undo-variant" class="text-orange-400" />
          6. Odstoupení od smlouvy
        </h2>
        <p class="mb-3">
          Kupující, který je spotřebitelem, má právo odstoupit od kupní smlouvy bez udání důvodu ve lhůtě
          <strong>14 dnů</strong> ode dne převzetí zboží.
        </p>
        <ul class="list-disc list-inside space-y-2 ml-4 mb-3">
          <li>Odstoupení stačí ve lhůtě odeslat — postačí e-mail na {{ BUSINESS.email }}. Lze využít i vzorový formulář na stránce <NuxtLink to="/reklamace" class="text-primary-300 underline">Doprava &amp; reklamace</NuxtLink>.</li>
          <li>Zboží Kupující odešle bez zbytečného odkladu, nejpozději do 14 dnů od odstoupení, na adresu Prodávajícího: {{ address }}.</li>
          <li>Náklady na vrácení zboží nese Kupující.</li>
          <li>Prodávající vrátí přijaté peněžní prostředky včetně nákladů na dodání (ve výši nejlevnějšího nabízeného způsobu dodání) do 14 dnů od odstoupení; není však povinen je vrátit dříve, než mu Kupující zboží předá nebo prokáže jeho odeslání.</li>
          <li>Kupující odpovídá za snížení hodnoty zboží, které vzniklo nakládáním s ním jinak, než je nutné k seznámení se s jeho povahou a vlastnostmi.</li>
        </ul>
        <p class="text-sm text-white/50 italic">
          Právo na odstoupení se nevztahuje na zboží vyrobené na zakázku podle individuálního přání Kupujícího.
        </p>
      </section>

      <section>
        <h2 class="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Icon icon="mdi:shield-check-outline" class="text-amber-400" />
          7. Práva z vadného plnění a reklamace
        </h2>
        <p>
          Práva z vadného plnění se řídí občanským zákoníkem. Spotřebitel může vadu vytknout do
          <strong>24 měsíců</strong> od převzetí zboží. Podrobný postup najdeš na stránce
          <NuxtLink to="/reklamace" class="text-primary-300 underline">Doprava &amp; reklamace</NuxtLink>.
          Reklamaci Prodávající vyřídí nejpozději do 30 dnů.
        </p>
      </section>

      <section>
        <h2 class="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Icon icon="mdi:gavel" class="text-rose-400" />
          8. Mimosoudní řešení sporů
        </h2>
        <p>
          K mimosoudnímu řešení spotřebitelských sporů z kupní smlouvy je příslušná
          <strong>Česká obchodní inspekce</strong>, se sídlem Gorazdova 1969/24, 120 00 Praha 2,
          IČO: 000 20 869, internetová adresa
          <a href="https://www.coi.cz" target="_blank" rel="noopener noreferrer" class="text-primary-300 underline">www.coi.cz</a>.
          Kupující se může vždy obrátit i přímo na Prodávajícího na adrese {{ BUSINESS.email }}.
        </p>
      </section>

      <section>
        <h2 class="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Icon icon="mdi:lock-outline" class="text-violet-400" />
          9. Ochrana osobních údajů
        </h2>
        <p>
          Zpracování osobních údajů popisuje samostatný dokument
          <NuxtLink to="/ochrana-osobnich-udaju" class="text-primary-300 underline">Ochrana osobních údajů</NuxtLink>.
        </p>
      </section>

      <section>
        <h2 class="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Icon icon="mdi:flag-checkered" class="text-white/60" />
          10. Závěrečná ustanovení
        </h2>
        <ul class="list-disc list-inside space-y-2 ml-4">
          <li>Znění obchodních podmínek může Prodávající měnit či doplňovat; pro objednávku platí znění účinné v okamžiku jejího odeslání.</li>
          <li>Kupní smlouva je archivována v elektronické podobě a není přístupná třetím osobám.</li>
          <li>Smlouvu lze uzavřít v českém jazyce.</li>
        </ul>
      </section>

      <div class="cosmic-divider opacity-10"></div>

      <p class="text-xs text-white/30 text-center">
        Tyto podmínky jsou platné pro všechny transakce v rámci e-shopu {{ BUSINESS.domain }}.
      </p>
    </div>

    <div class="mt-12 text-center">
      <NuxtLink to="/" class="btn-cosmic px-8 py-3 inline-flex items-center gap-2">
        <Icon icon="mdi:arrow-left" />
        Zpět k nakupování
      </NuxtLink>
    </div>
  </div>
</template>
