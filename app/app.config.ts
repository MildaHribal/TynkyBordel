export default defineAppConfig({
  // The `ui` block that used to live here configured @nuxt/ui's colour aliases.
  // That module was removed (it was pulling ~200 KB of component CSS to provide
  // a single wrapper component), so the block went with it. Tailwind reads the
  // palette straight from the `@theme` declaration in assets/css/main.css.
  icon: {
    // Ship icon data in the server bundle instead of letting @iconify/vue fall
    // back to fetching from api.iconify.design at runtime — that would be a
    // third-party request on the critical path for every icon, and a privacy
    // leak. All collections used by the app are installed locally as
    // @iconify-json/* packages.
    serverBundle: 'local',
    // Render real <svg> elements rather than <span>s masked in CSS. Every call
    // site in this app sizes its icon with `height="18"`-style attributes, and
    // an attribute like that is meaningless on a span — CSS mode silently
    // dropped it and fell back to 1em of the inherited font-size, so the same
    // icon came out a different size on mobile than on desktop. SVG mode also
    // drops the per-icon mask-image CSS that was being inlined into every page.
    mode: 'svg',
  },
})
