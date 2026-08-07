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
  },
})
