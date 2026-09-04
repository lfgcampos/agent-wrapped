import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { analyseSource } from '../src/pipeline.js';
import { claudeCode } from '../src/sources/claude-code/index.js';
import { localDay } from '../src/stats.js';
import type { Source } from '../src/sources/types.js';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixtureHome = join(repo, 'test', 'fixtures', 'claude-code');
const NOW = new Date('2026-08-04T12:00:00.000');

/** One transcript file that exists but holds no usable usage record. */
async function noRecordsFixture(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'aw-no-records-'));
  const project = join(home, '.claude', 'projects', '-Users-me-p');
  await mkdir(project, { recursive: true });
  await writeFile(join(project, 's.jsonl'), '{"type":"user","message":{}}\n');
  return home;
}

/**
 * Replaces the global `Date` constructor for the duration of `fn` so that each
 * successive *no-argument* `new Date()` call returns the next instant from
 * `instants` (the last one repeats once exhausted), while `new Date(arg)` —
 * used everywhere to parse an ISO string or a timestamp — is untouched.
 *
 * This is how the clock-unification bug is pinned deterministically: rather
 * than racing a real timer against a real await (flaky, and only reproduces
 * the bug if the timing happens to straddle a real midnight), this forces the
 * *n*-th bare `new Date()` call anywhere in the pipeline to return a chosen
 * instant, so two separate "default to now" reads can be made to land on
 * different days on every run, not just the unlucky one.
 */
async function withMockedClock<T>(instants: number[], fn: () => Promise<T>): Promise<T> {
  const RealDate = globalThis.Date;
  let calls = 0;
  function FakeDate(...args: unknown[]): Date {
    if (args.length === 0) {
      return new RealDate(instants[Math.min(calls++, instants.length - 1)]!);
    }
    return new (RealDate as unknown as new (...a: unknown[]) => Date)(...args);
  }
  // Static methods (Date.now, Date.parse, Date.UTC — computeStats and rhythm
  // use Date.parse) live on the real constructor; fall back to it for anything
  // this stand-in does not define itself.
  Object.setPrototypeOf(FakeDate, RealDate);
  FakeDate.prototype = RealDate.prototype;
  (globalThis as unknown as { Date: unknown }).Date = FakeDate;
  try {
    return await fn();
  } finally {
    (globalThis as unknown as { Date: unknown }).Date = RealDate;
  }
}

test('analysing a source produces stats, rhythm and disk together', async () => {
  const outcome = await analyseSource(claudeCode, fixtureHome, { since: null, save: false, now: NOW });
  if (!outcome.ok) throw new Error('expected a successful outcome');
  const r = outcome.result;
  assert.equal(r.id, 'claude-code');
  assert.equal(r.label, 'Claude Code');
  assert.equal(r.stats.calls, 5);
  assert.ok(r.disk.bytesOnDisk > 0, 'disk figures come from the discovered files');
  assert.ok(r.pruning, 'Claude Code supplies pruning advice');
});

test('a source that is not installed yields nothing rather than an empty card', async () => {
  const empty = await mkdtemp(join(tmpdir(), 'aw-none-'));
  const outcome = await analyseSource(claudeCode, empty, { since: null, save: false, now: NOW });
  if (outcome.ok) throw new Error('expected a failure outcome');
  assert.equal(outcome.reason, 'not-installed');
});

test('a window with no activity in it reports the cutoff, not "not found"', async () => {
  // A bare null could not distinguish this from "not installed" — and forty
  // transcripts sitting on disk outside the window is not the same fact as
  // no transcripts existing at all.
  const since = new Date('2026-09-01T00:00:00.000');
  const outcome = await analyseSource(claudeCode, fixtureHome, { since, save: false, now: NOW });
  if (outcome.ok) throw new Error('expected a failure outcome');
  assert.equal(outcome.reason, 'empty-window');
  if (outcome.reason !== 'empty-window') throw new Error('unreachable');
  assert.equal(outcome.cutoff, localDay(since.toISOString()));
});

test('files that hold no usable records report no-records with the file count', async () => {
  const home = await noRecordsFixture();
  const outcome = await analyseSource(claudeCode, home, { since: null, save: false, now: NOW });
  if (outcome.ok) throw new Error('expected a failure outcome');
  assert.equal(outcome.reason, 'no-records');
  if (outcome.reason !== 'no-records') throw new Error('unreachable');
  assert.equal(outcome.files, 1);
});

test('a source that throws during parsing does not take the run down', async () => {
  // One agent reorganising its directory must not break the whole card.
  const broken = { ...claudeCode, parse: async () => { throw new Error('schema drift'); } };
  const outcome = await analyseSource(broken, fixtureHome, { since: null, save: false, now: NOW });
  if (outcome.ok) throw new Error('expected a failure outcome');
  assert.equal(outcome.reason, 'failed');
});

test('save: false writes no snapshot', async () => {
  const outcome = await analyseSource(claudeCode, fixtureHome, { since: null, save: false, now: NOW });
  if (!outcome.ok) throw new Error('expected a successful outcome');
  assert.equal(outcome.result.savedTo, null);
});

test('with no now supplied, the streak and the snapshot key still derive from one instant', async () => {
  // opts.now is deliberately omitted — the bug is invisible whenever a caller
  // supplies it, which is exactly why every other test in this file (and the
  // ones written before it) missed it. computeRhythm's default-to-now read
  // and todayStamp's default-to-now read happen on either side of the
  // `await source.pruning(...)` call inside analyseSource; withMockedClock
  // forces those two reads to land on different days on every run, the same
  // way a real run whose pruning I/O straddles local midnight would.
  const instantA = new Date('2026-08-15T12:00:00.000').getTime();
  const instantB = instantA + 86_400_000; // exactly one day later
  const dayOfA = localDay(new Date(instantA).toISOString());
  const dayOfB = localDay(new Date(instantB).toISOString());
  assert.notEqual(dayOfA, dayOfB, 'the two mocked instants must actually fall on different local days');

  const fakeClockSource: Source = {
    id: 'fake-clock',
    label: 'Fake Clock',
    unsupported: [],
    root: () => '/fake',
    notInstalled: 'No Fake Clock history found.',
    async discover() {
      return [{ path: 'f.jsonl', size: 10, mtime: Date.now(), project: 'p', fromSubagentDir: false }];
    },
    async parse() {
      return {
        records: [{
          id: '1', ts: new Date(instantA - 3_600_000).toISOString(), model: 'claude-opus-5',
          input: 1, output: 1, cacheCreate: 0, cacheRead: 0, project: 'p', isSubagent: false, skill: null,
        }],
        signals: { toolCounts: {}, userMessages: 0, limitEvents: [], overloads: 0, sessionCalls: {} },
      };
    },
    // Merely being present inserts a real await between the two clock reads,
    // matching the shape of the production bug — no artificial delay needed,
    // since withMockedClock pins the two reads regardless of real elapsed time.
    async pruning() {
      return null;
    },
  };

  const home = await mkdtemp(join(tmpdir(), 'aw-clock-'));
  await withMockedClock([instantA, instantB], async () => {
    const outcome = await analyseSource(fakeClockSource, home, { since: null, save: true, now: undefined });
    if (!outcome.ok) throw new Error(`expected a successful outcome, got reason: ${outcome.reason}`);
    assert.ok(outcome.result.savedTo, 'expected a snapshot to be written');
    const saved = JSON.parse(await readFile(outcome.result.savedTo!, 'utf8'));
    // Before the fix, todayStamp's own default fires on the second mocked
    // instant (dayOfB) because computeRhythm's default already consumed the
    // first (dayOfA) — so this assertion fails on the old code and passes
    // only once both reads are pinned to the one captured `now`.
    assert.equal(saved.takenAt, dayOfA, 'the snapshot key must match the instant rhythm used, not a later, separate clock read');
  });
});
