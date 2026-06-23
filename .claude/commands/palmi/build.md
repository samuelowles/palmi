# Palmi Build / Deploy Guardrails

Do not deploy or submit builds inside the unattended issue loop. Use local checks as merge gates; release deploys/submissions are manual tasks outside `/loop`.

## Local app

```powershell
cd app
npm install
npm test
npm run lint
npx tsc --noEmit
npx expo config --type public
```

## Local worker

```powershell
cd cloudflare
npm install
npm test
npx tsc --noEmit
npx wrangler dev
```

## Local D1 migrations

```powershell
cd cloudflare
npx wrangler d1 migrations apply palmi-db --local
```

## Manual release tasks, not `/loop` merge gates

```powershell
cd cloudflare
npx wrangler deploy

cd app
npx eas-cli build --platform ios --profile preview
npx eas-cli submit --platform ios
```

## Required secrets

Never print values. Only verify names exist:

- `OPENAI_API_KEY`
- `DEEPSEEK_API_KEY`
- `REVENUECAT_WEBHOOK_SECRET`
- `TURNSTILE_SECRET_KEY`
- `JWT_SECRET`
