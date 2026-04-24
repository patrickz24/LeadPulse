import { Router, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { Parser } from 'json2csv';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { checkQuota } from '../middleware/quota';
import { enqueueSearchJob } from '../jobs/searchJob';

const router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

// POST /api/searches — Lancer une recherche
router.post('/', checkQuota, async (req: AuthRequest, res: Response) => {
  const schema = z.object({ input: z.string().min(3) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const search = await prisma.search.create({
    data: {
      userId: req.userId!,
      input: parsed.data.input,
      status: 'PENDING',
    },
  });

  // On lance le job en arrière-plan (sans attendre)
  enqueueSearchJob({ searchId: search.id, userId: req.userId!, input: parsed.data.input });

  return res.status(202).json({ searchId: search.id, status: 'PENDING' });
});

// GET /api/searches — Liste des recherches
router.get('/', async (req: AuthRequest, res: Response) => {
  const searches = await prisma.search.findMany({
    where: { userId: req.userId! },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      input: true,
      status: true,
      createdAt: true,
      _count: { select: { leads: true } },
    },
  });
  return res.json(searches);
});

// GET /api/searches/:id — Statut + leads d'une recherche
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const search = await prisma.search.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    include: {
      leads: {
        select: {
          id: true, fullName: true, email: true, emailValid: true,
          jobTitle: true, company: true, companySize: true,
          linkedinUrl: true, phone: true, source: true,
        },
      },
    },
  });

  if (!search) return res.status(404).json({ error: 'Recherche introuvable.' });
  return res.json(search);
});

// GET /api/searches/:id/export — Export CSV
router.get('/:id/export', async (req: AuthRequest, res: Response) => {
  const search = await prisma.search.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    include: { leads: true },
  });

  if (!search) return res.status(404).json({ error: 'Recherche introuvable.' });
  if (search.status !== 'DONE') return res.status(400).json({ error: 'Recherche pas encore terminée.' });

  const fields = ['fullName', 'email', 'emailValid', 'jobTitle', 'company', 'companySize', 'phone', 'linkedinUrl'];
  const parser = new Parser({ fields });
  const csv = parser.parse(search.leads);

  res.header('Content-Type', 'text/csv');
  res.attachment(`leads-${search.input}-${search.id.slice(0, 8)}.csv`);
  return res.send(csv);
});

export default router;
