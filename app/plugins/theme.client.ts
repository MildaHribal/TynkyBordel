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
 * Ten blokující inline skript v <head> už existuje (`app.head.script`
 * v `nuxt.config.ts`) a dosadí atribut ještě před prvním vykreslením — bez něj
 * stránka probliklà systémovým tématem, než se stáhl JS. Tenhle plugin tedy
 * není proti probliknutí, ale jako záchranná síť: kdyby inline skript
 * neproběhl (CSP, chyba při parsování), atribut se dosadí aspoň teď.
 * `applyStoredTheme()` je idempotentní, takže dvojí zápis nevadí.
 */
export default defineNuxtPlugin({
  name: 'tb-theme',
  enforce: 'pre',
  setup() {
    applyStoredTheme()
  },
})
