import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';

// Routes
import authRoutes     from './routes/auth';
import billingRoutes  from './routes/billing';
import searchesRoutes from './routes/searches';
import webhooksRoutes from './routes/webhooks';
import meRoutes       from './routes/me';

const app = express();

// ─── Middleware global ────────────────────────────────────────────────────────

app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));

// Le webhook Stripe a besoin du raw body — AVANT express.json()
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());

// Rate limiting global
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes, réessaie dans 15 minutes.' },
}));

// Rate limiting strict sur l'auth
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 20,
  message: { error: 'Trop de tentatives de connexion.' },
});

// ─── Routes ──────────────────────────────────────────────────────────────────

app.use('/api/auth',     authLimiter, authRoutes);
app.use('/api/billing',  billingRoutes);
app.use('/api/searches', searchesRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/me',       meRoutes);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date() }));

// ─── Error handler global ────────────────────────────────────────────────────

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'Erreur interne du serveur.' });
});

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(Number(env.PORT), () => {
  console.log(`✅ LeadPulse backend démarré sur http://localhost:${env.PORT}`);
});

export default app;
