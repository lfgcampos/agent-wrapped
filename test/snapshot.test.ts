import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSnapshot, computeDelta, loadPrevious, saveSnapshot, snapshotDir } from '../src/snapshot.js';
import type { Rhythm, Signals, Snapshot, Stats } from '../src/types.js';

const stats = (over: Partial<Stats> = {}): Stats => ({
  calls: 100, firstDay: '2026-08-01', lastDay: '2026-08-31', activeDays: 20, elapsedDays: 31,
  written: 1000, contextRead: 10000, readWriteRatio: 10, cacheShare: 0.9,
  subagentCallShare: 0.4, subagentWrittenShare: 0.06, repoCount: 3, topThreeShare: 0.9,
  topRepoShare: 0.5, skillAttributedShare: 0.2, distinctSkills: 2,
  topSkills: [{ skill: 'brainstorming', written: 10, share: 1 }], topFourSkillShare: 1, models: [], ...over,
});
const rhythm: Rhythm = { hours: new Array(24).fill(1), peakHour: 15, longestStretchMs: 4 * 3_600_000, weekendShare: 0.1, currentStreak: 3, longestStreak: 9 };
const signals: Signals = { toolCounts: { Bash: 10, Edit: 5 }, userMessages: 42, limitEvents: [], overloads: 2, sessionCalls: { a: 5 } };

test('snapshots are stored outside ~/.claude so its cleanup cannot delete them', () => {
  assert.ok(!snapshotDir('/home/me').includes('.claude'));
  assert.match(snapshotDir('/home/me'), /\.agent-wrapped/);
});

test('a snapshot is small enough that years of them are free', () => {
  const snap = buildSnapshot(stats(), rhythm, signals, '2026-08-31');
  assert.ok(JSON.stringify(snap).length < 4000, 'a snapshot must stay tiny');
  assert.equal(snap.topTool, 'Bash');
  assert.equal(snap.humanTurns, 42);
});

test('re-running on the same day overwrites instead of accumulating', async () => {
  const dir = join(await mkdtemp(join(tmpdir(), 'aw-')), 'snaps');
  const snap = buildSnapshot(stats(), rhythm, signals, '2026-08-31');
  const a = await saveSnapshot(dir, snap);
  const b = await saveSnapshot(dir, { ...snap, calls: 200 });
  assert.equal(a, b);
});

test('loadPrevious ignores todays snapshot and returns the most recent earlier one', async () => {
  const dir = join(await mkdtemp(join(tmpdir(), 'aw-')), 'snaps');
  await mkdir(dir, { recursive: true });
  const base = buildSnapshot(stats(), rhythm, signals, 'x');
  for (const d of ['2026-06-01', '2026-07-01', '2026-08-31']) {
    await writeFile(join(dir, `${d}.json`), JSON.stringify({ ...base, takenAt: d }));
  }
  const prev = await loadPrevious(dir, '2026-08-31');
  assert.equal(prev!.takenAt, '2026-07-01');
});

test('a corrupt snapshot is skipped, not fatal', async () => {
  const dir = join(await mkdtemp(join(tmpdir(), 'aw-')), 'snaps');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, '2026-07-01.json'), '{ broken');
  await writeFile(join(dir, '2026-06-01.json'), JSON.stringify(buildSnapshot(stats(), rhythm, signals, '2026-06-01')));
  const prev = await loadPrevious(dir, '2026-08-31');
  assert.equal(prev!.takenAt, '2026-06-01');
});

test('no snapshots at all is not an error', async () => {
  assert.equal(await loadPrevious('/nonexistent/path/xyz', '2026-08-31'), null);
});

test('detects history lost between runs', () => {
  const prev = { ...buildSnapshot(stats(), rhythm, signals, '2026-06-01'), lastDay: '2026-06-01' } as Snapshot;
  const d = computeDelta(prev, stats({ firstDay: '2026-07-15' }));
  assert.equal(d.gapDays, 43, 'retention deleted six weeks while the user was away');
});

test('continuous coverage reports no gap', () => {
  const prev = { ...buildSnapshot(stats(), rhythm, signals, '2026-07-31'), lastDay: '2026-07-31' } as Snapshot;
  const d = computeDelta(prev, stats({ firstDay: '2026-08-01' }));
  assert.equal(d.gapDays, 0);
});

test('a snapshot records the top model and the longest stretch', () => {
  const s = buildSnapshot(
    stats({ models: [{ model: 'Opus 5', written: 100, share: 1 }] }),
    rhythm,
    signals,
    '2026-09-01',
  );
  assert.equal(s.topModel, 'Opus 5');
  assert.equal(s.longestStretchMs, 4 * 3_600_000);
});

test('a snapshot with no models records no top model rather than an empty name', () => {
  assert.equal(buildSnapshot(stats(), rhythm, signals, '2026-09-01').topModel, null);
});

test('a snapshot written before these fields existed still loads', async () => {
  // The version must not be bumped for an additive field: loadPrevious rejects
  // anything that is not version 1, so bumping discards every stored snapshot.
  const dir = await mkdtemp(join(tmpdir(), 'aw-snap-'));
  const old = { ...buildSnapshot(stats(), rhythm, signals, '2026-08-01') } as Record<string, unknown>;
  delete old.topModel;
  delete old.longestStretchMs;
  await writeFile(join(dir, '2026-08-01.json'), JSON.stringify(old), 'utf8');
  const loaded = await loadPrevious(dir, '2026-09-01');
  assert.ok(loaded, 'an older snapshot is still readable');
  assert.equal(loaded.longestStretchMs, undefined);
});
