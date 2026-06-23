# Palmi Tests

Run the smallest check that can catch a broken fix. Do not use deploys or paid/cloud builds as issue-loop checks; local checks only.

## App checks

```powershell
cd app
npm test
npm run lint
npx tsc --noEmit
```

Use targeted app tests when the change only touches one area:

```powershell
cd app
npm test -- services/__tests__/api.test.ts
npm test -- stores/__tests__/readingStore.test.ts
npm test -- stores/__tests__/userStore.test.ts
```

## Cloudflare checks

```powershell
cd cloudflare
npm test
npx tsc --noEmit
```

Use targeted worker tests when the change only touches one area:

```powershell
cd cloudflare
npm test -- src/lib/__tests__/synergyEngine.test.ts
npm test -- src/routes/__tests__/turnstile.test.ts
```

## Config/docs checks

```powershell
git diff --check
```

For Expo config changes:

```powershell
cd app
npx expo config --type public
```

For D1 migration changes, use local D1 only:

```powershell
cd cloudflare
npx wrangler d1 migrations apply palmi-db --local
```

## Test rules

- Mock AI providers, RevenueCat, Cloudflare bindings, network, and time.
- Never require real OpenAI/DeepSeek/RevenueCat/Cloudflare credentials in tests.
- Prefer one focused regression test over broad test scaffolding.
- If a relevant check cannot run or fails, do not merge. Fix the blocker or leave the PR open with the exact command and failure.
