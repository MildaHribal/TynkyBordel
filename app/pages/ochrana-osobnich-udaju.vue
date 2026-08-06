<script setup lang="ts">
import { Icon } from "@iconify/vue";
import { BUSINESS, CARD_PAYMENT_ENABLED, formattedAddress, orPlaceholder } from "~~/shared/shop";

useSeoMeta({
  title: 'Ochrana osobních údajů | Tynky Bordel',
  description: 'Zásady zpracování osobních údajů v souladu s GDPR v internetovém obchodě Tynky Bordel.',
})

const address = formattedAddress();
const ico = orPlaceholder(BUSINESS.ico, 'IČO');

// Lets a visitor take back (or newly grant) the analytics consent they gave in
// the cookie banner — required counterpart to asking for it in the first place.
const { choice, accept, reject } = useCookieConsent();

// Only the recipients we genuinely use. PostHog is listed separately because it
// runs solely with consent.
const partners = [
  {
    name: 'Dopravci',
    description: 'Zásilkovna, a.s. a Česká pošta, s.p. (Balíkovna) — jméno, adresa výdejního místa, e-mail a telefon pro doručení zásilky.',
    icon: 'mdi:truck-fast-outline',
  },
  // PayPal is only a data processor once card payments are actually enabled.
  ...(CARD_PAYMENT_ENABLED
    ? [{
        name: 'Platební služby',
        description: 'PayPal (Europe) S.à r.l. et Cie, S.C.A. při platbě kartou. U dobírky a převodu platební údaje nezpracováváme — platba jde přímo přes dopravce či banku.',
        icon: 'mdi:credit-card-outline',
      }]
    : []),
  {
    name: 'Hosting a doručování',
    description: 'Provozovatel serveru, na kterém e-shop běží, a Cloudflare, Inc. jako CDN a ochrana proti útokům.',
    icon: 'mdi:server-network-outline',
  },
  {
    name: 'E-mailová schránka',
    description: 'Poskytovatel e-mailové služby, přes kterou odesíláme potvrzení objednávek a odpovědi na dotazy.',
    icon: 'mdi:email-outline',
  },
  {
    name: 'Analytika (jen se souhlasem)',
    description: 'PostHog — měření návštěvnosti. Spouští se výhradně po tvém souhlasu v cookie liště; bez něj se nenačte vůbec.',
    icon: 'mdi:chart-bar',
  },
];

const purposes = [
  {
    title: 'Vyřízení objednávky',
    data: 'Jméno a příjmení, e-mail, telefon, doručovací adresa / výdejní místo, obsah a hodnota objednávky.',
    basis: 'Plnění smlouvy (čl. 6 odst. 1 písm. b GDPR)',
    retention: 'Po dobu trvání smlouvy a následně po dobu promlčecích lhůt.',
  },
  {
    title: 'Účetnictví a daně',
    data: 'Údaje na dokladu o nákupu.',
    basis: 'Plnění právní povinnosti (čl. 6 odst. 1 písm. c GDPR)',
    retention: 'Po dobu stanovenou právními předpisy (zpravidla 10 let).',
  },
  {
    title: 'Uživatelský účet',
    data: 'E-mail, heslo (uložené jako nevratný otisk), volitelně jméno, telefon a adresa, historie objednávek, oblíbené kusy a recenze.',
    basis: 'Plnění smlouvy (čl. 6 odst. 1 písm. b GDPR)',
    retention: 'Do zrušení účtu na tvou žádost.',
  },
  {
    title: 'Newsletter',
    data: 'E-mailová adresa.',
    basis: 'Souhlas (čl. 6 odst. 1 písm. a GDPR)',
    retention: 'Do odvolání souhlasu / odhlášení z odběru.',
  },
  {
    title: 'Měření návštěvnosti',
    data: 'Anonymizované údaje o používání webu.',
    basis: 'Souhlas (čl. 6 odst. 1 písm. a GDPR)',
    retention: 'Do odvolání souhlasu.',
  },
];
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 md:px-8 py-12 md:py-20 text-white/80 leading-relaxed">
    <div class="mb-12 text-center">
      <h1 class="text-3xl md:text-5xl font-black text-white mb-4 neon-text-rainbow uppercase">GDPR &amp; Soukromí 🔒</h1>
      <p class="text-white/40 italic">Ochrana vašich osobních údajů je pro nás prioritou</p>
    </div>

    <div class="glass-card-strong p-6 md:p-10 space-y-12">
      <section>
        <span class="inline-block px-3 py-1 bg-primary-500/20 text-primary-400 text-xs font-bold rounded-full mb-4 border border-primary-500/30 uppercase tracking-widest">Sekce 1</span>
        <h2 class="text-2xl font-bold text-white mb-6">Správce údajů</h2>
        <div class="p-6 bg-white/5 border border-white/5 rounded-2xl flex items-center gap-6">
          <div class="w-16 h-16 rounded-full bg-primary-500/10 flex items-center justify-center flex-shrink-0 border border-primary-500/20">
            <Icon icon="mdi:account-lock" height="32" class="text-primary-400" />
          </div>
          <div>
            <p class="font-bold text-white mb-1">{{ BUSINESS.legalName }}</p>
            <p class="text-white/60 text-sm">Sídlo: {{ address }}</p>
            <p class="text-white/60 text-sm">IČO: {{ ico }}</p>
            <p class="text-primary-400 text-sm font-medium mt-2">{{ BUSINESS.email }}</p>
          </div>
        </div>
        <p class="text-sm text-white/50 mt-4">
          Správce nejmenoval pověřence pro ochranu osobních údajů — ve všech věcech ochrany údajů piš přímo na
          <strong class="text-primary-300">{{ BUSINESS.email }}</strong>.
        </p>
      </section>

      <div class="cosmic-divider opacity-5"></div>

      <section>
        <span class="inline-block px-3 py-1 bg-secondary-500/20 text-secondary-400 text-xs font-bold rounded-full mb-4 border border-secondary-500/30 uppercase tracking-widest">Sekce 2</span>
        <h2 class="text-2xl font-bold text-white mb-6">Co zpracováváme, proč a jak dlouho</h2>
        <div class="space-y-4">
          <div v-for="purpose in purposes" :key="purpose.title" class="p-5 bg-white/5 rounded-xl border border-white/5">
            <p class="font-bold text-white mb-2">{{ purpose.title }}</p>
            <p class="text-sm mb-3">{{ purpose.data }}</p>
            <div class="flex flex-col sm:flex-row gap-2 sm:gap-6 text-xs text-white/45">
              <span><strong class="text-white/60">Právní základ:</strong> {{ purpose.basis }}</span>
              <span><strong class="text-white/60">Doba uchování:</strong> {{ purpose.retention }}</span>
            </div>
          </div>
        </div>
        <p class="text-sm text-white/50 mt-4">
          Osobní údaje nepředáváme mimo EU s výjimkou služeb uvedených níže, které údaje zpracovávají
          na základě standardních smluvních doložek. Nedochází k automatizovanému rozhodování ani profilování.
        </p>
      </section>

      <div class="cosmic-divider opacity-5"></div>

      <section>
        <span class="inline-block px-3 py-1 bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded-full mb-4 border border-emerald-500/30 uppercase tracking-widest">Sekce 3</span>
        <h2 class="text-2xl font-bold text-white mb-6">Komu údaje předáváme?</h2>
        <p class="mb-8">
          Vaše soukromí chráníme. Data předáváme jen v nezbytném rozsahu těmto zpracovatelům:
        </p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div v-for="partner in partners" :key="partner.name" class="p-5 bg-white/5 rounded-xl border border-white/5 flex gap-4">
            <Icon :icon="partner.icon" class="text-emerald-400 mt-1 flex-shrink-0" height="24" />
            <div>
              <p class="font-bold text-white text-sm mb-1 uppercase tracking-tight">{{ partner.name }}</p>
              <p class="text-white/40 text-xs leading-relaxed">{{ partner.description }}</p>
            </div>
          </div>
        </div>
      </section>

      <div class="cosmic-divider opacity-5"></div>

      <section>
        <span class="inline-block px-3 py-1 bg-amber-500/20 text-amber-400 text-xs font-bold rounded-full mb-4 border border-amber-500/30 uppercase tracking-widest">Sekce 4</span>
        <h2 class="text-2xl font-bold text-white mb-6">Cookies a měření návštěvnosti</h2>
        <p class="mb-4">
          Nezbytné úložiště (obsah košíku, přihlášení, tvoje volba níže) používáme vždy — bez něj by e-shop nefungoval
          a souhlas pro něj zákon nevyžaduje.
        </p>
        <p class="mb-6">
          Analytiku spouštíme <strong class="text-white">výhradně s tvým souhlasem</strong>. Dokud ho nedáš, nenačte se
          vůbec žádný analytický skript. Souhlas můžeš kdykoliv změnit:
        </p>
        <div class="p-5 bg-white/5 border border-white/10 rounded-2xl flex flex-col sm:flex-row sm:items-center gap-4">
          <div class="flex-grow">
            <p class="text-sm text-white/70">
              Aktuální nastavení:
              <strong v-if="choice === 'accepted'" class="text-emerald-300">analytika povolena</strong>
              <strong v-else-if="choice === 'rejected'" class="text-white">jen nezbytné</strong>
              <strong v-else class="text-white/60">zatím nezvoleno</strong>
            </p>
          </div>
          <div class="flex gap-2 flex-shrink-0">
            <button type="button" class="px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider border border-white/20 text-white/80 hover:bg-white/10 transition" @click="reject">
              Jen nezbytné
            </button>
            <button type="button" class="px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider bg-white text-[#1a0f28] hover:bg-white/90 transition" @click="accept">
              Povolit analytiku
            </button>
          </div>
        </div>
      </section>

      <div class="cosmic-divider opacity-5"></div>

      <section>
        <span class="inline-block px-3 py-1 bg-sky-500/20 text-sky-400 text-xs font-bold rounded-full mb-4 border border-sky-500/30 uppercase tracking-widest">Sekce 5</span>
        <h2 class="text-2xl font-bold text-white mb-4">Vaše práva</h2>
        <p class="mb-4">
          Podle GDPR máš právo na přístup ke svým údajům, na jejich opravu, výmaz („právo být zapomenut“),
          omezení zpracování, přenositelnost údajů a právo vznést námitku proti zpracování.
          Pokud je zpracování založené na souhlasu, můžeš ho kdykoliv odvolat — zákonnost zpracování
          před odvoláním tím není dotčena.
        </p>
        <p class="mb-4">
          Stačí napsat na <strong class="text-sky-400">{{ BUSINESS.email }}</strong>. Vyřídíme to nejpozději do jednoho měsíce.
        </p>
        <p class="text-sm text-white/50">
          Máš také právo podat stížnost u dozorového úřadu, kterým je
          <strong class="text-white/70">Úřad pro ochranu osobních údajů</strong>, Pplk. Sochora 27, 170 00 Praha 7,
          <a href="https://www.uoou.cz" target="_blank" rel="noopener noreferrer" class="text-sky-400 underline">www.uoou.cz</a>.
        </p>
      </section>

      <p class="p-6 bg-gradient-to-r from-primary-500/10 to-transparent border-l-2 border-primary-500 rounded-r-2xl text-xs italic text-white/40">
        Pokud se přihlásíš k odběru newsletteru, budeme ti zasílat novinky o naší tvorbě.
        Z odběru se můžeš kdykoliv odhlásit odkazem v každém e-mailu nebo na stránce
        <NuxtLink to="/newsletter/odhlaseni" class="text-primary-300 underline">odhlášení z newsletteru</NuxtLink>.
      </p>
    </div>

    <div class="mt-12 text-center">
      <NuxtLink to="/" class="btn-cosmic px-8 py-3 inline-flex items-center gap-2">
        <Icon icon="mdi:arrow-left" />
        Zpět na hlavní stranu
      </NuxtLink>
    </div>
  </div>
</template>
