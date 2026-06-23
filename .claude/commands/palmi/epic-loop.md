# Palmi Epic Loop Prompt

```text
/loop

You are working in the Palmi repo.

First, read `CLAUDE.md` and follow it exactly. Then use the deterministic driver instead of manual slash-command routing: `node .claude/loop/run-epic.mjs --claude-smoke`, then `node .claude/loop/run-epic.mjs <EPIC_NUMBER> --run`.

Start with:

/ponytail full

Goal: begin Epic #<EPIC_NUMBER> sequentially. Continue one issue at a time without user input until the epic has no ready unblocked issue left.

Rules:
- Work from GitHub repo `samuelowles/palmi`.
- Fetch the epic with `gh issue view <EPIC_NUMBER> --repo samuelowles/palmi`.
- Identify the first open, ready, unblocked child issue/sub-issue under that epic using `.claude/commands/palmi/issue-selection.md`.
- Work on exactly one issue only.
- Do not start the next issue until the current PR has passed relevant checks, been reviewed by a separate Ponytail review agent, and been merged.
- Do not ask for user input between issues. Continue automatically after each successful merge.
- If the epic has no clear ready child issue, stop and report what is missing.

Before coding:
- Ensure `git status --short` is clean. If not, stop and report the dirty files.
- `git fetch origin --prune`.
- Create a branch from `origin/main` named `minimax/issue-<issue-number>-<short-slug>`.
- Read only the issue body, the docs it references, and the smallest related source files.
- List the few files you expect to touch.
- Reuse existing code and schemas before adding anything.
- Do not add dependencies unless the issue explicitly requires one.

Workflow:
1. Select one ready issue.
2. Create the branch from `origin/main`.
3. Implement the smallest safe fix with Ponytail full.
4. Run the smallest relevant checks from `.claude/commands/palmi/tests.md`; all relevant checks must pass before merge.
5. Open a PR using `.claude/commands/palmi/pr.md`.
6. Report the PR URL.
7. Spawn a separate Ponytail review agent using `.claude/commands/palmi/review.md`.
8. If the review returns `APPROVE` and checks passed, merge the PR and delete the branch.
9. Return to step 1 and continue until no ready unblocked issue remains.
10. If tests fail or review requests changes, fix the same issue, rerun checks, update the PR, and rerun the separate review. Do not merge.

Security / quality:
- No secrets, `.env*`, `.dev.vars`, local MCP config, or stale context dumps.
- Mock AI providers, Cloudflare bindings, network, and time in tests.
- Preserve privacy boundaries: no raw IP persistence and no raw provider/LLM leakage.
- Keep the diff minimal and issue-scoped.

Begin now by inspecting Epic #<EPIC_NUMBER> and selecting the first ready unblocked child issue.
```
