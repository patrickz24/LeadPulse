import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router  = Router();
const prisma  = new PrismaClient();
const stripe  = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

const PLANS: Record<string, { priceId: string; leadsLimit: number }> = {
  starter: { priceId: env.STRIPE_PRICE_STARTER, leadsLimit: 500  },
  pro:     { priceId: env.STRIPE_PRICE_PRO,     leadsLimit: 2000 },
};

// ─── POST /api/billing/checkout ──────────────────────────────────────────────
// Crée une Stripe Checkout Session et retourne l'URL de paiement
router.post('/checkout', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { plan } = req.body as { plan: 'starter' | 'pro' };

  if (!PLANS[plan]) {
    return res.status(400).json({ error: 'Plan invalide. Choisis "starter" ou "pro".' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

  // Récupère ou crée le customer Stripe
  let customerId: string;
  const existingSub = await prisma.subscription.findUnique({ where: { userId: req.userId! } });

  if (existingSub?.stripeCustomerId) {
    customerId = existingSub.stripeCustomerId;
  } else {
    const customer = await stripe.customers.create({ email: user.email, metadata: { userId: user.id } });
    customerId = customer.id;
  }

  const session = await stripe.checkout.sessions.create({
    customer:             customerId,
    mode:                 'subscription',
    payment_method_types: ['card'],
    line_items: [{
      price:    PLANS[plan].priceId,
      quantity: 1,
    }],
    success_url: `${env.FRONTEND_URL}/dashboard?payment=success`,
    cancel_url:  `${env.FRONTEND_URL}/pricing?payment=canceled`,
    metadata: { userId: req.userId!, plan },
    subscription_data: {
      metadata: { userId: req.userId!, plan },
    },
  });

  return res.json({ url: session.url });
});

// ─── POST /api/billing/portal ────────────────────────────────────────────────
// Portail Stripe : changer de plan, annuler, voir factures
router.post('/portal', authMiddleware, async (req: AuthRequest, res: Response) => {
  const sub = await prisma.subscription.findUnique({ where: { userId: req.userId! } });
  if (!sub) return res.status(404).json({ error: 'Aucun abonnement trouvé.' });

  const session = await stripe.billingPortal.sessions.create({
    customer:   sub.stripeCustomerId,
    return_url: `${env.FRONTEND_URL}/dashboard`,
  });

  return res.json({ url: session.url });
});

// ─── POST /api/billing/webhook ───────────────────────────────────────────────
// Stripe envoie les événements ici — DOIT recevoir le raw body
router.post('/webhook', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error('[WEBHOOK] Signature invalide:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`[WEBHOOK] Event reçu: ${event.type}`);

  switch (event.type) {

    // ── Paiement réussi (1er paiement ou renouvellement) ──────────────────
    case 'invoice.payment_succeeded': {
      const invoice    = event.data.object as Stripe.Invoice;
      const stripeSubId = invoice.subscription as string;
      const sub         = await stripe.subscriptions.retrieve(stripeSubId);
      const userId      = sub.metadata.userId;
      const plan        = (sub.metadata.plan as 'starter' | 'pro') || 'starter';

      if (!userId) break;

      await prisma.subscription.upsert({
        where:  { userId },
        create: {
          userId,
          stripeCustomerId: sub.customer as string,
          stripeSubId,
          plan:        plan.toUpperCase() as 'STARTER' | 'PRO',
          status:      'ACTIVE',
          leadsLimit:  PLANS[plan].leadsLimit,
          leadsUsed:   0,
          renewsAt:    new Date(sub.current_period_end * 1000),
        },
        update: {
          status:     'ACTIVE',
          leadsUsed:  0,                                              // Reset quota chaque mois
          leadsLimit: PLANS[plan].leadsLimit,
          renewsAt:   new Date(sub.current_period_end * 1000),
        },
      });

      console.log(`[WEBHOOK] ✅ Paiement OK — userId: ${userId}, plan: ${plan}`);
      break;
    }

    // ── Abonnement annulé ──────────────────────────────────────────────────
    case 'customer.subscription.deleted': {
      const sub    = event.data.object as Stripe.Subscription;
      const userId = sub.metadata.userId;
      if (!userId) break;

      await prisma.subscription.updateMany({
        where:  { stripeSubId: sub.id },
        data:   { status: 'CANCELED' },
      });

      console.log(`[WEBHOOK] ❌ Abonnement annulé — userId: ${userId}`);
      break;
    }

    // ── Paiement échoué (carte expirée, fonds insuffisants…) ──────────────
    case 'invoice.payment_failed': {
      const invoice    = event.data.object as Stripe.Invoice;
      const stripeSubId = invoice.subscription as string;

      await prisma.subscription.updateMany({
        where: { stripeSubId },
        data:  { status: 'PAST_DUE' },
      });

      console.log(`[WEBHOOK] ⚠️ Paiement échoué — sub: ${stripeSubId}`);
      break;
    }

    // ── Changement de plan (upgrade/downgrade via portail) ─────────────────
    case 'customer.subscription.updated': {
      const sub    = event.data.object as Stripe.Subscription;
      const userId = sub.metadata.userId;
      if (!userId) break;

      const plan = (sub.metadata.plan as 'starter' | 'pro') || 'starter';

      await prisma.subscription.updateMany({
        where: { stripeSubId: sub.id },
        data: {
          plan:       plan.toUpperCase() as 'STARTER' | 'PRO',
          leadsLimit: PLANS[plan].leadsLimit,
          status:     sub.status === 'active' ? 'ACTIVE' : 'PAST_DUE',
          renewsAt:   new Date(sub.current_period_end * 1000),
        },
      });

      console.log(`[WEBHOOK] 🔄 Abonnement mis à jour — userId: ${userId}, plan: ${plan}`);
      break;
    }

    default:
      console.log(`[WEBHOOK] Event ignoré: ${event.type}`);
  }

  // Stripe attend un 200 rapidement
  return res.json({ received: true });
});

export default router;
