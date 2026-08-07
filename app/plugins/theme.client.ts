import { applyStoredTheme } from '~/composables/useTheme'

/**
 * Dosadí uloženou volbu tématu na <html> co nejdřív to jde.
 *
 * Systémovou preferenci NEŘEŠÍ — tu obsluhuje `@media (prefers-color-scheme)`
 * uvnitř `assets/css/main.css`, takže je správně už při prvním vykreslení a
 * bez jediného řádku JS. Tenhle plugin je tu jen pro menšinu, která si
 * přepínačem zvolila jiné téma, než má nastavený systém.
 *
 * `enforce: 'pre'` — běží jako první plugin, tedy před mountem aplikace.
 * Zapisuje pouze atribut na <html>, což Vue nerenderuje → hydrataci to
 * nemůže rozhodit.
 *
 * POZOR: tohle je nejdřívější bod, na který dosáhnu ze souborů, které smím
 * měnit. Úplně bez probliknutí by to bylo jen blokujícím inline skriptem
 * v <head> — ten se ale přidává v `nuxt.config.ts` (app.head.script), který
 * mi nepatří. Přesný snippet je v reportu.
 */
export default defineNuxtPlugin({
  name: 'tb-theme',
  enforce: 'pre',
  setup() {
    applyStoredTheme()
  },
})
