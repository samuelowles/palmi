# Palmi GitHub Backlog

Canonical reference for the GitHub issue structure on [`samuelowles/palmi`](https://github.com/samuelowles/palmi/issues). Read this before adding, editing, splitting, or re-ordering issues.

---

## 1. Overview

The backlog encodes the work to ship Palmi v1.0 (PRD §7 target). It is a three-level hierarchy built from the spec docs in `/docs`:

- **9 Epics** — major areas of work, each with a one-line goal
- **78 Child issues** — shippable units of work attached to their parent epic
- **7 Split-parent issues + 20 sub-issues** — child issues that were too large to ship in one go; split into sub-issues via GitHub's native parent–child relationship

Every non-epic issue body ends with a `## Blocked by` line referencing the GitHub issue numbers that must close first. Issues with no blockers and no external blockers carry the `ready` label.

---

## 2. Hierarchy & labels

```
Epic (label: epic)        ← #1..#9
└── Child (no label)      ← attached via --parent <epic#>
    └── Sub-issue         ← attached via --parent <child#>, only for split children
```

| Level | Count | What it is |
|---|---|---|
| Epic | 9 | Top-level area of work |
| Child | 78 | Shippable unit, attached to an epic |
| Split-parent child | 7 | A child too large to ship in one go (E3.7, E4.5, E4.6, E5.1, E5.4, E6.5, E6.7). Still attached to an epic; itself has sub-issues. |
| Sub-issue | 20 | Granular work unit, attached to a split-parent child |
| **Total open** | **114** | + 27 closed (1 smoke test + 26 accidental dupes) |

**Labels in use:**

- `epic` — the 9 epics only
- `ready` — issues with empty blocker list AND not domain-blocked (12 issues as of v1)

No other labels are used. Children and sub-issues are unlabeled by design — the parent relationship is the only structural glue.

---

## 3. Epics

| # | Title | GitHub |
|---|---|---|
| 1 | Epic: Backend API & Infrastructure | [#1](https://github.com/samuelowles/palmi/issues/1) |
| 2 | Epic: Database Schema & Migrations | [#2](https://github.com/samuelowles/palmi/issues/2) |
| 3 | Epic: AI Vision & Synthesis Pipeline | [#3](https://github.com/samuelowles/palmi/issues/3) |
| 4 | Epic: Subscription & Paywall System | [#4](https://github.com/samuelowles/palmi/issues/4) |
| 5 | Epic: Palm Capture & Reading Experience | [#5](https://github.com/samuelowles/palmi/issues/5) |
| 6 | Epic: Bestie Comparison & Sharing | [#6](https://github.com/samuelowles/palmi/issues/6) |
| 7 | Epic: Settings, History & Legal Compliance | [#7](https://github.com/samuelowles/palmi/issues/7) |
| 8 | Epic: App Store Submission & EAS Pipeline | [#8](https://github.com/samuelowles/palmi/issues/8) |
| 9 | Epic: Launch Readiness, Monitoring & Support | [#9](https://github.com/samuelowles/palmi/issues/9) |

---

## 4. How it was built (chronology)

1. **Phase 1 — Epics drafted.** Read every file in `/docs` (PRD, ARCHITECTURE, PLAN, DEPLOY, AI_RULES). Proposed 9 epics, asked clarifying questions (price, models, domain, SDK version, synergy algorithm). User resolved all five before any creation.
2. **Phase 2 — Epics created.** 9 issues labeled `epic` on `samuelowles/palmi`. Two labels created: `epic`, `ready`.
3. **Phase 2b — Children drafted.** 78 child issue specs drafted in this session, grouped by epic, presented for approval. No creation yet.
4. **Phase 3a — Children created.** 78 issues created via `gh issue create --parent <epic#>`. Resumed once after a transient GraphQL error at issue #35.
5. **Phase 3b — Splits created.** 7 split-parent issues created, then 20 sub-issues each attached to its split parent.
6. **Phase 4 — Sequenced.** Each issue's body appended with a `## Blocked by` section. The `ready` label applied to issues with empty blocker lists and no external blockers.

All scripts and manifests live outside the repo at `C:\Users\sam\AppData\Local\Temp\palmi-issues\` (see §9).

---

## 5. Dependency model

Order is **schema → services/API → AI → UI (capture/reading) → UI (compare) → paywall integration → App Store → launch**. E7 (settings/legal) can run in parallel with E5/E6 once its leaves (E7.2–E7.6, E7.9) are unblocked.

```
E2.1 (users) ──┬─→ E2.2 (readings)  ──┐
               ├─→ E2.3 (synergy)   ──┤
               └─→ E2.4 (events)    ──┴─→ E2.5 (indexes) → E2.6 (verify)

E1.1 (wrangler init) ─┬─→ E1.2 (D1)  ─┐
                      ├─→ E1.3 (KV)  ─┤
                      ├─→ E1.4 (sec) ─┤
                      └──────────────┴─→ E1.5 (router) → E1.6, E1.7 → E1.8 (deploy)

E3.1 (contract) ─┬─→ E3.2 → E3.3 (vision svc)
                 ├─→ E3.4 → E3.5 (synthesis svc)
                 └─→ E3.6, E3.7, E3.8 (depend on E3.3 + E3.5)

E5.1 (capture parent) ──→ E5.2, E5.3, E5.1.{1,2,3}
E5.4 (reveal parent)  ──→ E5.4.{1,2,3}, E5.5, E5.6, E5.7, E5.8
E6.5 (synergy parent) ──→ E6.5.{1,2,3}, E6.6, E6.8
E6.7 (compare parent) ──→ E6.7.{1,2,3}, E6.9
E4.5 (webhook sig)    ──→ E4.6 (state map) ──→ E4.6.{1,2}
```

**The 12 currently `ready` issues** (no in-scope blockers, no domain blocker):

| ID | Issue | Notes |
|---|---|---|
| E1.1 | [#11](https://github.com/samuelowles/palmi/issues/11) | Wrangler init |
| E1.9 | [#19](https://github.com/samuelowles/palmi/issues/19) | Deploy runbook doc |
| E2.1 | [#20](https://github.com/samuelowles/palmi/issues/20) | users table |
| E3.1 | [#26](https://github.com/samuelowles/palmi/issues/26) | PalmAnalysis JSON contract |
| E4.1 | [#33](https://github.com/samuelowles/palmi/issues/33) | RevenueCat SDK init |
| E7.1 | [#59](https://github.com/samuelowles/palmi/issues/59) | settings.tsx layout |
| E8.1 | [#68](https://github.com/samuelowles/palmi/issues/68) | App Store app registration |
| E8.3 | [#70](https://github.com/samuelowles/palmi/issues/70) | App Store metadata |
| E8.6 | [#73](https://github.com/samuelowles/palmi/issues/73) | app.json + eas.json |
| E9.7 | [#85](https://github.com/samuelowles/palmi/issues/85) | Review-response workflow |
| E9.8 | [#86](https://github.com/samuelowles/palmi/issues/86) | TikTok launch content |
| E9.9 | [#87](https://github.com/samuelowles/palmi/issues/87) | Pinned-comment template |

**Domain-blocked (no code blocker, but `getpalmi.com` not yet acquired):**

- [E7.7](https://github.com/samuelowles/palmi/issues/65) — Host Privacy Policy
- [E7.8](https://github.com/samuelowles/palmi/issues/66) — Host Terms of Service

These carry the note `_(also blocked on: getpalmi.com domain acquisition)_` in their `## Blocked by` line.

---

## 6. How to add a new issue

**If it fits under an existing child**, add it to the body of that child as an acceptance-criteria checkbox — do not create a new issue.

**If it is genuinely new work**, determine:
1. **Which epic** (E1–E9)? See §3.
2. **What blocks it**? Look at adjacent issues in the same epic and the dependency rules in §5.
3. **Who blocks it**? Use internal IDs (E1.1 etc.) — translate to GitHub numbers via §10.

```bash
# 1. Create the issue attached to the epic
gh issue create --repo samuelowles/palmi \
  --parent <epic_issue_number> \
  --title "Add XYZ" \
  --body-file body.md
```

`body.md` should contain:

```markdown
## Goal
<one line>

## Acceptance criteria
- [ ] criterion
- [ ] criterion

## Spec reference
<where this is defined — PRD/ARCH/DEPLOY/AI_RULES + section>

## Blocked by
#<blocker_1>, #<blocker_2>    # OR: _(none — ready to start)_
```

Then, if blockers list is empty, add the `ready` label:

```bash
gh issue edit <new_num> --repo samuelowles/palmi --add-label ready
```

**If the new issue is bigger than ~1 day of work**, do not file it as a single issue. Instead, create a parent issue (a child of the epic), then create N sub-issues attached to it via `--parent <parent_num>`.

---

## 7. How to update an existing issue

| Action | Command |
|---|---|
| Edit title | `gh issue edit <num> --repo samuelowles/palmi --title "New title"` |
| Edit body | `gh issue edit <num> --repo samuelowles/palmi --body-file body.md` |
| Add `ready` label | `gh issue edit <num> --repo samuelowles/palmi --add-label ready` |
| Remove `ready` label | `gh issue edit <num> --repo samuelowles/palmi --remove-label ready` |
| Add sub-issue | `gh issue create --parent <num> --repo samuelowles/palmi ...` |
| Close as duplicate | `gh issue close <num> --repo samuelowles/palmi --comment "Duplicate of #X"` |

**Editing a body preserves everything** — `gh issue edit --body-file` replaces the full body. If you want to append, fetch the current body first, edit locally, then write back.

**When a blocker closes**, re-run the dependency check (see §8) — issues that previously had blockers should get the `ready` label. There's no automation for this yet; do it manually when closing blockers.

---

## 8. Re-running the dependency check

If you edit dependency relationships (e.g., add new blockers, remove old ones), re-run `phase4_order.py` from the script directory. It:

1. Fetches each issue's current body
2. Strips any prior `## Blocked by` section
3. Appends a fresh one based on the in-script `BLOCKERS` dict
4. Adds the `ready` label iff blockers list is empty AND id is not in `DOMAIN_BLOCKED`

To update the dependency graph, edit the `BLOCKERS` dict in `phase4_order.py` (it uses internal IDs — see §10 for the ID→number map). Then re-run the script.

---

## 9. Build artifacts (outside the repo)

All scripts and manifests live at `C:\Users\sam\AppData\Local\Temp\palmi-issues\`:

| File | Purpose |
|---|---|
| `create_children.py` | Original 78-child creation script (E1.1–E4.2 only — was interrupted by GraphQL error) |
| `create_children_resume.py` | Resumed E4.3–E9.10 creation with retry/backoff |
| `create_subs.py` | 7 split-parents + 20 sub-issues (UTF-8 stdout required) |
| `phase4_order.py` | Append `## Blocked by` to each body, apply `ready` label |
| `manifest_children.json` | ID → issue number map for the 78 children |
| `manifest_subs.json` | 7 parent + 20 sub issue numbers |

**These are not committed to the repo** — they're session-scoped and live in the OS temp dir. Re-run the scripts to rebuild if the temp dir is cleared.

To re-run any script:

```bash
export GH_TOKEN="ghp_..."   # rotated PAT, see §11
export PATH="/c/Program Files/GitHub CLI:$PATH"
export PYTHONIOENCODING=utf-8
cd "/c/Users/sam/AppData/Local/Temp/palmi-issues"
/c/Program\ Files/Python313/python.exe <script>.py
```

---

## 10. ID → GitHub issue number map

| ID | # | ID | # | ID | # |
|---|---|---|---|---|---|
| E1.1 | 11 | E3.7.1 | 96 | E5.4.3 | 109 |
| E1.2 | 12 | E3.7.2 | 97 | E6.1 | 50 |
| E1.3 | 13 | E3.7.3 | 98 | E6.2 | 51 |
| E1.4 | 14 | E3.7.4 | 99 | E6.3 | 52 |
| E1.5 | 15 | E4.1 | 33 | E6.4 | 53 |
| E1.6 | 16 | E4.2 | 34 | E6.5 | 94 |
| E1.7 | 17 | E4.3 | 35 | E6.5.1 | 110 |
| E1.8 | 18 | E4.4 | 36 | E6.5.2 | 111 |
| E1.9 | 19 | E4.5 | 90 | E6.5.3 | 112 |
| E2.1 | 20 | E4.5.1 | 100 | E6.6 | 54 |
| E2.2 | 21 | E4.5.2 | 101 | E6.7 | 95 |
| E2.3 | 22 | E4.6 | 91 | E6.7.1 | 113 |
| E2.4 | 23 | E4.6.1 | 102 | E6.7.2 | 140 |
| E2.5 | 24 | E4.6.2 | 103 | E6.7.3 | 141 |
| E2.6 | 25 | E4.7 | 37 | E6.8 | 55 |
| E3.1 | 26 | E4.8 | 38 | E6.9 | 56 |
| E3.2 | 27 | E4.9 | 39 | E6.10 | 57 |
| E3.3 | 28 | E4.10 | 40 | E6.11 | 58 |
| E3.4 | 29 | E4.11 | 41 | E7.1 | 59 |
| E3.5 | 30 | E4.12 | 42 | E7.2 | 60 |
| E3.6 | 31 | E5.1 | 92 | E7.3 | 61 |
| E3.7 | 89 | E5.1.1 | 104 | E7.4 | 62 |
| E3.8 | 32 | E5.1.2 | 105 | E7.5 | 63 |
| E5.1.3 | 106 | E7.6 | 64 | E7.7 | 65 |
| E5.2 | 43 | E7.8 | 66 | E7.9 | 67 |
| E5.3 | 44 | E8.1 | 68 | E8.2 | 69 |
| E5.4 | 93 | E8.3 | 70 | E8.4 | 71 |
| E5.4.1 | 107 | E8.5 | 72 | E8.6 | 73 |
| E5.4.2 | 108 | E8.7 | 74 | E8.8 | 75 |
| E5.5 | 45 | E8.9 | 76 | E8.10 | 77 |
| E5.6 | 46 | E8.11 | 78 | E9.1 | 79 |
| E5.7 | 47 | E9.2 | 80 | E9.3 | 81 |
| E5.8 | 48 | E9.4 | 82 | E9.5 | 83 |
| E5.9 | 49 | E9.6 | 84 | E9.7 | 85 |
| E9.8 | 86 | E9.9 | 87 | E9.10 | 88 |

---

## 11. Open items & caveats

- **Domain `getpalmi.com` is not yet acquired.** Required before [E7.7](https://github.com/samuelowles/palmi/issues/65) and [E7.8](https://github.com/samuelowles/palmi/issues/66) can close. The [epic #7 body](https://github.com/samuelowles/palmi/issues/7) calls this out.
- **GitHub PAT was pasted into the chat transcript** during backlog setup. Rotate it in GitHub → Settings → Developer settings → Personal access tokens if the transcript is in a sensitive store.
- **26 issues closed as accidental duplicates** (numbers #114–#139). They were created when `create_subs.py` was re-run to pick up 2 missed sub-issues; the print encoding error stopped the first run partway and the re-run created a fresh full set. All closed with a "Duplicate of earlier batch" comment. Safe to leave as historical record, or `gh issue delete` if the owner has admin rights.
- **Smoke-test issue #10** was created to verify `--parent` works and then closed. Title `_smoke_test_delete_me`.
- **No automation of `ready` label updates.** When you close a blocker, manually `gh issue edit` each newly-unblocked issue to add the label. A `hooks/listen`-style bot could be added later.

---

## 12. Conventions cheatsheet

- **One issue = one shippable unit.** Bigger than ~1 day of work → split into sub-issues.
- **Imperative titles.** "Add users table", not "Users table needs to be added".
- **Bodies include**: Goal (1 line), Acceptance criteria (3–6 bullets), Spec reference (PRD/ARCH/DEPLOY/AI_RULES + section), and the auto-appended `## Blocked by` section.
- **Don't invent scope.** If the spec doesn't mention it, ask. Five questions were resolved up front (price, models, domain, SDK, synergy algorithm); more may surface as work begins.
- **No new labels** without good reason. The `epic` / `ready` pair is enough to filter; the parent relationship handles structure.
- **Don't refactor existing issues** when adding a new one. Just append.
