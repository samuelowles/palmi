#!/usr/bin/env node
// Palmi autonomous epic loop driver.
// Deterministic control flow + gates live in code. `claude -p` is used ONLY to
// implement and to review. Tests and the merge decision are enforced by this
// script, never by trusting the model. No auto-classifier, no slash commands.
//
// Usage:
//   node .claude/loop/run-epic.mjs <epicNumber>            # preflight only (safe, no writes)
//   node .claude/loop/run-epic.mjs --claude-smoke          # verify Claude Code API auth
//   node .claude/loop/run-epic.mjs <epicNumber> --run      # full autonomous loop, merges to main
//
// Env overrides (all optional):
//   LOOP_REPO=owner/name   LOOP_MODEL=MiniMax-M3   LOOP_MAX_FIX=3   LOOP_MAX_REVIEW=3
//   LOOP_BARE=0            LOOP_CLAUDE_TIMEOUT_MS=1200000
//   LOOP_CLAUDE_SMOKE_TIMEOUT_MS=30000   LOOP_MINIMAX_AUTH_TIMEOUT_MS=30000
//   LOOP_REQUIRE_MINIMAX=0 # only for deliberate non-MiniMax tests

import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO = process.env.LOOP_REPO || 'samuelowles/palmi';
const [OWNER, NAME] = REPO.split('/');
const MODEL = process.env.LOOP_MODEL || 'MiniMax-M3';
const MAX_FIX = +(process.env.LOOP_MAX_FIX || 3);
const MAX_REVIEW = +(process.env.LOOP_MAX_REVIEW || 3);
const BARE = process.env.LOOP_BARE !== '0';
const CLAUDE_TIMEOUT = +(process.env.LOOP_CLAUDE_TIMEOUT_MS || 1200000);
const CLAUDE_SMOKE_TIMEOUT = +(process.env.LOOP_CLAUDE_SMOKE_TIMEOUT_MS || 30000);
const MINIMAX_AUTH_TIMEOUT = +(process.env.LOOP_MINIMAX_AUTH_TIMEOUT_MS || 30000);
const REQUIRE_MINIMAX = process.env.LOOP_REQUIRE_MINIMAX !== '0';

const SELF_CHECK = process.argv.includes('--self-check');
const CLAUDE_SMOKE = process.argv.includes('--claude-smoke');
const epicArg = process.argv.find((arg) => /^\d+$/.test(arg));
const epic = epicArg ? +epicArg : 0;
const RUN = process.argv.includes('--run');
const tmpFiles = [];
const failed = new Set();
if (!epic && !SELF_CHECK && !CLAUDE_SMOKE) die('Usage: node .claude/loop/run-epic.mjs <epicNumber> [--run] [--claude-smoke] or --self-check');

const ROOT = run('git', ['rev-parse', '--show-toplevel'], { cwd: process.cwd() }).out || process.cwd();

// ---- tiny shell helpers -----------------------------------------------------
function cmdQuote(arg) {
  const s = String(arg);
  return /[\s"&|<>^]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
}
function commandSpec(file, args) {
  if (process.platform === 'win32') {
    if (file === 'npm' || file === 'npx') {
      return { file: 'cmd.exe', args: ['/d', '/s', '/c', [file, ...args].map(cmdQuote).join(' ')], display: [file, ...args] };
    }
    if (file === 'claude') {
      const shim = join(process.env.APPDATA || '', 'npm', 'claude.ps1');
      if (existsSync(shim)) return { file: 'powershell.exe', args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', shim, ...args], display: [file, ...args] };
    }
  }
  return { file, args, display: [file, ...args] };
}
function run(file, args, opts = {}) {
  const spec = commandSpec(file, args);
  const res = spawnSync(spec.file, spec.args, {
    cwd: opts.cwd || ROOT,
    input: opts.input,
    encoding: 'utf8',
    shell: false,
    timeout: opts.timeout || 0,
    maxBuffer: 256 * 1024 * 1024,
  });
  return {
    code: res.status == null ? 1 : res.status,
    out: (res.stdout || '').trim(),
    err: [res.stderr || '', res.error?.message || ''].join('\n').trim(),
    signal: res.signal,
    cmd: spec.display.join(' '),
  };
}
function must(file, args, opts) {
  const r = run(file, args, opts);
  if (r.code !== 0) die(`Command failed: ${r.cmd}\n${r.err || r.out}`);
  return r;
}
function die(msg) { console.error(`\n[loop] FATAL: ${msg}`); cleanup(); process.exit(1); }
function log(msg) { console.log(`[loop] ${msg}`); }
function tmp(name, content) {
  const f = join(tmpdir(), `palmi-loop-${process.pid}-${name}`);
  writeFileSync(f, content, 'utf8'); tmpFiles.push(f); return f;
}
function cleanup() { for (const f of tmpFiles) { try { rmSync(f, { force: true }); } catch {} } }

// ---- github -----------------------------------------------------------------
const EPIC_QUERY = `query($owner:String!,$name:String!,$epic:Int!){
  repository(owner:$owner,name:$name){ issue(number:$epic){ number title
    subIssues(first:100){ nodes { number title state body
      subIssues(first:100){ nodes { number title state body } } } } } } }`;

function fetchEpic() {
  const qf = tmp('epic.graphql', EPIC_QUERY);
  const r = must('gh', ['api', 'graphql', '-f', `owner=${OWNER}`, '-f', `name=${NAME}`,
    '-F', `epic=${epic}`, '-F', `query=@${qf}`]);
  const root = JSON.parse(r.out).data.repository.issue;
  if (!root) die(`Epic #${epic} not found in ${REPO}`);
  const flat = [];
  const states = new Map();
  for (const c of root.subIssues.nodes) {
    states.set(c.number, c.state);
    flat.push(c);
    for (const s of c.subIssues.nodes) { states.set(s.number, s.state); flat.push(s); }
  }
  return { title: root.title, flat, states };
}
function blockers(body) {
  const m = (body || '').match(/##\s*Blocked by([\s\S]*?)(\n##\s|$)/i);
  if (!m || /none|ready to start/i.test(m[1])) return [];
  return [...m[1].matchAll(/#(\d+)/g)].map((x) => +x[1]);
}
const stateCache = new Map();
function isClosed(num, states) {
  if (states.has(num)) return states.get(num) === 'CLOSED';
  if (stateCache.has(num)) return stateCache.get(num) === 'CLOSED';
  const r = run('gh', ['issue', 'view', `${num}`, '--repo', REPO, '--json', 'state']);
  const st = r.code === 0 ? (JSON.parse(r.out).state || 'OPEN') : 'OPEN';
  stateCache.set(num, st); return st === 'CLOSED';
}
function nextReady() {
  const { flat, states } = fetchEpic();
  return flat
    .filter((i) => i.state === 'OPEN' && !failed.has(i.number))
    .sort((a, b) => a.number - b.number)
    .find((i) => blockers(i.body).every((b) => isClosed(b, states)));
}

// ---- claude headless agent --------------------------------------------------
function claudeAgent(prompt, label, timeout = CLAUDE_TIMEOUT) {
  const args = ['-p', '--output-format', 'json', '--permission-mode', 'bypassPermissions'];
  if (BARE) args.push('--bare');
  if (MODEL) args.push('--model', MODEL);
  const r = run('claude', args, { input: prompt, timeout });
  if (r.signal) die(`claude ${label} timed out after ${timeout}ms`);
  let j; try { j = JSON.parse(r.out); }
  catch { die(`claude ${label} returned non-JSON:\n${(r.out || r.err).slice(0, 800)}`); }
  if (j.is_error) die(`claude ${label} error (api ${j.api_error_status || '?'}): ${j.result || ''}`);
  return (j.result || '').trim();
}
function miniMaxAuthCheck() {
  if (!REQUIRE_MINIMAX) return;
  const base = (process.env.ANTHROPIC_BASE_URL || '').replace(/\/+$/, '');
  if (!/minimax/i.test(base)) die('ANTHROPIC_BASE_URL must point at MiniMax before --claude-smoke/--run; set LOOP_REQUIRE_MINIMAX=0 only for deliberate non-MiniMax tests');
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) die('MiniMax auth missing: set ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN before --claude-smoke/--run');
  const code = `
const base = (process.env.ANTHROPIC_BASE_URL || '').replace(/\\/+$/, '');
const model = process.env.LOOP_MODEL || 'MiniMax-M3';
const token = process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY || '';
const headers = { 'content-type': 'application/json', 'anthropic-version': '2023-06-01' };
if (process.env.ANTHROPIC_AUTH_TOKEN) headers.Authorization = 'Bearer ' + token;
else headers['x-api-key'] = token;
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), Math.max(1000, +(process.env.LOOP_MINIMAX_AUTH_TIMEOUT_MS || 30000) - 1000));
try {
  const res = await fetch(base + '/v1/messages', {
    method: 'POST', headers, signal: controller.signal,
    body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'Reply OK.' }] }),
  });
  const body = await res.text();
  if (!res.ok) { console.error(res.status + ' ' + res.statusText + ': ' + body.slice(0, 500)); process.exit(1); }
} catch (e) {
  console.error(e.name === 'AbortError' ? 'request timed out' : e.message);
  process.exit(1);
} finally { clearTimeout(timeout); }
`;
  const r = run(process.execPath, ['-e', code], { timeout: MINIMAX_AUTH_TIMEOUT });
  if (r.signal) die(`MiniMax auth check timed out after ${MINIMAX_AUTH_TIMEOUT}ms`);
  if (r.code !== 0) die(`MiniMax auth check failed before Claude Code launch:\n${(r.err || r.out).slice(0, 800)}`);
  log(`MiniMax auth check: ok (${MODEL})`);
}
function claudeSmoke() {
  miniMaxAuthCheck();
  const result = claudeAgent('Reply exactly OK.', 'smoke', CLAUDE_SMOKE_TIMEOUT);
  if (!/^OK\b/i.test(result)) die(`claude smoke returned unexpected output: ${result.slice(0, 200)}`);
  log('claude smoke: ok');
}

// ---- prompts ----------------------------------------------------------------
const RULES = existsSync(join(ROOT, 'CLAUDE.md')) ? readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8') : '';
function pImplement(i) {
  return `You are an autonomous senior engineer on the Palmi repo. Apply /ponytail full:
smallest safe change, reuse existing code, no new dependency unless the issue requires it,
no speculative abstractions.

Project rules (CLAUDE.md):
${RULES}

Work ONLY on this issue:
#${i.number} ${i.title}
${i.body}

Constraints:
- Edit only the files needed for THIS issue.
- Do NOT run git; do NOT commit, push, branch, or merge.
- Do NOT touch .env*, secrets, or stale context dumps.
- If a matching implementation already exists (VERIFY-ONLY), patch only the gap.
- End by listing the files you changed.`;
}
function pFixTests(i, failures) {
  return `The change for issue #${i.number} failed local checks. Fix with the SMALLEST diff.
Do not run git. Do not touch unrelated files.

Failing checks:
${failures}`;
}
function pReview(i, diff) {
  return `You are a SEPARATE Ponytail review agent. Review ONLY this diff for issue
#${i.number} ${i.title}.

First line of your reply MUST be exactly "APPROVE" or "CHANGES_REQUESTED".
APPROVE only if the diff is a minimal, correct, secure, in-scope fix.
Otherwise CHANGES_REQUESTED, then the smallest required fixes as bullet points.

Check: issue scope (one issue, no unrelated cleanup), ponytail minimalism, reuse,
security/privacy (no secrets, no raw palm/base64 logging, no raw provider/LLM leakage,
no raw IP persistence), and that the change is covered by tests.

Diff:
${diff}`;
}
function pFixReview(i, notes) {
  return `The Ponytail reviewer requested changes for issue #${i.number}. Apply the SMALLEST
fix. Do not run git. Do not touch unrelated files.

Reviewer notes:
${notes}`;
}

// ---- tests (the hard boundary) ---------------------------------------------
function changedAreas() {
  const o = run('git', ['status', '--porcelain']).out;
  const set = new Set();
  for (const line of o.split('\n')) {
    const p = line.slice(3).trim().replace(/^"|"$/g, '');
    if (p.startsWith('app/')) set.add('app');
    else if (p.startsWith('cloudflare/')) set.add('cloudflare');
  }
  return set;
}
function runTests(areas) {
  const results = [['git diff --check', run('git', ['diff', '--check'])]];
  for (const a of areas) {
    results.push([`${a}: npm test`, run('npm', ['test'], { cwd: join(ROOT, a) })]);
    if (a === 'app') results.push(['app: npm run lint', run('npm', ['run', 'lint'], { cwd: join(ROOT, a) })]);
    results.push([`${a}: tsc --noEmit`, run('npx', ['tsc', '--noEmit'], { cwd: join(ROOT, a) })]);
  }
  return results;
}
const allGreen = (res) => res.every(([, r]) => r.code === 0);
function isApproved(verdict) {
  const first = (verdict.split('\n').find((l) => l.trim()) || '').trim();
  return /^APPROVE\b/i.test(first) && !/CHANGES_REQUESTED/i.test(first);
}
function failText(res) {
  return res.filter(([, r]) => r.code !== 0)
    .map(([name, r]) => `### ${name}\n${(r.out + '\n' + r.err).trim().slice(-2000)}`).join('\n\n');
}
function stabilize(i) {
  let res = runTests(changedAreas());
  let tries = 0;
  while (!allGreen(res) && tries < MAX_FIX) {
    tries++;
    log(`tests red - fix attempt ${tries}/${MAX_FIX}`);
    claudeAgent(pFixTests(i, failText(res)), `fix-tests #${i.number}`);
    res = runTests(changedAreas());
  }
  return { green: allGreen(res), res };
}

// ---- security gate ----------------------------------------------------------
const SECRET_PATTERNS = [
  /(^|\/)\.env(\.|$)/m, /(^|\/)\.dev\.vars$/m,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /gh[pousr]_[A-Za-z0-9]{20,}/,
  /sk-[A-Za-z0-9]{20,}/, /AKIA[0-9A-Z]{16}/,
];
function secretScan() {
  const files = run('git', ['diff', '--cached', '--name-only']).out;
  const diff = run('git', ['diff', '--cached']).out;
  const hay = files + '\n' + diff;
  const hit = SECRET_PATTERNS.find((re) => re.test(hay));
  if (hit) die(`secret-scan tripped (${hit}). Aborting before commit.`);
}

// ---- per-issue pipeline -----------------------------------------------------
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
const safeTitle = (s) => s.replace(/[&|<>^%!()"`]/g, '').trim();

function cleanToMain() {
  run('git', ['reset', '--hard']);
  run('git', ['clean', '-fd']);
  run('git', ['checkout', 'main']);
  run('git', ['fetch', 'origin']);
  run('git', ['reset', '--hard', 'origin/main']);
}
function failIssue(i, reason, prNum) {
  log(`ISSUE #${i.number} FAILED: ${reason}`);
  run('gh', ['issue', 'comment', `${i.number}`, '--repo', REPO, '--body',
    `Autonomous loop could not complete this issue: ${safeTitle(reason)}. It was skipped; dependent issues remain blocked.`]);
  if (prNum) run('gh', ['pr', 'comment', `${prNum}`, '--repo', REPO, '--body',
    `Autonomous loop stopped here: ${safeTitle(reason)}.`]);
  failed.add(i.number);
  cleanToMain();
}

function processIssue(i) {
  log(`\n=== issue #${i.number}: ${i.title} ===`);
  if (run('git', ['status', '--porcelain']).out) die('working tree dirty; commit/stash before running the loop');

  must('git', ['fetch', 'origin', '--prune']);
  must('git', ['checkout', 'main']);
  must('git', ['reset', '--hard', 'origin/main']);
  const branch = `minimax/issue-${i.number}-${slug(i.title)}`;
  must('git', ['checkout', '-B', branch]);

  claudeAgent(pImplement(i), `implement #${i.number}`);
  if (!run('git', ['status', '--porcelain']).out) return failIssue(i, 'implement step made no changes');

  let { green } = stabilize(i);
  if (!green) return failIssue(i, `tests still red after ${MAX_FIX} fix attempts`);

  must('git', ['add', '-A']);
  secretScan();
  const msg = tmp('commit.txt', `fix(issue-${i.number}): ${safeTitle(i.title)}\n\nFixes #${i.number}`);
  must('git', ['commit', '-F', msg]);
  must('git', ['push', '-u', 'origin', branch, '--force-with-lease']);

  const bodyFile = tmp('pr.md', prBody(i));
  let prNum;
  const existingPr = run('gh', ['pr', 'view', branch, '--repo', REPO, '--json', 'number']);
  if (existingPr.code === 0) {
    prNum = JSON.parse(existingPr.out).number;
    log(`reusing PR #${prNum}`);
  } else {
    must('gh', ['pr', 'create', '--repo', REPO, '--base', 'main', '--head', branch,
      '--title', `Fix #${i.number}: ${safeTitle(i.title)}`, '--body-file', bodyFile]);
    prNum = JSON.parse(must('gh', ['pr', 'view', branch, '--repo', REPO, '--json', 'number']).out).number;
    log(`opened PR #${prNum}`);
  }

  let approved = false;
  for (let round = 1; round <= MAX_REVIEW; round++) {
    const diff = run('git', ['diff', 'origin/main...HEAD']).out;
    const verdict = claudeAgent(pReview(i, diff), `review #${i.number}`);
    const first = (verdict.split('\n').find((l) => l.trim()) || '').trim();
    if (/^APPROVE\b/i.test(first) && !/CHANGES_REQUESTED/i.test(first)) { approved = true; break; }
    log(`review round ${round}/${MAX_REVIEW}: changes requested`);
    if (round === MAX_REVIEW) break;
    claudeAgent(pFixReview(i, verdict), `fix-review #${i.number}`);
    if (!run('git', ['status', '--porcelain']).out) { approved = false; break; }
    const s = stabilize(i); green = s.green;
    if (!green) { approved = false; break; }
    must('git', ['add', '-A']); secretScan();
    must('git', ['commit', '--amend', '--no-edit']);
    must('git', ['push', '--force-with-lease']);
  }

  if (!(approved && green)) return failIssue(i, 'did not pass review + tests', prNum);

  must('gh', ['pr', 'merge', `${prNum}`, '--repo', REPO, '--squash', '--delete-branch']);
  must('git', ['checkout', 'main']);
  must('git', ['fetch', 'origin']);
  must('git', ['reset', '--hard', 'origin/main']);
  log(`MERGED PR #${prNum} (issue #${i.number}) to main`);
}
function prBody(i) {
  return `Fixes #${i.number}

## What changed
Autonomous loop implementation for issue #${i.number}: ${i.title}

## Ponytail check
- Smallest safe diff; reused existing code/schemas; no new dependencies unless required.

## Checks (enforced by the loop before merge)
- npm test + tsc --noEmit on every changed area (app/cloudflare) returned green.

## Security/privacy
- secret-scan passed; no .env*/secrets; no raw palm/base64 logging; no raw provider/LLM leakage; no raw IP persistence.

## Review
- Approved by a separate Ponytail review agent.`;
}

// ---- preflight --------------------------------------------------------------
function preflight() {
  log(`preflight for epic #${epic} in ${REPO}`);
  log(`claude: ${run('claude', ['--version']).out || 'MISSING'}`);
  log(`model:  ${MODEL}`);
  log(`gh:     ${run('gh', ['--version']).out.split('\n')[0] || 'MISSING'}`);
  log(`git:    ${run('git', ['--version']).out || 'MISSING'}`);
  const auth = run('gh', ['auth', 'status']);
  log(`gh auth: ${auth.code === 0 ? 'ok' : 'NOT LOGGED IN'}`);
  const dirty = run('git', ['status', '--porcelain']).out;
  log(`working tree: ${dirty ? 'DIRTY (loop will refuse with --run until clean)' : 'clean'}`);
  const { title, flat, states } = fetchEpic();
  log(`epic: ${title}`);
  const open = flat.filter((i) => i.state === 'OPEN' && !/_smoke_test_/i.test(i.title));
  log(`open sub-issues: ${open.length}`);
  for (const i of open.sort((a, b) => a.number - b.number)) {
    const b = blockers(i.body);
    const ready = b.every((n) => isClosed(n, states));
    log(`  #${i.number} [${ready ? 'READY' : 'blocked by ' + b.filter((n) => !isClosed(n, states)).map((n) => '#' + n).join(',')}] ${i.title}`);
  }
  const first = nextReady();
  log(first ? `next ready: #${first.number} ${first.title}` : 'next ready: none');
  if (CLAUDE_SMOKE) claudeSmoke();
  log('preflight only. Re-run with --run to execute the autonomous loop.');
}

// ---- self-check -------------------------------------------------------------
function assertLoop(condition, label) {
  if (!condition) die(`self-check failed: ${label}`);
}
function selfCheck() {
  assertLoop(JSON.stringify(blockers('## Blocked by\n#11, #12\n')) === JSON.stringify([11, 12]), 'blocker list');
  assertLoop(blockers('## Blocked by\n_(none - ready to start)_\n').length === 0, 'none blocker');
  assertLoop(JSON.stringify(blockers('## Blocked by\n#15\n\n## Other\n#999')) === JSON.stringify([15]), 'stop at next section');
  assertLoop(allGreen([['a', { code: 0 }], ['b', { code: 0 }]]), 'green checks pass');
  assertLoop(!allGreen([['a', { code: 0 }], ['b', { code: 1 }]]), 'red check blocks');
  assertLoop(isApproved('APPROVE\n- ok'), 'approve verdict');
  assertLoop(!isApproved('CHANGES_REQUESTED\n- fix'), 'changes requested blocks');
  assertLoop(!isApproved('Looks fine'), 'prose verdict blocks');
  const trips = (text) => SECRET_PATTERNS.some((re) => re.test(text));
  assertLoop(trips('cloudflare/.env'), 'env path trips');
  assertLoop(trips('ghp_' + 'a'.repeat(36)), 'gh token trips');
  assertLoop(!trips('const ok = true;'), 'clean text passes');
  assertLoop(run('npm', ['--version'], { cwd: join(ROOT, 'app') }).code === 0, 'npm shim');
  assertLoop(run('npx', ['--version'], { cwd: join(ROOT, 'app') }).code === 0, 'npx shim');
  log('self-check passed');
}

// ---- main -------------------------------------------------------------------
if (SELF_CHECK) { selfCheck(); cleanup(); process.exit(0); }
if (CLAUDE_SMOKE && !epic) { claudeSmoke(); cleanup(); process.exit(0); }
if (!RUN) { preflight(); cleanup(); process.exit(0); }

log(`AUTONOMOUS RUN: epic #${epic} in ${REPO}. Merges to main without human input.`);
if (run('git', ['status', '--porcelain']).out) die('working tree dirty; commit/stash before running the loop');
// The loop resets each issue to origin/main, so the scaffolding it depends on
// (CLAUDE.md + this driver) must already be on origin/main or it would erase
// itself on the first issue. Refuse to run until that is true.
run('git', ['fetch', 'origin']);
for (const f of ['.claude/loop/run-epic.mjs', 'CLAUDE.md']) {
  if (run('git', ['cat-file', '-e', `origin/main:${f}`]).code !== 0)
    die(`origin/main is missing ${f}. Push the loop scaffolding to origin/main before --run (the loop resets to origin/main each issue and would otherwise erase itself).`);
}
claudeSmoke();
let done = 0;
while (true) {
  const i = nextReady();
  if (!i) break;
  if (/_smoke_test_/i.test(i.title)) { failed.add(i.number); continue; }
  processIssue(i);
  done++;
  if (done > 200) die('safety stop: 200 issues processed');
}
log(`\n=== epic #${epic} loop complete. processed=${done} failed=${[...failed].join(',') || 'none'} ===`);
cleanup();
