# Palmi PR Template

Use this after the issue-scoped fix and relevant checks pass.

## Commands

```powershell
$body = Join-Path $env:TEMP "palmi-pr-<ISSUE_NUMBER>.md"
git status --short
git diff --check
git add <files>
git commit -m "fix(issue-<ISSUE_NUMBER>): <short-slug>"
git push -u origin minimax/issue-<ISSUE_NUMBER>-<short-slug>
gh pr create --repo samuelowles/palmi --base main --head minimax/issue-<ISSUE_NUMBER>-<short-slug> --title "Fix #<ISSUE_NUMBER>: <issue title>" --body-file $body
Remove-Item -LiteralPath $body
```

Write the PR body to `$body` before running `gh pr create`; do not create PR body files in repo root.

## PR body

```markdown
Fixes #<ISSUE_NUMBER>

## What changed
- <short summary>

## Ponytail check
- Reused existing code/schemas:
- Skipped/avoided:
- New dependencies: none

## Checks
- [ ] `<exact relevant command>` — passed

## Security/privacy
- [ ] No secrets or `.env*` files
- [ ] No raw palm image/base64 logging
- [ ] No raw provider/LLM leakage
- [ ] No raw IP persistence

## Notes
- none
```

## Merge

Only after all relevant checks pass and the separate Ponytail review agent returns `APPROVE`:

```powershell
gh pr merge <PR_NUMBER> --repo samuelowles/palmi --squash --delete-branch
```

After merge, return to issue selection in the active `/loop` and continue without user input. If checks fail or review requests changes, update the same PR and rerun both gates; do not merge.
