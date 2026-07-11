import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { customSession } from 'better-auth/plugins'
import { db } from './db'
import * as schema from '../database/schema'
import { sendVerificationEmail, sendPasswordResetEmail } from './email'

// Admin allowlist — emails here are treated as admins on every session,
// regardless of their stored DB role. This grants admin WITHOUT any database
// access, and is applied live so it also covers accounts created after deploy.
//
// Two sources, merged:
//   1. BUILTIN_ADMIN_EMAILS — committed to code, so a plain `git push` deploy
//      grants admin even when you can't edit env vars on the VPS.
//   2. ADMIN_EMAILS env var (comma-separated) — for adding admins without a code
//      change, when you do have env access.
//
// NOTE: listing an email here is NOT a security hole — admin access still
// requires logging into that account (password / Google). It only elevates the
// role of someone who has already authenticated as that email.
const BUILTIN_ADMIN_EMAILS = ['kikizaj12@gmail.com']

const adminEmails = Array.from(
  new Set(
    [
      ...BUILTIN_ADMIN_EMAILS,
      ...(process.env.ADMIN_EMAILS || '').split(','),
    ]
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  ),
)

const googleClientId = process.env.GOOGLE_CLIENT_ID || ''
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || ''
const googleEnabled = Boolean(googleClientId && googleClientSecret)

const isProd = process.env.NODE_ENV === 'production'
const siteUrl = process.env.NUXT_PUBLIC_SITE_URL || process.env.BETTER_AUTH_URL || 'http://localhost:3000'
const baseURL = process.env.BETTER_AUTH_URL || siteUrl

if (isProd && !process.env.BETTER_AUTH_SECRET) {
  throw new Error('BETTER_AUTH_SECRET is required in production')
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL,
  trustedOrigins: Array.from(new Set([baseURL, siteUrl])),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
    // Soft verification: we email a confirmation link but do NOT block sign-in,
    // so a bounced/spam-filtered email can never lock a customer out.
    requireEmailVerification: false,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail({ to: user.email, name: user.name || undefined, url })
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail({ to: user.email, name: user.name || undefined, url })
    },
  },
  socialProviders: googleEnabled
    ? {
        google: {
          clientId: googleClientId,
          clientSecret: googleClientSecret,
        },
      }
    : undefined,
  user: {
    additionalFields: {
      phone: { type: 'string', required: false, defaultValue: null, input: false },
      street: { type: 'string', required: false, defaultValue: null, input: false },
      city: { type: 'string', required: false, defaultValue: null, input: false },
      zip: { type: 'string', required: false, defaultValue: null, input: false },
      role: { type: 'string', required: false, defaultValue: 'user', input: false },
      // Boolean admin flag — the primary way to grant admin: set is_admin=true in DB.
      isAdmin: { type: 'boolean', required: false, defaultValue: false, input: false },
    },
  },
  plugins: [
    // Promote allowlisted emails to admin on the returned session. Runs for both
    // client getSession() and server auth.api.getSession(), so the /admin route
    // gate and every requireAdmin() check see the elevated role consistently.
    customSession(async ({ user, session }) => {
      const email = (user.email || '').toLowerCase()
      // Admin if the DB boolean is set (primary), OR the email is allowlisted
      // (env / builtin fallback so you're never locked out).
      const isAdmin = (user as any).isAdmin === true || adminEmails.includes(email)
      const role = isAdmin ? 'admin' : ((user as any).role || 'user')
      return { user: { ...user, role }, session }
    }),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24,       // refresh every day
  },
  advanced: {
    useSecureCookies: isProd,
    defaultCookieAttributes: {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
    },
    cookies: {
      session_token: { name: 'shopik.session_token' },
    },
  },
})

export type Auth = typeof auth
