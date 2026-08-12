import type { H3Event } from 'h3'
import { getCookie, getHeaders, setCookie } from 'h3'
import { auth } from './auth'
import { EXCLUDE_COOKIE } from './analytics'

export type AppSession = {
  user: {
    id: string
    name: string | null
    email: string | null
    role?: string
  }
} | null

function toHeaders(event: H3Event): Headers {
  const raw = getHeaders(event)
  const h = new Headers()
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string') h.set(k, v)
  }
  return h
}

export async function getOptionalSession(event: H3Event): Promise<AppSession> {
  try {
    const result = await auth.api.getSession({ headers: toHeaders(event) })
    if (!result?.user) return null
    return {
      user: {
        id: result.user.id,
        name: result.user.name ?? null,
        email: result.user.email ?? null,
        role: (result.user as any).role ?? 'user',
      },
    }
  } catch (err) {
    console.error('getOptionalSession error:', err)
    return null
  }
}

export type AuthenticatedSession = {
  user: {
    id: string
    name: string | null
    email: string | null
    role?: string
  }
}

export async function requireSession(event: H3Event): Promise<AuthenticatedSession> {
  const session = await getOptionalSession(event)
  if (!session?.user?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  return session
}

export async function requireAdmin(event: H3Event): Promise<AuthenticatedSession> {
  const session = await requireSession(event)
  if (session.user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  // Mark this browser as the shop's own, so the traffic counter skips it
  // (server/plugins/05-page-views.ts). Done here rather than on a settings page
  // because it then happens on every device the owner ever opens the admin on,
  // without anyone having to remember. Owner visits are a large share of a small
  // shop's traffic and are exactly the ones the numbers should not include.
  if (getCookie(event, EXCLUDE_COOKIE) !== '1') {
    setCookie(event, EXCLUDE_COOKIE, '1', {
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })
  }

  return session
}
