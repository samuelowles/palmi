# Palmi — Deployment Checklist

## Prerequisites

- [ ] Apple Developer account ($99/year, enrolled)
- [ ] RevenueCat account (free tier)
- [ ] Cloudflare Workers paid plan ($5/month)
- [ ] OpenAI API account with gpt-5.4-mini access
- [ ] DeepSeek API account

---

## Phase 1: Backend (Cloudflare Workers)

### 1.1 Install Wrangler & Login
```bash
cd cloudflare
npm install
npx wrangler login
```

### 1.2 Create D1 Database
```bash
npx wrangler d1 create palmi-db
# Copy the returned database_id into wrangler.toml → [[d1_databases]].database_id
```

### 1.3 Create KV Namespace
```bash
npx wrangler kv:namespace create PALMI_KV
# Copy the returned id into wrangler.toml → [[kv_namespaces]].id
```

### 1.4 Run Migrations
```bash
npx wrangler d1 migrations apply palmi-db
```

### 1.5 Set Secrets
Set each of the 5 required Worker secrets. See `cloudflare/docs/E1.4-secrets-procedure.md`
for full procedure, rotation notes, and local-dev (`.dev.vars`) instructions.

```bash
# Issue #14 — 4 required (per PRD §5.2 + docs/AI_RULES.md §Security)
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put DEEPSEEK_API_KEY
npx wrangler secret put REVENUECAT_WEBHOOK_SECRET
npx wrangler secret put TURNSTILE_SECRET_KEY    # REQUIRED — bot protection for /api/read-palm

# Also required for the worker to start (5th secret, separate issue from #14)
npx wrangler secret put JWT_SECRET              # HMAC for auth tokens

# Verify
npx wrangler secret list
```

### 1.6 Deploy Worker
```bash
npx wrangler deploy
