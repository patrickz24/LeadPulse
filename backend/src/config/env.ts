import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL:           z.string().url(),
  JWT_SECRET:             z.string().min(32),
  STRIPE_SECRET_KEY:      z.string().startsWith('sk_'),
  STRIPE_WEBHOOK_SECRET:  z.string().startsWith('whsec_'),
  HUNTER_API_KEY:         z.string().min(1),
  CLEARBIT_API_KEY:       z.string().min(1),
  REDIS_URL:              z.string().url().default('redis://localhost:6379'),
  PORT:                   z.string().default('3001'),
  FRONTEND_URL:           z.string().url().default('http://localhost:5173'),
  // Stripe Price IDs (créés dans ton dashboard Stripe)
  STRIPE_PRICE_STARTER:   z.string().startsWith('price_'),
  STRIPE_PRICE_PRO:       z.string().startsWith('price_'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Variables d\'env invalides:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
