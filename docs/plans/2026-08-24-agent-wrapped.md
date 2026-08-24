# agent-wrapped Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local-first `npx` CLI that reads the user's own Claude Code transcripts and renders a shareable card describing how they work with an agent.

**Architecture:** A four-stage pipeline with no shared state: `discover` (walk the transcript tree, classify each file by project and subagent-ness) → `parse` (stream JSONL line-by-line, extract usage records, deduplicate) → `stats` (aggregate into one plain `Stats` object) → `render` (terminal by default, HTML behind a flag). Every stage takes its input as a parameter rather than reading globals, so all of it is testable against fixture directories with no mocking.

**Tech Stack:** Node 20+, TypeScript, `node:test` + `node:assert` for tests. **Zero runtime dependencies and exactly one dev dependency (`typescript`)** — the privacy claim is "read the source", which only works if there is little source and nothing else to audit.

**Spec:** `/Users/lfgcampos/Projects/second-brain/projects/agent-wrapped.md`

## Global Constraints

- **No currency, anywhere.** No price table, no per-model rates, no cache multipliers, no dollar figures in code, tests, output, or docs. If a task seems to need a cost, it is wrong.
- **Nothing leaves the machine.** No network calls, no telemetry, no analytics, no account. The package must have zero runtime dependencies.
- **Project names are grouping keys only.** They are never rendered, logged, or written to output — only ranks, shares, and counts. This applies to `--json` output too.
- **Every percentage renders its denominator** in the adjacent label.
- **Skill shares are weighted by tokens written**, never by total tokens. Do not "simplify" to total tokens: it changes both the headline share (27% → 18%) and which skill ranks first.
- **Memory ceiling:** transcript trees reach 900 MB. Files must be streamed line-by-line; never `readFile` a transcript.
- Node engines floor: `>=20`. Package is ESM (`"type": "module"`).

---

### Task 1: Repo scaffold and transcript discovery

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `README.md`
- Create: `src/types.ts`
- Create: `src/discover.ts`
- Test: `test/discover.test.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `TranscriptFile`, `UsageRecord`, `Stats`, `SkillShare`, `Retention` types from `src/types.ts`; `discover(root: string): Promise<TranscriptFile[]>` and `normalizeProject(dirName: string): string` from `src/discover.ts`

- [ ] **Step 1: Initialize the repo and toolchain**

```bash
cd ~/Projects/agent-wrapped
git init
mkdir -p src test
printf 'node_modules/\ndist/\n*.tsbuildinfo\n' > .gitignore
npm pkg set name=agent-wrapped version=0.1.0 type=module license=MIT
npm pkg set description="Local-first wrapped card for your Claude Code usage. Nothing leaves your machine."
npm pkg set engines.node=">=20"
npm pkg set bin.agent-wrapped=dist/cli.js
npm pkg set scripts.build="tsc"
npm pkg set scripts.test="tsc && node --test dist-test/"
npm install --save-dev typescript
```

- [ ] **Step 2: Add `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "node16",
    "moduleResolution": "node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "declaration": false,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

Tests compile separately so they can import from `src`. Add `tsconfig.test.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "outDir": "dist-test", "rootDir": "." },
  "include": ["src", "test"]
}
```

Then correct the test script to use it:

```bash
npm pkg set scripts.test="tsc -p tsconfig.test.json && node --test dist-test/test/"
```

- [ ] **Step 3: Write `src/types.ts`**

```typescript
/** One transcript file on disk, already classified. */
export interface TranscriptFile {
  path: string;
  /** Grouping key only — never rendered. */
  project: string;
  /** True when the file lives under a `subagents/` directory. */
  fromSubagentDir: boolean;
}

/** One deduplicated API response. */
export interface UsageRecord {
  /** message.id, falling back to requestId. Deduplication key. */
  id: string;
  /** ISO-8601 timestamp as written in the transcript. */
  ts: string;
  model: string;
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
  project: string;
  isSubagent: boolean;
  skill: string | null;
}

export interface SkillShare {
  skill: string;
  written: number;
  /** Fraction of tokens written inside any skill, 0..1. */
  share: number;
}

export interface Stats {
  calls: number;
  firstDay: string;
  lastDay: string;
  activeDays: number;
  written: number;
  contextRead: number;
  /** contextRead / written. The headline. */
  readWriteRatio: number;
  /** cacheRead / contextRead, 0..1. */
  cacheShare: number;
  subagentCallShare: number;
  subagentWrittenShare: number;
  repoCount: number;
  /** Tokens written in the top three projects / all tokens written. */
  topThreeShare: number;
  /** Tokens written inside any skill / all tokens written. */
  skillAttributedShare: number;
  distinctSkills: number;
  /** Up to four entries, descending by written. */
  topSkills: SkillShare[];
  topFourSkillShare: number;
}

export interface Retention {
  /** Days between first and last record, inclusive. */
  windowDays: number;
  /** From ~/.claude/settings.json, null when unset. */
  cleanupPeriodDays: number | null;
  /** True when history is being silently deleted. */
  atRisk: boolean;
}
```

- [ ] **Step 4: Write the failing test `test/discover.test.ts`**

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discover, normalizeProject } from '../src/discover.js';

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'aw-'));
  await mkdir(join(root, '-Users-me-Projects-alpha', 'sess-1', 'subagents'), { recursive: true });
  await writeFile(join(root, '-Users-me-Projects-alpha', 'sess-1.jsonl'), '');
  await writeFile(join(root, '-Users-me-Projects-alpha', 'sess-1', 'subagents', 'agent-a1.jsonl'), '');
  await mkdir(join(root, '-Users-me-Projects-alpha--worktrees-feat'), { recursive: true });
  await writeFile(join(root, '-Users-me-Projects-alpha--worktrees-feat', 'sess-2.jsonl'), '');
  await writeFile(join(root, '-Users-me-Projects-alpha', 'notes.md'), 'ignore me');
  return root;
}

test('finds nested subagent transcripts, not just top-level ones', async () => {
  const files = await discover(await fixture());
  assert.equal(files.length, 3);
  assert.equal(files.filter((f) => f.fromSubagentDir).length, 1);
});

test('ignores non-jsonl files', async () => {
  const files = await discover(await fixture());
  assert.ok(files.every((f) => f.path.endsWith('.jsonl')));
});

test('attributes a subagent file to its real project, not to "subagents"', async () => {
  const files = await discover(await fixture());
  const sub = files.find((f) => f.fromSubagentDir)!;
  assert.equal(sub.project, 'Projects-alpha');
});

test('folds worktree checkouts into the parent repo', () => {
  assert.equal(normalizeProject('-Users-me-Projects-alpha--worktrees-feat'), 'Projects-alpha');
  assert.equal(normalizeProject('-Users-me-Projects-alpha'), 'Projects-alpha');
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/discover.js'`

- [ ] **Step 6: Write `src/discover.ts`**

```typescript
import { readdir } from 'node:fs/promises';
import { join, sep } from 'node:path';
import type { TranscriptFile } from './types.js';

/**
 * Reduce an encoded transcript directory name to a stable grouping key.
 * Strips the leading home-directory prefix and folds worktree checkouts
 * into their parent repo. The result is never rendered — it only groups.
 */
export function normalizeProject(dirName: string): string {
  return dirName
    .replace(/^-(Users|home)-[^-]+-/, '')
    .replace(/--?worktrees?-.*$/, '');
}

async function walk(dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // unreadable directory is not fatal
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else if (entry.isFile() && entry.name.endsWith('.jsonl')) out.push(full);
  }
}

/**
 * Find every transcript under `root`, including the nested
 * `<session>/subagents/agent-*.jsonl` files, which hold most of the files.
 */
export async function discover(root: string): Promise<TranscriptFile[]> {
  const paths: string[] = [];
  await walk(root, paths);
  return paths.map((path) => {
    const rel = path.slice(root.length + 1);
    const segments = rel.split(sep);
    return {
      path,
      project: normalizeProject(segments[0]),
      fromSubagentDir: segments.includes('subagents'),
    };
  });
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test`
Expected: PASS, 4 tests

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold repo and transcript discovery"
```

---

### Task 2: Streaming JSONL parse with deduplication

**Files:**
- Create: `src/parse.ts`
- Test: `test/parse.test.ts`

**Interfaces:**
- Consumes: `TranscriptFile`, `UsageRecord` from `src/types.js`; `discover` from `src/discover.js`
- Produces: `parseAll(files: TranscriptFile[]): Promise<UsageRecord[]>` from `src/parse.ts`

- [ ] **Step 1: Write the failing test `test/parse.test.ts`**

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseAll } from '../src/parse.js';
import type { TranscriptFile } from '../src/types.js';

function line(obj: unknown): string {
  return JSON.stringify(obj) + '\n';
}

function assistant(id: string, over: Record<string, unknown> = {}): string {
  return line({
    type: 'assistant',
    timestamp: '2026-08-01T10:00:00.000Z',
    isSidechain: false,
    message: {
      id,
      model: 'claude-opus-5',
      usage: {
        input_tokens: 1,
        output_tokens: 100,
        cache_creation_input_tokens: 10,
        cache_read_input_tokens: 1000,
      },
    },
    ...over,
  });
}

async function fixtureFile(contents: string): Promise<TranscriptFile[]> {
  const dir = await mkdtemp(join(tmpdir(), 'aw-'));
  const path = join(dir, 'sess.jsonl');
  await writeFile(path, contents);
  return [{ path, project: 'alpha', fromSubagentDir: false }];
}

test('extracts one record per assistant usage line', async () => {
  const records = await parseAll(await fixtureFile(assistant('m1') + assistant('m2')));
  assert.equal(records.length, 2);
  assert.equal(records[0].output, 100);
  assert.equal(records[0].cacheRead, 1000);
});

test('deduplicates repeated message.id — one response can span several lines', async () => {
  const records = await parseAll(await fixtureFile(assistant('m1') + assistant('m1')));
  assert.equal(records.length, 1);
});

test('skips synthetic model entries', async () => {
  const contents = assistant('m1') + assistant('m2', { message: { id: 'm2', model: '<synthetic>', usage: { output_tokens: 0 } } });
  const records = await parseAll(await fixtureFile(contents));
  assert.equal(records.length, 1);
});

test('ignores user lines and malformed JSON', async () => {
  const contents = assistant('m1') + line({ type: 'user', message: {} }) + '{not json\n';
  const records = await parseAll(await fixtureFile(contents));
  assert.equal(records.length, 1);
});

test('marks a record as subagent from the file path OR the isSidechain flag', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aw-'));
  const a = join(dir, 'a.jsonl');
  const b = join(dir, 'b.jsonl');
  await writeFile(a, assistant('m1'));
  await writeFile(b, assistant('m2', { isSidechain: true }));
  const records = await parseAll([
    { path: a, project: 'alpha', fromSubagentDir: true },
    { path: b, project: 'alpha', fromSubagentDir: false },
  ]);
  assert.equal(records.filter((r) => r.isSubagent).length, 2);
});

test('captures the attributed skill when present', async () => {
  const records = await parseAll(await fixtureFile(assistant('m1', { attributionSkill: 'superpowers:brainstorming' })));
  assert.equal(records[0].skill, 'superpowers:brainstorming');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/parse.js'`

- [ ] **Step 3: Write `src/parse.ts`**

```typescript
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { TranscriptFile, UsageRecord } from './types.js';

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Stream one transcript. Transcripts reach hundreds of megabytes, so lines
 * are read one at a time and never buffered whole.
 *
 * `seen` is shared across every file: a single API response can appear as
 * several transcript lines sharing one message.id, and resumed sessions can
 * duplicate whole transcripts. Both collapse here.
 */
async function parseFile(file: TranscriptFile, seen: Set<string>, out: UsageRecord[]): Promise<void> {
  const stream = createReadStream(file.path, { encoding: 'utf8' });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.includes('"usage"')) continue; // cheap pre-filter before JSON.parse
    let parsed: any;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (parsed?.type !== 'assistant') continue;
    const message = parsed.message ?? {};
    const usage = message.usage;
    if (!usage) continue;
    const id: string | undefined = message.id ?? parsed.requestId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const model: string = message.model ?? '';
    if (!model || model === '<synthetic>') continue;
    out.push({
      id,
      ts: typeof parsed.timestamp === 'string' ? parsed.timestamp : '',
      model,
      input: num(usage.input_tokens),
      output: num(usage.output_tokens),
      cacheCreate: num(usage.cache_creation_input_tokens),
      cacheRead: num(usage.cache_read_input_tokens),
      project: file.project,
      isSubagent: file.fromSubagentDir || parsed.isSidechain === true,
      skill: typeof parsed.attributionSkill === 'string' && parsed.attributionSkill ? parsed.attributionSkill : null,
    });
  }
}

export async function parseAll(files: TranscriptFile[]): Promise<UsageRecord[]> {
  const seen = new Set<string>();
  const out: UsageRecord[] = [];
  for (const file of files) await parseFile(file, seen, out);
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS, 10 tests total

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: stream and deduplicate transcript usage records"
```

---

### Task 3: Statistics aggregation

**Files:**
- Create: `src/stats.ts`
- Test: `test/stats.test.ts`

**Interfaces:**
- Consumes: `UsageRecord`, `Stats`, `SkillShare` from `src/types.js`
- Produces: `computeStats(records: UsageRecord[]): Stats` from `src/stats.ts`

- [ ] **Step 1: Write the failing test `test/stats.test.ts`**

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats } from '../src/stats.js';
import type { UsageRecord } from '../src/types.js';

function rec(over: Partial<UsageRecord> = {}): UsageRecord {
  return {
    id: Math.random().toString(36).slice(2),
    ts: '2026-08-01T10:00:00.000Z',
    model: 'claude-opus-5',
    input: 0,
    output: 100,
    cacheCreate: 0,
    cacheRead: 900,
    project: 'alpha',
    isSubagent: false,
    skill: null,
    ...over,
  };
}

test('read:write ratio counts every context token against written tokens', () => {
  const s = computeStats([rec({ input: 50, cacheCreate: 50, cacheRead: 900, output: 100 })]);
  assert.equal(s.contextRead, 1000);
  assert.equal(s.written, 100);
  assert.equal(s.readWriteRatio, 10);
});

test('cache share is measured against context read, not against everything', () => {
  const s = computeStats([rec({ input: 100, cacheCreate: 0, cacheRead: 900, output: 100 })]);
  assert.equal(s.cacheShare, 0.9);
});

test('subagent call share and written share are reported separately', () => {
  const s = computeStats([
    rec({ isSubagent: true, output: 10 }),
    rec({ isSubagent: true, output: 10 }),
    rec({ isSubagent: false, output: 80 }),
  ]);
  assert.equal(s.subagentCallShare, 2 / 3);
  assert.equal(s.subagentWrittenShare, 0.2);
});

test('skill shares are weighted by tokens written and divided by skill work only', () => {
  const s = computeStats([
    rec({ skill: 'a', output: 60 }),
    rec({ skill: 'b', output: 20 }),
    rec({ skill: null, output: 20 }),
  ]);
  assert.equal(s.skillAttributedShare, 0.8);
  assert.equal(s.distinctSkills, 2);
  assert.equal(s.topSkills[0].skill, 'a');
  assert.equal(s.topSkills[0].share, 0.75); // 60 of the 80 written inside a skill
});

test('repo concentration uses the top three projects and counts the rest', () => {
  const s = computeStats([
    rec({ project: 'a', output: 40 }),
    rec({ project: 'b', output: 30 }),
    rec({ project: 'c', output: 20 }),
    rec({ project: 'd', output: 10 }),
  ]);
  assert.equal(s.repoCount, 4);
  assert.equal(s.topThreeShare, 0.9);
});

test('active days counts distinct calendar days, not the span between them', () => {
  const s = computeStats([
    rec({ ts: '2026-07-16T10:00:00.000Z' }),
    rec({ ts: '2026-07-16T18:00:00.000Z' }),
    rec({ ts: '2026-08-24T09:00:00.000Z' }),
  ]);
  assert.equal(s.activeDays, 2);
  assert.equal(s.firstDay, '2026-07-16');
  assert.equal(s.lastDay, '2026-08-24');
});

test('empty input produces zeroes rather than NaN', () => {
  const s = computeStats([]);
  assert.equal(s.calls, 0);
  assert.equal(s.readWriteRatio, 0);
  assert.equal(s.cacheShare, 0);
  assert.equal(s.topSkills.length, 0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/stats.js'`

- [ ] **Step 3: Write `src/stats.ts`**

```typescript
import type { SkillShare, Stats, UsageRecord } from './types.js';

/** Guarded division — an empty dataset must yield 0, never NaN or Infinity. */
function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function sumBy<K>(records: UsageRecord[], key: (r: UsageRecord) => K, value: (r: UsageRecord) => number): Map<K, number> {
  const map = new Map<K, number>();
  for (const record of records) {
    map.set(key(record), (map.get(key(record)) ?? 0) + value(record));
  }
  return map;
}

export function computeStats(records: UsageRecord[]): Stats {
  const written = records.reduce((n, r) => n + r.output, 0);
  const cacheRead = records.reduce((n, r) => n + r.cacheRead, 0);
  const contextRead = records.reduce((n, r) => n + r.input + r.cacheCreate + r.cacheRead, 0);

  const days = [...new Set(records.map((r) => r.ts.slice(0, 10)).filter(Boolean))].sort();

  const subagents = records.filter((r) => r.isSubagent);

  const byProject = [...sumBy(records, (r) => r.project, (r) => r.output).values()].sort((a, b) => b - a);

  const skilled = records.filter((r) => r.skill !== null);
  const skillWritten = skilled.reduce((n, r) => n + r.output, 0);
  const bySkill = sumBy(skilled, (r) => r.skill as string, (r) => r.output);
  const ranked: SkillShare[] = [...bySkill.entries()]
    .map(([skill, w]) => ({ skill, written: w, share: ratio(w, skillWritten) }))
    .sort((a, b) => b.written - a.written);
  const topSkills = ranked.slice(0, 4);

  return {
    calls: records.length,
    firstDay: days[0] ?? '',
    lastDay: days[days.length - 1] ?? '',
    activeDays: days.length,
    written,
    contextRead,
    readWriteRatio: ratio(contextRead, written),
    cacheShare: ratio(cacheRead, contextRead),
    subagentCallShare: ratio(subagents.length, records.length),
    subagentWrittenShare: ratio(subagents.reduce((n, r) => n + r.output, 0), written),
    repoCount: byProject.length,
    topThreeShare: ratio(byProject.slice(0, 3).reduce((n, w) => n + w, 0), written),
    skillAttributedShare: ratio(skillWritten, written),
    distinctSkills: bySkill.size,
    topSkills,
    topFourSkillShare: topSkills.reduce((n, s) => n + s.share, 0),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS, 17 tests total

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: aggregate usage records into stats"
```

---

### Task 4: Retention detection

**Files:**
- Create: `src/retention.ts`
- Test: `test/retention.test.ts`

**Interfaces:**
- Consumes: `Stats`, `Retention` from `src/types.js`
- Produces: `detectRetention(settingsPath: string, stats: Stats): Promise<Retention>` from `src/retention.ts`

Kept separate from `stats.ts` because it reads a different input (`~/.claude/settings.json`) and has its own failure mode: the file is frequently absent, and absence is the *interesting* case rather than an error.

- [ ] **Step 1: Write the failing test `test/retention.test.ts`**

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectRetention } from '../src/retention.js';
import type { Stats } from '../src/types.js';

const stats = (firstDay: string, lastDay: string): Stats => ({
  calls: 1, firstDay, lastDay, activeDays: 1, written: 1, contextRead: 1,
  readWriteRatio: 1, cacheShare: 0, subagentCallShare: 0, subagentWrittenShare: 0,
  repoCount: 1, topThreeShare: 1, skillAttributedShare: 0, distinctSkills: 0,
  topSkills: [], topFourSkillShare: 0,
});

async function settings(contents: string | null): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'aw-'));
  const path = join(dir, 'settings.json');
  if (contents !== null) await writeFile(path, contents);
  return path;
}

test('a missing settings file means the default window is in force', async () => {
  const r = await detectRetention(await settings(null), stats('2026-07-16', '2026-08-24'));
  assert.equal(r.cleanupPeriodDays, null);
  assert.equal(r.atRisk, true);
});

test('reads an explicit cleanupPeriodDays and clears the warning', async () => {
  const r = await detectRetention(await settings('{"cleanupPeriodDays": 365}'), stats('2026-07-16', '2026-08-24'));
  assert.equal(r.cleanupPeriodDays, 365);
  assert.equal(r.atRisk, false);
});

test('malformed settings are treated as unset, not as a crash', async () => {
  const r = await detectRetention(await settings('{ broken'), stats('2026-07-16', '2026-08-24'));
  assert.equal(r.cleanupPeriodDays, null);
  assert.equal(r.atRisk, true);
});

test('computes the window in days, inclusive', async () => {
  const r = await detectRetention(await settings(null), stats('2026-08-01', '2026-08-10'));
  assert.equal(r.windowDays, 10);
});

test('a short window on an unconfigured install is not yet at risk', async () => {
  const r = await detectRetention(await settings(null), stats('2026-08-20', '2026-08-24'));
  assert.equal(r.atRisk, false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/retention.js'`

- [ ] **Step 3: Write `src/retention.ts`**

```typescript
import { readFile } from 'node:fs/promises';
import type { Retention, Stats } from './types.js';

/** Claude Code's default transcript retention, in days. */
const DEFAULT_RETENTION_DAYS = 30;

/** Below this, a short window means "new user", not "data being deleted". */
const RISK_THRESHOLD_DAYS = 25;

function daysBetween(firstDay: string, lastDay: string): number {
  if (!firstDay || !lastDay) return 0;
  const ms = Date.parse(lastDay) - Date.parse(firstDay);
  if (!Number.isFinite(ms)) return 0;
  return Math.round(ms / 86_400_000) + 1; // inclusive of both endpoints
}

/**
 * Decide whether the user is silently losing history.
 *
 * An absent or unparseable settings file means the default retention applies,
 * which is the common case and the whole reason this check exists.
 */
export async function detectRetention(settingsPath: string, stats: Stats): Promise<Retention> {
  let cleanupPeriodDays: number | null = null;
  try {
    const parsed = JSON.parse(await readFile(settingsPath, 'utf8'));
    const value = parsed?.cleanupPeriodDays;
    if (typeof value === 'number' && Number.isFinite(value)) cleanupPeriodDays = value;
  } catch {
    // absent or malformed: the default is in force
  }
  const windowDays = daysBetween(stats.firstDay, stats.lastDay);
  const unconfigured = cleanupPeriodDays === null || cleanupPeriodDays <= DEFAULT_RETENTION_DAYS;
  return {
    windowDays,
    cleanupPeriodDays,
    atRisk: unconfigured && windowDays >= RISK_THRESHOLD_DAYS,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS, 22 tests total

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: detect transcript retention risk"
```

---

### Task 5: Terminal renderer

**Files:**
- Create: `src/render-terminal.ts`
- Test: `test/render-terminal.test.ts`

**Interfaces:**
- Consumes: `Stats`, `Retention` from `src/types.js`
- Produces: `renderTerminal(stats: Stats, retention: Retention): string` and `pct(fraction: number): string` from `src/render-terminal.ts`

- [ ] **Step 1: Write the failing test `test/render-terminal.test.ts`**

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTerminal, pct } from '../src/render-terminal.js';
import type { Retention, Stats } from '../src/types.js';

const stats: Stats = {
  calls: 42362, firstDay: '2026-07-16', lastDay: '2026-08-24', activeDays: 31,
  written: 26174559, contextRead: 10437777367, readWriteRatio: 398.8,
  cacheShare: 0.982, subagentCallShare: 0.424, subagentWrittenShare: 0.061,
  repoCount: 19, topThreeShare: 0.59, skillAttributedShare: 0.27, distinctSkills: 40,
  topSkills: [
    { skill: 'superpowers:brainstorming', written: 1_100_000, share: 0.17 },
    { skill: 'superpowers:writing-plans', written: 1_000_000, share: 0.16 },
    { skill: 'superpowers:test-driven-development', written: 800_000, share: 0.12 },
    { skill: 'superpowers:subagent-driven-development', written: 600_000, share: 0.09 },
  ],
  topFourSkillShare: 0.54,
};

const safe: Retention = { windowDays: 39, cleanupPeriodDays: 365, atRisk: false };
const risky: Retention = { windowDays: 31, cleanupPeriodDays: null, atRisk: true };

test('leads with the read:write ratio', () => {
  const out = renderTerminal(stats, safe);
  assert.match(out, /399 : 1/);
  assert.match(out, /tokens read for every token written/);
});

test('states the denominator next to the skill percentages', () => {
  const out = renderTerminal(stats, safe);
  assert.match(out, /27% of all work/);
});

test('pairs subagent call share with subagent written share', () => {
  const out = renderTerminal(stats, safe);
  assert.match(out, /42%/);
  assert.match(out, /6%/);
});

test('shows the retention warning and the exact fix when at risk', () => {
  const out = renderTerminal(stats, risky);
  assert.match(out, /cleanupPeriodDays/);
  assert.match(out, /365/);
});

test('omits the retention warning when retention is configured', () => {
  const out = renderTerminal(stats, safe);
  assert.doesNotMatch(out, /cleanupPeriodDays/);
});

test('never renders a project name, only counts and shares', () => {
  const out = renderTerminal(stats, safe);
  assert.match(out, /3 of your 19 repos/);
});

test('contains no currency symbol anywhere', () => {
  assert.doesNotMatch(renderTerminal(stats, risky), /[$€£]/);
});

test('rounds percentages to whole numbers', () => {
  assert.equal(pct(0.982), '98%');
  assert.equal(pct(0.061), '6%');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/render-terminal.js'`

- [ ] **Step 3: Write `src/render-terminal.ts`**

```typescript
import type { Retention, Stats } from './types.js';

const BAR_WIDTH = 14;

export function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** Bar scaled against the largest skill so the top entry always fills the row. */
function bar(share: number, max: number): string {
  const filled = max === 0 ? 0 : Math.max(1, Math.round((share / max) * BAR_WIDTH));
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, BAR_WIDTH - filled));
}

function shortSkill(skill: string): string {
  return skill.includes(':') ? skill.slice(skill.indexOf(':') + 1) : skill;
}

export function renderTerminal(stats: Stats, retention: Retention): string {
  const lines: string[] = [];
  const header = `CLAUDE CODE · ${stats.activeDays} ACTIVE DAYS`;
  lines.push('');
  lines.push(`  ${header}${' '.repeat(Math.max(2, 58 - header.length))}${stats.firstDay} → ${stats.lastDay}`);
  lines.push('');
  lines.push(`         ${Math.round(stats.readWriteRatio)} : 1`);
  lines.push('         tokens read for every token written');
  lines.push('');
  lines.push(`  ${pct(stats.cacheShare).padStart(4)}   of what it read was cache — the same context, re-sent`);
  lines.push(`  ${pct(stats.subagentCallShare).padStart(4)}   of your calls were subagents…`);
  lines.push(`  ${pct(stats.subagentWrittenShare).padStart(4)}   …but they wrote only that share of the words`);
  lines.push(`  ${pct(stats.topThreeShare).padStart(4)}   of your writing went to 3 of your ${stats.repoCount} repos`);

  if (stats.topSkills.length > 0) {
    const max = stats.topSkills[0].share;
    lines.push('');
    lines.push(`  HOW YOU WORK   (% of words written inside a skill — ${pct(stats.skillAttributedShare)} of all work)`);
    for (const entry of stats.topSkills) {
      lines.push(`  ${bar(entry.share, max)}  ${pct(entry.share).padStart(3)}  ${shortSkill(entry.skill)}`);
    }
    lines.push(`  ${' '.repeat(BAR_WIDTH)}       …${stats.distinctSkills} skills used · top 4 = ${pct(stats.topFourSkillShare)} of skill work`);
  }

  if (retention.atRisk) {
    lines.push('');
    lines.push(`  ⚠  ${retention.windowDays} days of history. Claude Code deletes transcripts after`);
    lines.push('     ~30 days by default — you are losing this data right now.');
    lines.push('');
    lines.push('     Fix, in ~/.claude/settings.json:   "cleanupPeriodDays": 365');
    lines.push('');
    lines.push('     Run this again in a month and you will have something to compare.');
  }
  lines.push('');
  return lines.join('\n');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS, 30 tests total

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: render the terminal card"
```

---

### Task 6: CLI wiring and end-to-end run

**Files:**
- Create: `src/cli.ts`
- Test: `test/cli.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `discover`, `parseAll`, `computeStats`, `detectRetention`, `renderTerminal`
- Produces: `run(argv: string[], home: string): Promise<string>` from `src/cli.ts`

`run` takes `home` as a parameter rather than reading `os.homedir()` internally, so the end-to-end test points it at a fixture tree with no mocking and no environment variables.

- [ ] **Step 1: Write the failing test `test/cli.test.ts`**

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../src/cli.js';

async function home(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'aw-'));
  const project = join(root, '.claude', 'projects', '-Users-me-Projects-alpha');
  await mkdir(join(project, 'sess-1', 'subagents'), { recursive: true });
  const record = (id: string, extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      type: 'assistant',
      timestamp: '2026-08-01T10:00:00.000Z',
      message: { id, model: 'claude-opus-5', usage: { input_tokens: 0, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 900 } },
      ...extra,
    }) + '\n';
  await writeFile(join(project, 'sess-1.jsonl'), record('m1', { attributionSkill: 'brainstorming' }) + record('m1'));
  await writeFile(join(project, 'sess-1', 'subagents', 'agent-a.jsonl'), record('m2'));
  return root;
}

test('renders a card end to end from a transcript tree', async () => {
  const out = await run([], await home());
  assert.match(out, /tokens read for every token written/);
  assert.match(out, /9 : 1/); // 1800 context read over 200 written
});

test('--json emits machine-readable stats with no project names', async () => {
  const out = await run(['--json'], await home());
  const parsed = JSON.parse(out);
  assert.equal(parsed.stats.calls, 2);
  assert.equal(parsed.stats.repoCount, 1);
  assert.ok(!out.includes('alpha'), 'project names must never be emitted');
});

test('reports a clear message when there are no transcripts', async () => {
  const empty = await mkdtemp(join(tmpdir(), 'aw-'));
  const out = await run([], empty);
  assert.match(out, /No Claude Code transcripts found/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/cli.js'`

- [ ] **Step 3: Write `src/cli.ts`**

```typescript
#!/usr/bin/env node
import { homedir } from 'node:os';
import { join } from 'node:path';
import { discover } from './discover.js';
import { parseAll } from './parse.js';
import { computeStats } from './stats.js';
import { detectRetention } from './retention.js';
import { renderTerminal } from './render-terminal.js';

export async function run(argv: string[], home: string): Promise<string> {
  const files = await discover(join(home, '.claude', 'projects'));
  if (files.length === 0) {
    return 'No Claude Code transcripts found under ~/.claude/projects.\nNothing to read — and nothing was sent anywhere.';
  }
  const records = await parseAll(files);
  const stats = computeStats(records);
  const retention = await detectRetention(join(home, '.claude', 'settings.json'), stats);

  if (argv.includes('--json')) {
    // Project names are grouping keys only and must never be emitted.
    return JSON.stringify({ stats, retention }, null, 2);
  }
  return renderTerminal(stats, retention);
}

const invokedDirectly = process.argv[1]?.endsWith('cli.js');
if (invokedDirectly) {
  run(process.argv.slice(2), homedir())
    .then((output) => process.stdout.write(output + '\n'))
    .catch((error: unknown) => {
      process.stderr.write(`agent-wrapped failed: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS, 33 tests total

- [ ] **Step 5: Verify it runs against real data**

```bash
npm run build && node dist/cli.js
```

Expected: a rendered card. Confirm by eye that no project name and no currency symbol appears.

- [ ] **Step 6: Write `README.md`**

Cover, in this order: what it does; a one-line `npx agent-wrapped` quick start; **"Nothing leaves your machine"** with the three supporting facts (no network calls, zero dependencies, source is a few hundred lines); what each number means, including every denominator; the retention tip; and that it reads only `~/.claude/projects` and `~/.claude/settings.json`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: wire the CLI and document the tool"
```

---

### Task 7: HTML renderer behind `--html`

**Files:**
- Create: `src/render-html.ts`
- Modify: `src/cli.ts`
- Test: `test/render-html.test.ts`

**Interfaces:**
- Consumes: `Stats`, `Retention` from `src/types.js`; `pct` from `src/render-terminal.js`
- Produces: `renderHtml(stats: Stats, retention: Retention): string` from `src/render-html.ts`

- [ ] **Step 1: Write the failing test `test/render-html.test.ts`**

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderHtml } from '../src/render-html.js';
import type { Retention, Stats } from '../src/types.js';

const stats: Stats = {
  calls: 42362, firstDay: '2026-07-16', lastDay: '2026-08-24', activeDays: 31,
  written: 26174559, contextRead: 10437777367, readWriteRatio: 398.8,
  cacheShare: 0.982, subagentCallShare: 0.424, subagentWrittenShare: 0.061,
  repoCount: 19, topThreeShare: 0.59, skillAttributedShare: 0.27, distinctSkills: 40,
  topSkills: [{ skill: 'superpowers:brainstorming', written: 1_100_000, share: 0.17 }],
  topFourSkillShare: 0.54,
};
const retention: Retention = { windowDays: 31, cleanupPeriodDays: null, atRisk: true };

test('produces a self-contained page with no external requests', () => {
  const html = renderHtml(stats, retention);
  assert.match(html, /<!doctype html>/i);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.doesNotMatch(html, /<script\s+src=/i);
});

test('carries the headline ratio and the skill denominator', () => {
  const html = renderHtml(stats, retention);
  assert.match(html, /399/);
  assert.match(html, /27%/);
});

test('escapes skill names rather than interpolating them raw', () => {
  const hostile = { ...stats, topSkills: [{ skill: '<img onerror=x>', written: 1, share: 1 }] };
  assert.doesNotMatch(renderHtml(hostile, retention), /<img/);
});

test('contains no currency symbol', () => {
  assert.doesNotMatch(renderHtml(stats, retention), /[$€£]/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/render-html.js'`

- [ ] **Step 3: Write `src/render-html.ts`**

```typescript
import type { Retention, Stats } from './types.js';
import { pct } from './render-terminal.js';

/** Skill names come from disk and are interpolated into markup, so escape them. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function shortSkill(skill: string): string {
  return escapeHtml(skill.includes(':') ? skill.slice(skill.indexOf(':') + 1) : skill);
}

export function renderHtml(stats: Stats, retention: Retention): string {
  const rows = stats.topSkills
    .map(
      (s) => `<tr><td class="bar"><span style="width:${Math.round(s.share * 100)}%"></span></td>
      <td class="num">${pct(s.share)}</td><td>${shortSkill(s.skill)}</td></tr>`,
    )
    .join('\n');

  const warning = retention.atRisk
    ? `<p class="warn">⚠ ${retention.windowDays} days of history. Claude Code deletes transcripts after ~30 days.
       Set <code>"cleanupPeriodDays": 365</code> in <code>~/.claude/settings.json</code>.</p>`
    : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>agent-wrapped</title>
<style>
  :root { color-scheme: light dark; --fg:#111; --bg:#fff; --dim:#666; --accent:#c2410c; }
  @media (prefers-color-scheme: dark) { :root { --fg:#eee; --bg:#111; --dim:#999; --accent:#fb923c; } }
  body { background:var(--bg); color:var(--fg); font:16px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; margin:0; padding:3rem 1.5rem; }
  main { max-width:44rem; margin:0 auto; }
  .ratio { font-size:clamp(3rem,12vw,6rem); font-weight:700; letter-spacing:-.03em; margin:0; }
  .sub { color:var(--dim); margin:.25rem 0 2.5rem; }
  .stat { display:flex; gap:1rem; margin:.4rem 0; }
  .stat b { min-width:3.5rem; text-align:right; color:var(--accent); }
  h2 { font-size:.85rem; letter-spacing:.08em; text-transform:uppercase; color:var(--dim); margin:2.5rem 0 .75rem; font-weight:600; }
  table { width:100%; border-collapse:collapse; }
  td { padding:.2rem 0; vertical-align:middle; }
  td.bar { width:45%; } td.bar span { display:block; height:.6rem; background:var(--accent); border-radius:2px; }
  td.num { width:3.5rem; text-align:right; padding-right:.75rem; color:var(--dim); }
  .warn { border-left:3px solid var(--accent); padding-left:1rem; color:var(--dim); margin-top:2.5rem; }
  code { background:rgba(128,128,128,.15); padding:.1rem .3rem; border-radius:3px; }
</style></head>
<body><main>
  <p class="sub">CLAUDE CODE · ${stats.activeDays} ACTIVE DAYS · ${stats.firstDay} → ${stats.lastDay}</p>
  <p class="ratio">${Math.round(stats.readWriteRatio)} : 1</p>
  <p class="sub">tokens read for every token written</p>
  <div class="stat"><b>${pct(stats.cacheShare)}</b><span>of what it read was cache — the same context, re-sent</span></div>
  <div class="stat"><b>${pct(stats.subagentCallShare)}</b><span>of your calls were subagents…</span></div>
  <div class="stat"><b>${pct(stats.subagentWrittenShare)}</b><span>…but they wrote only that share of the words</span></div>
  <div class="stat"><b>${pct(stats.topThreeShare)}</b><span>of your writing went to 3 of your ${stats.repoCount} repos</span></div>
  <h2>How you work — % of words written inside a skill (${pct(stats.skillAttributedShare)} of all work)</h2>
  <table>${rows}</table>
  <p class="sub">${stats.distinctSkills} skills used · top 4 = ${pct(stats.topFourSkillShare)} of skill work</p>
  ${warning}
</main></body></html>`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS, 37 tests total

- [ ] **Step 5: Wire the flag into `src/cli.ts`**

Add the import beside the others:

```typescript
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { renderHtml } from './render-html.js';
```

Insert this branch immediately before the `--json` branch in `run`:

```typescript
  if (argv.includes('--html')) {
    const out = join(tmpdir(), 'agent-wrapped.html');
    await writeFile(out, renderHtml(stats, retention), 'utf8');
    return `Wrote ${out}\nOpen it with:  open ${out}`;
  }
```

- [ ] **Step 6: Run the full suite and a real render**

```bash
npm test && npm run build && node dist/cli.js --html
```

Expected: tests pass; the command prints a path; opening it shows the card in both light and dark mode.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add self-contained HTML renderer behind --html"
```

---

## Deferred to v2

Archetype scoring · percentiles and leaderboards · `--since` window filtering · comparison against previous runs · agents other than Claude Code · publishing to npm (needs a registry-name check first).
