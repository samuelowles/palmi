# /autoloop - Autonomous Epic Loop

Point Claude at an epic and run the deterministic driver for the full issue -> PR -> Ponytail review -> amend -> test -> amend -> merge loop.

The driver owns control flow, tests, and merge decisions. Claude is called only for implementation and the separate Ponytail review, using `claude -p --bare --model MiniMax-M3` by default to bypass local hooks/classifiers and avoid auto model routing.

## Runtime

Set `ANTHROPIC_BASE_URL=https://api.minimax.io/anthropic` and a valid MiniMax key in `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN`. Run `node .claude/loop/run-epic.mjs --claude-smoke` before `--run`; auth failure is a hard stop, not an interactive prompt.

## Usage

Safe preflight, no writes:

```powershell
node .claude/loop/run-epic.mjs <EPIC_NUMBER>
```

Self-check the loop gates, no GitHub writes:

```powershell
node .claude/loop/run-epic.mjs --self-check
```

Verify Claude Code API auth before a long run:

```powershell
node .claude/loop/run-epic.mjs --claude-smoke
```

Full autonomous run, opens PRs and merges to `main` without human input:

```powershell
node .claude/loop/run-epic.mjs <EPIC_NUMBER> --run
```

## Main-branch behavior

Each issue starts from fresh `origin/main`, uses a throwaway PR branch because GitHub PRs require a head branch, then squash-merges back to `main` automatically after both gates pass.

## Hard gates

- Working tree must be clean before `--run`.
- `git diff --check` always runs.
- `npm test` and `tsc --noEmit` run for each changed `app/` or `cloudflare/` area.
- `npm run lint` also runs for changed `app/` code.
- Secret scan runs before every commit.
- Full `--run` starts with a MiniMax auth check and Claude Code smoke check before any branch or PR work.
- Merge requires all checks green plus separate Ponytail review verdict `APPROVE`.
- Review fixes amend the PR commit, rerun checks, rerun review, then merge.
- A failed issue is commented, skipped, cleaned back to `main`, and dependent issues remain blocked.

## Tunables

`LOOP_REPO`, `LOOP_MODEL` (default `MiniMax-M3`), `LOOP_MAX_FIX`, `LOOP_MAX_REVIEW`, `LOOP_BARE`, `LOOP_CLAUDE_TIMEOUT_MS`, `LOOP_CLAUDE_SMOKE_TIMEOUT_MS`, `LOOP_MINIMAX_AUTH_TIMEOUT_MS`, `LOOP_REQUIRE_MINIMAX` (set `0` only for deliberate non-MiniMax tests).
