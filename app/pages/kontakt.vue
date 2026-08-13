<script setup lang="ts">
import ContactForm from "~/components/ContactForm.vue";

import { BUSINESS, formattedAddress, orPlaceholder } from "~~/shared/shop";

useSeoMeta({
  title: 'Kontakt | Tynky Bordel',
  description: 'Kontakt na Tynky Bordel — identifikace prodávajícího, e-mail, sídlo a IČO. Napiš nám přes formulář nebo mailem.',
})

// Same two derived strings the legal pages build, and for the same reason: the
// identity must never be typed into a template by hand, or the pages drift
// apart the first time something changes in the trade register.
const address = formattedAddress();
const ico = orPlaceholder(BUSINESS.ico, 'IČO');
// tel: chokes on the spaces a human-readable number is written with; built here
// rather than in the template so the regex stays out of the expression parser.
const phoneHref = `tel:${BUSINESS.phone.replace(/\s+/g, '')}`;
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 md:px-8 py-12 md:py-20 text-white/80 leading-relaxed">
    <div class="mb-10 text-center">
      <h1 class="text-3xl md:text-5xl font-black text-white mb-4 neon-text-rainbow uppercase">Kontakt 💌</h1>
      <p class="page-lede italic">Napiš nám — na cokoliv od objednávky po reklamaci</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
      <!-- Seller identity. A Czech e-shop has to state this somewhere obvious;
           until now it lived only in section 1 of the VOP. -->
      <div class="glass-card-strong p-6 md:p-8">
        <h2 class="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Icon name="mdi:store-outline" class="text-primary-400" />
          Prodávající
        </h2>
        <div class="p-5 bg-white/5 border border-white/5 rounded-2xl space-y-1 text-sm">
          <p class="text-white font-bold text-base">{{ BUSINESS.legalName }}</p>
          <p>Sídlo: {{ address }}</p>
          <p>IČO: {{ ico }}</p>
          <p v-if="BUSINESS.dic">DIČ: {{ BUSINESS.dic }}</p>
          <p>
            E-mail:
            <a :href="`mailto:${BUSINESS.email}`" class="text-primary-300 underline">{{ BUSINESS.email }}</a>
          </p>
          <!-- Phone is optional in shared/shop.ts — shown only once it's filled in,
               so the page never advertises a line nobody picks up. -->
          <p v-if="BUSINESS.phone">
            Telefon:
            <a :href="phoneHref" class="text-primary-300 underline">{{ BUSINESS.phone }}</a>
          </p>
          <p class="text-white/50 pt-2">
            Podnikatel zapsaný v živnostenském rejstříku.
            Dozorový orgán: {{ BUSINESS.tradeAuthority }}.
          </p>
          <p v-if="!BUSINESS.isVatPayer" class="text-white/50">Prodávající není plátcem DPH.</p>
        </div>
        <p class="text-xs text-white/50 mt-4">
          Zboží vracej a reklamuj na stejnou adresu — postup najdeš v
          <NuxtLink to="/reklamace" class="text-primary-300 underline">Dopravě &amp; reklamacích</NuxtLink>.
        </p>
      </div>

      <!-- Socials mirror the footer's "Sleduj" column, so both places point at
           the same four profiles. -->
      <div class="glass-card-strong p-6 md:p-8">
        <h2 class="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Icon name="mdi:heart-outline" class="text-secondary-400" />
          Kde nás najdeš
        </h2>
        <p class="text-sm mb-5">Nové produkty ukazuju nejdřív na sockách. Napsat můžeš i tam 😜.</p>
        <div class="flex flex-col gap-3">
          <a href="https://www.instagram.com/_kristyna_aaa/" target="_blank" rel="noopener noreferrer" class="social-pill social-pill--instagram" aria-label="Instagram Kristýna">
            <Icon name="mdi:instagram" height="18" />
            <span>Instagram</span>
          </a>
          <a href="https://www.instagram.com/tynky_bordel/" target="_blank" rel="noopener noreferrer" class="social-pill social-pill--instagram" aria-label="Instagram Tynky Bordel">
            <Icon name="mdi:instagram" height="18" />
            <span>Instagram (Tynky Bordel)</span>
          </a>
          <a href="https://www.tiktok.com/@_kristyna_aaa" target="_blank" rel="noopener noreferrer" class="social-pill social-pill--tiktok" aria-label="TikTok">
            <Icon name="ic:baseline-tiktok" height="18" />
            <span>TikTok</span>
          </a>
          <a href="https://linktr.ee/tynky_bordel" target="_blank" rel="noopener noreferrer" class="social-pill social-pill--linktree" aria-label="Linktree">
            <Icon name="simple-icons:linktree" height="18" />
            <span>Linktree</span>
          </a>
        </div>
      </div>
    </div>

    <!-- The form used to be reachable only from a product detail page, i.e. only
         while a piece was still on sale. -->
    <div class="mb-12">
      <ContactForm />
    </div>

    <div class="glass-card p-6 md:p-8">
      <h2 class="text-xl font-bold text-white mb-4 flex items-center gap-2">
        <Icon name="mdi:file-document-outline" class="text-sky-400" />
        Než napíšeš
      </h2>
      <p class="text-sm mb-5">Odpověď na spoustu otázek už někde máme sepsanou:</p>
      <ul class="space-y-3 text-sm">
        <li class="flex items-start gap-2">
          <Icon name="mdi:chevron-right" class="text-primary-300 flex-shrink-0 mt-0.5" />
          <span>
            <NuxtLink to="/obchodni-podminky" class="text-primary-300 underline">Obchodní podmínky</NuxtLink>
            — jak vzniká objednávka, ceny, doklady.
          </span>
        </li>
        <li class="flex items-start gap-2">
          <Icon name="mdi:chevron-right" class="text-primary-300 flex-shrink-0 mt-0.5" />
          <span>
            <NuxtLink to="/reklamace" class="text-primary-300 underline">Doprava &amp; reklamace</NuxtLink>
            — způsoby dopravy, vrácení do 14 dnů i vzorový formulář pro odstoupení.
          </span>
        </li>
        <li class="flex items-start gap-2">
          <Icon name="mdi:chevron-right" class="text-primary-300 flex-shrink-0 mt-0.5" />
          <span>
            <NuxtLink to="/ochrana-osobnich-udaju" class="text-primary-300 underline">Ochrana osobních údajů</NuxtLink>
            — co s tvými údaji děláme a co ne.
          </span>
        </li>
      </ul>
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
/* Same split as /reklamace: everything inside .glass-card / .glass-card-strong
   sits on --pop-panel, a surface that stays dark in BOTH themes, so the white-ish
   Tailwind utilities in those cards are correct and are left alone.
   The lede is the exception — it lands on the page ground, which is cream in
   light mode, so it needs the palette's muted-ink token instead of a fixed
   white alpha. */
.page-lede { color: var(--pop-ink-mute); }

/* Social buttons copy the footer's pills, brand-coloured hovers included — they
   read the same here because this panel is dark in both themes, exactly like the
   wine footer they were tuned against. --pop-on-dark is the cream that is constant
   in both themes, which is what a surface that never flips needs (--pop-ink would
   flip and disappear here). Keep these in sync with .footer-social in
   layouts/default.vue: the two places are meant to feel like one component. */
.social-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  width: fit-content;
  padding: 0.55rem 0.95rem;
  border: 1px solid color-mix(in srgb, var(--pop-on-dark) 22%, transparent);
  border-radius: 9999px;
  background: color-mix(in srgb, var(--pop-on-dark) 6%, transparent);
  color: color-mix(in srgb, var(--pop-on-dark) 90%, transparent);
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 0.82rem;
  text-decoration: none;
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease, color 0.2s ease;
}
.social-pill:hover {
  background: color-mix(in srgb, var(--pop-on-dark) 14%, transparent);
  border-color: color-mix(in srgb, var(--pop-on-dark) 45%, transparent);
  transform: translateY(-2px);
  /* Deliberate literal white — the brightest hover available on a ground that is
     dark in both themes; no token means "brighter than the cream". */
  color: #ffffff;
}

/* Brand-coloured hovers, identical to the footer: each button lights up in its
   own app's colours. The gradient/fills are logo colours, so they are literals
   and never themed. */
.social-pill--instagram:hover {
  background: linear-gradient(45deg, #f09433 0%, #e6683c 22%, #dc2743 46%, #cc2366 70%, #bc1888 100%);
  border-color: transparent;
  color: #ffffff;
  box-shadow: 0 8px 20px rgba(220, 39, 67, 0.35);
}
.social-pill--tiktok:hover {
  background: #010101;
  border-color: #25f4ee;
  color: #ffffff;
  box-shadow: 0 0 14px rgba(37, 244, 238, 0.45), 0 6px 18px rgba(254, 44, 85, 0.35);
}
/* Linktree's brand green is LIGHT, so unlike the two above the label has to go
   dark — --pop-ink-on-accent is the token for ink on a fill that never darkens. */
.social-pill--linktree:hover {
  background: #43e55e;
  border-color: #43e55e;
  color: var(--pop-ink-on-accent);
  box-shadow: 0 6px 18px rgba(67, 229, 94, 0.35);
}
</style>
