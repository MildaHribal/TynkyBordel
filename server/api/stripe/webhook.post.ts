import Stripe from 'stripe'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/utils/db'
import { orders } from '~~/server/database/schema'

/**
 * Stripe webhook receiver.
 *
 * Configure the endpoint in the Stripe dashboard:
 *   URL: https://YOUR_DOMAIN/api/stripe/webhook
 *   Events: checkout.session.completed, checkout.session.async_payment_succeeded,
 *           checkout.session.async_payment_failed, checkout.session.expired
 *
 * Set STRIPE_WEBHOOK_SECRET to the signing secret shown in the dashboard.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const secret = config.stripeSecretKey
  const webhookSecret = config.stripeWebhookSecret

  if (!secret || !webhookSecret) {
    throw createError({ statusCode: 503, statusMessage: 'Stripe webhook not configured' })
  }

  const signature = getHeader(event, 'stripe-signature')
  if (!signature) {
    throw createError({ statusCode: 400, statusMessage: 'Missing stripe-signature header' })
  }

  const rawBody = await readRawBody(event, 'utf-8')
  if (!rawBody) {
    throw createError({ statusCode: 400, statusMessage: 'Empty webhook body' })
  }

  const stripe = new Stripe(secret, { apiVersion: '2026-02-25.clover' })
  let stripeEvent: Stripe.Event
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err: any) {
    throw createError({ statusCode: 400, statusMessage: `Invalid signature: ${err.message}` })
  }

  switch (stripeEvent.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = stripeEvent.data.object as Stripe.Checkout.Session
      const orderId = Number(session.metadata?.orderId)
      if (!orderId) break

      const paid = session.payment_status === 'paid'
      // paymentStatus and (fulfillment) status are independent axes — mirror the
      // manual admin flow. 'paid' is NOT a fulfillment status, so payment success
      // only flips paymentStatus; fulfillment stays 'pending' until shipped.
      await db
        .update(orders)
        .set({
          paymentStatus: paid ? 'paid' : 'unpaid',
          status: 'pending',
          stripeSessionId: session.id,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId))

      if (paid) {
        const ph = usePosthogServer()
        if (ph) {
          ph.capture({
            distinctId: session.customer_details?.email || `order_${orderId}`,
            event: 'order_completed',
            properties: {
              orderId,
              amount: session.amount_total != null ? session.amount_total / 100 : undefined,
              currency: session.currency,
              email: session.customer_details?.email,
            },
          })
          await ph.shutdown()
        }
      }
      break
    }

    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired': {
      const session = stripeEvent.data.object as Stripe.Checkout.Session
      const orderId = Number(session.metadata?.orderId)
      if (!orderId) break

      await db
        .update(orders)
        .set({
          paymentStatus: 'failed',
          status: 'cancelled',
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId))
      break
    }

    default:
      // Unhandled event types are acknowledged so Stripe stops retrying.
      break
  }

  return { received: true }
})
