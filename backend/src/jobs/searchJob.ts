import { Queue, Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';
import { searchHunter } from '../services/hunter';
import { enrichWithClearbit } from '../services/clearbit';
import { verifyEmail } from '../services/emailVerifier';
import { triggerWebhooks } from '../routes/webhooks';

const prisma = new PrismaClient();

interface SearchJobData {
  searchId: string;
  userId: string;
  input: string;
}

const connection = { url: env.REDIS_URL };

// ─── Queue ────────────────────────────────────────────────────────────────────
const searchQueue = new Queue<SearchJobData>('search', { connection });

export const enqueueSearchJob = (data: SearchJobData) => {
  searchQueue.add('process', data, {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
  });
};

// ─── Worker ───────────────────────────────────────────────────────────────────
const worker = new Worker<SearchJobData>(
  'search',
  async (job: Job<SearchJobData>) => {
    const { searchId, userId, input } = job.data;

    try {
      console.log(`[JOB] Démarrage recherche ${searchId} pour "${input}"`);

      // 1. Hunter.io — trouver les emails du domaine
      const hunterLeads = await searchHunter(input);

      // 2. Enrichir + vérifier chaque lead
      const enrichedLeads = await Promise.all(
        hunterLeads.map(async (lead) => {
          const clearbitData = lead.email
            ? await enrichWithClearbit(lead.email)
            : {};
          const emailValid = lead.email
            ? await verifyEmail(lead.email)
            : false;

          return { ...lead, ...clearbitData, emailValid, source: 'hunter' };
        })
      );

      // 3. Sauvegarder les leads en DB
      await prisma.lead.createMany({
        data: enrichedLeads.map((l) => ({
          searchId,
          userId,
          fullName:    l.fullName    ?? null,
          email:       l.email       ?? null,
          emailValid:  l.emailValid  ?? null,
          jobTitle:    l.jobTitle    ?? null,
          company:     l.company     ?? null,
          companySize: l.companySize ?? null,
          linkedinUrl: l.linkedinUrl ?? null,
          phone:       l.phone       ?? null,
          source:      l.source,
        })),
        skipDuplicates: true,
      });

      // 4. Mettre à jour le quota utilisateur
      await prisma.subscription.update({
        where: { userId },
        data: { leadsUsed: { increment: enrichedLeads.length } },
      });

      // 5. Marquer la recherche comme terminée
      await prisma.search.update({
        where: { id: searchId },
        data: { status: 'DONE' },
      });

      // 6. Déclencher les webhooks configurés
      await triggerWebhooks(userId, enrichedLeads);

      console.log(`[JOB] ✅ Recherche ${searchId} terminée — ${enrichedLeads.length} leads trouvés`);

    } catch (err) {
      console.error(`[JOB] ❌ Erreur recherche ${searchId}:`, err);
      await prisma.search.update({
        where: { id: searchId },
        data: { status: 'FAILED' },
      });
      throw err; // BullMQ va retry
    }
  },
  { connection, concurrency: 5 }
);

worker.on('failed', (job, err) => {
  console.error(`[WORKER] Job ${job?.id} échoué définitivement:`, err.message);
});

export default searchQueue;
