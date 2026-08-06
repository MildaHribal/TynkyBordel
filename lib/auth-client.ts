import { createAuthClient } from 'better-auth/vue'

let _client: ReturnType<typeof createAuthClient> | null = null

export const authClient = () => {
  if (_client) return _client
  const config = useRuntimeConfig()
  // In the browser ALWAYS talk to the current origin — this guarantees the
  // auth requests are same-origin so the session cookie is sent and read back.
  // Trusting a configured siteUrl instead breaks login in production whenever
  // NUXT_PUBLIC_SITE_URL is even slightly off (trailing slash, www, scheme):
  // the client would call a different origin and the cookie would never stick.
  // The server (SSR) has no window, so it falls back to the configured URL.
  const baseURL = typeof window !== 'undefined'
    ? window.location.origin
    : ((config.public.siteUrl as string) || 'http://localhost:3000')
  _client = createAuthClient({ baseURL })
  return _client
}
