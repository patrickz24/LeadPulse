# ⚡ LeadPulse

> Micro-SaaS B2B — Extracteur et enrichisseur de leads via Hunter.io + Clearbit.  
> Stack : Node.js · TypeScript · Express · Prisma · PostgreSQL · BullMQ · Stripe · React

---

## Structure

```
leadpulse/
├── backend/   → API Express + BullMQ + Prisma
└── frontend/  → React + Vite (un seul fichier App.tsx)
```

---

## Démarrage rapide

### Prérequis
- Node.js 18+
- PostgreSQL
- Redis
- Comptes : Stripe · Hunter.io · Clearbit

### 1. Clone & install

```bash
git clone https://github.com/TON_USERNAME/leadpulse.git
cd leadpulse/backend
npm install
```

### 2. Variables d'environnement

```bash
cp .env.example .env
# Remplis toutes les valeurs dans .env
```

### 3. Base de données

```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 4. Redis (Docker)

```bash
docker run -d -p 6379:6379 --name leadpulse-redis redis:alpine
```

### 5. Lancer le backend

```bash
npm run dev
# → http://localhost:3001
```

### 6. Frontend

```bash
cd ../frontend
npm install
cp .env.example .env   # VITE_API_URL=http://localhost:3001
npm run dev
# → http://localhost:5173
```

---

## Configuration Stripe

1. Crée 2 produits dans le [Dashboard Stripe](https://dashboard.stripe.com/products) :
   - **Starter** — 49€/mois
   - **Pro** — 99€/mois

2. Copie les `price_xxx` dans ton `.env`

3. Configure le webhook Stripe :
   - URL : `https://ton-domaine.com/api/billing/webhook`
   - Events à écouter :
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
     - `customer.subscription.deleted`
     - `customer.subscription.updated`

4. Pour tester en local :
```bash
stripe listen --forward-to localhost:3001/api/billing/webhook
```

---

## Endpoints API

| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| POST | `/api/auth/register` | ✗ | Créer un compte |
| POST | `/api/auth/login` | ✗ | Se connecter |
| GET | `/api/me` | ✓ | Profil + quota |
| POST | `/api/billing/checkout` | ✓ | Lancer un paiement Stripe |
| POST | `/api/billing/portal` | ✓ | Portail client Stripe |
| POST | `/api/billing/webhook` | Stripe | Events Stripe |
| POST | `/api/searches` | ✓ | Lancer une recherche |
| GET | `/api/searches` | ✓ | Historique |
| GET | `/api/searches/:id` | ✓ | Résultats d'une recherche |
| GET | `/api/searches/:id/export` | ✓ | Export CSV |
| GET | `/api/webhooks` | ✓ | Liste webhooks |
| POST | `/api/webhooks` | ✓ | Créer un webhook |
| DELETE | `/api/webhooks/:id` | ✓ | Supprimer un webhook |

---

## Déploiement

### Backend → Railway
```bash
# railway.app → New Project → Deploy from GitHub
# Variables d'env à ajouter dans Railway dashboard
```

### Frontend → Vercel
```bash
vercel --prod
# VITE_API_URL=https://ton-backend.railway.app
```

### PostgreSQL → Railway ou Supabase
### Redis → Railway (plugin Redis) ou Upstash

---

## Roadmap MVP

- [x] Auth JWT
- [x] Stripe Checkout + Webhook + Portal
- [x] Quota par plan
- [x] Hunter.io + Clearbit + DNS verify
- [x] BullMQ async jobs
- [x] Export CSV
- [x] Webhooks sortants (Zapier / HubSpot)
- [ ] Notifications email (relance quota épuisé)
- [ ] Page analytics (taux de valid email par domaine)

---

## Licence

MIT — fais-en ce que tu veux.
