# Palmi — Claude Code Instructions

Start every coding session with:

```text
/ponytail full
```

If you are MiniMax/M3 wrapped by Claude Code, treat this file as the project contract. Work slowly, issue-by-issue, with tiny diffs. In `/loop`, continue without asking for user input until the epic has no ready unblocked issue left.

## Source of truth

- GitHub repo: `samuelowles/palmi`
- Product docs: `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/AI_RULES.md`, `docs/DEPLOY.md`
- Backlog map: `BACKLOG.md`
- Command templates: `.claude/commands/palmi/*.md`
- Historical only (do not treat as current requirements): `logs.md`, `bugs.md`, `implementation_plan.md`, `CODEBASE_AUDIT.md`, `docs/PLAN.md`, `PRDs/`, `scripts/`, and old local notes. Some describe an earlier/different product strategy and are not authoritative. Build only what `docs/` and the target GitHub issue specify.

## Ponytail rules

- Reuse existing code before adding code.
- Prefer standard library/native platform/installed dependency.
- No new dependency unless the issue explicitly requires it.
- No speculative abstractions, factories, framework rewrites, or “while I’m here” cleanup.
- One issue = one PR = one merge.

## Sequential issue workflow

1. Read the target issue and only the docs it references.
2. Select exactly one open `ready` issue with `Blocked by` = none.
3. `git fetch origin --prune`.
4. Create a branch from `origin/main`: `minimax/issue-<issue-number>-<short-slug>`.
5. List the few files you expect to touch before coding.
6. Implement the smallest safe fix.
7. Run the smallest relevant checks from `.claude/commands/palmi/tests.md`.
8. Open a PR using `.claude/commands/palmi/pr.md`.
9. Review the PR with a separate Ponytail review agent using `.claude/commands/palmi/review.md`.
10. Merge only after relevant checks pass and the separate Ponytail review agent returns `APPROVE`.
11. After merge, return to step 1 for the same epic. Do not ask for user input between issues.

Never code directly on `main`. Never merge your own work without the separate review pass.


## Autonomous epic loop

Use `node .claude/loop/run-epic.mjs <EPIC_NUMBER>` for preflight, `node .claude/loop/run-epic.mjs --claude-smoke` to verify Claude Code API auth, and `node .claude/loop/run-epic.mjs <EPIC_NUMBER> --run` for the full unattended loop. The driver owns issue selection, tests, PR creation, separate Ponytail review, amendments, and merge-to-main decisions; do not replace it with slash-command routing, auto-classifiers, swarm tools, or manual merge prompts.
## GitHub hygiene

- Keep the worktree clean before starting. If it is dirty, stop and report it.
- Branch: `minimax/issue-<issue-number>-<short-slug>`.
- Commit: `fix(issue-<issue-number>): <short imperative summary>`.
- PR title: `Fix #<issue-number>: <issue title>`.
- PR body must include checks run and security/privacy notes.
- Use `gh pr merge --squash --delete-branch` only after relevant checks pass and separate Ponytail review approval.

## Security and privacy

- No secrets, `.env*`, `.dev.vars`, local MCP config, tokens, raw API keys, or session dumps.
- Do not log raw palm images, base64 image payloads, provider prompts/responses, secrets, or raw provider errors.
- Preserve privacy boundaries: no raw IP persistence and no raw provider/LLM leakage.
- Mock AI providers, Cloudflare bindings, network, and time in tests.

## Cleanup discipline

- Do not read or recreate stale context dumps such as `conversation_log.txt`, `task.md`, or `walkthrough.md`.
- Do not write temp PR bodies, scratch notes, or generated context dumps to repo root.
- Use OS temp files for scratch work and delete them before finishing.
