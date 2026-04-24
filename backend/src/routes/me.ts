import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// GET /api/me
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
    select: {
      id: true,
      email: true,
      createdAt: true,
      subscription: {
        select: {
          plan: true,
          status: true,
          leadsLimit: true,
          leadsUsed: true,
          renewsAt: true,
        },
      },
    },
  });

  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  return res.json(user);
});

export default router;
