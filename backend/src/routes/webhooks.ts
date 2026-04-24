import { Router, Response } from 'express';
import { z } from 'zod';
import axios from 'axios';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

// GET /api/webhooks
router.get('/', async (req: AuthRequest, res: Response) => {
  const hooks = await prisma.webhook.findMany({
    where: { userId: req.userId! },
    select: { id: true, targetUrl: true, active: true, createdAt: true },
  });
  return res.json(hooks);
});

// POST /api/webhooks
router.post('/', async (req: AuthRequest, res: Response) => {
  const schema = z.object({ targetUrl: z.string().url() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const secret = crypto.randomBytes(24).toString('hex');
  const hook = await prisma.webhook.create({
    data: { userId: req.userId!, targetUrl: parsed.data.targetUrl, secret },
    select: { id: true, targetUrl: true, secret: true, active: true, createdAt: true },
  });

  return res.status(201).json(hook);
});

// DELETE /api/webhooks/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  await prisma.webhook.deleteMany({ where: { id: req.params.id, userId: req.userId! } });
  return res.json({ deleted: true });
});

// ─── Fonction appelée par le searchJob après chaque recherche ─────────────────
export const triggerWebhooks = async (userId: string, leads: object[]) => {
  const hooks = await prisma.webhook.findMany({
    where: { userId, active: true },
  });

  await Promise.allSettled(
    hooks.map(async (hook) => {
      const payload = JSON.stringify({ event: 'leads.found', leads, ts: new Date().toISOString() });
      const sig = crypto
        .createHmac('sha256', hook.secret ?? '')
        .update(payload)
        .digest('hex');

      await axios.post(hook.targetUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-LeadPulse-Signature': sig,
        },
        timeout: 8_000,
      });

      console.log(`[WEBHOOK] ✅ Envoyé vers ${hook.targetUrl}`);
    })
  );
};

export default router;
