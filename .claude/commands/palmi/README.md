# Palmi Claude Commands

Use these templates from Claude Code/MiniMax sessions:

- `epic-loop.md` — controlled loop prompt for one epic.
- `issue-selection.md` — find the first ready child/sub-issue.
- `tests.md` — smallest relevant checks by file area.
- `pr.md` — PR creation and merge hygiene.
- `review.md` — separate Ponytail review agent prompt.
- `build.md` — local build/deploy guardrails.
- `autoloop.md` — deterministic autonomous epic driver.

Default stance: `/ponytail full`, `MiniMax-M3` through Claude Code, one issue, one branch, one PR, relevant checks, separate review, merge only if both pass, then continue the `/loop` without user input.
