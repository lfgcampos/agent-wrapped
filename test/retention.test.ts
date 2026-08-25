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
  repoCount: 1, topThreeShare: 1, topRepoShare: 1, skillAttributedShare: 0, distinctSkills: 0,
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

const files = (size: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({
    path: `/tmp/f${i}.jsonl`, size, mtime: 0, project: 'a', fromSubagentDir: false,
  }));

test('a heavy user is not told to keep a year — 27 MB/day is ~10 GB', async () => {
  const s = { ...stats('2026-07-16', '2026-08-24'), activeDays: 30 };
  const r = await detectRetention(await settings(null), s, files(27_000_000, 30));
  assert.equal(r.suggestedDays, 60, 'a year would blow the disk budget');
  assert.ok(r.yearBytes > 9e9, 'the year projection is surfaced so the user can overrule');
});

test('a light user is safely told to keep a year', async () => {
  const s = { ...stats('2026-07-16', '2026-08-24'), activeDays: 30 };
  const r = await detectRetention(await settings(null), s, files(1_000_000, 30));
  assert.equal(r.suggestedDays, 365);
});

test('no files means no division by zero', async () => {
  const r = await detectRetention(await settings(null), stats('2026-07-16', '2026-08-24'), []);
  assert.equal(r.bytesPerDay, 0);
  assert.equal(r.suggestedDays, 365);
});
