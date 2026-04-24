import { Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from './auth';

const prisma = new PrismaClient();

export const checkQuota = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const sub = await prisma.subscription.findUnique({
    where: { userId: req.userId! },
  });

  if (!sub || sub.status !== 'ACTIVE') {
    return res.status(403).json({
      error: 'Abonnement inactif. Souscris un plan pour continuer.',
      action: 'SUBSCRIBE',
    });
  }

  if (sub.leadsUsed >= sub.leadsLimit) {
    return res.status(403).json({
      error: `Quota atteint (${sub.leadsUsed}/${sub.leadsLimit} leads ce mois).`,
      action: 'UPGRADE',
    });
  }

  next();
};
