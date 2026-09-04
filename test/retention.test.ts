import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectPruning } from '../src/sources/claude-code/pruning.js';
import { computeDisk } from '../src/disk.js';
import type { Stats } from '../src/types.js';

const stats = (firstDay: string, lastDay: string): Stats => ({
  calls: 1, firstDay, lastDay, activeDays: 1,
  // Derived rather than hardcoded: detectPruning reads the span from here.
  elapsedDays: Math.round((Date.parse(lastDay) - Date.parse(firstDay)) / 86_400_000) + 1, written: 1, contextRead: 1,
  readWriteRatio: 1, cacheShare: 0, subagentCallShare: 0, subagentWrittenShare: 0,
  repoCount: 1, topThreeShare: 1, topRepoShare: 1, skillAttributedShare: 0, distinctSkills: 0,
  topSkills: [], topFourSkillShare: 0, models: [],
});

async function settings(contents: string | null): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'aw-'));
  const path = join(dir, 'settings.json');
  if (contents !== null) await writeFile(path, contents);
  return path;
}

test('a missing settings file means the default window is in force', async () => {
  const s = stats('2026-07-16', '2026-08-24');
  const r = await detectPruning(await settings(null), s, computeDisk([], s));
  assert.ok(r);
  assert.equal(r.cleanupPeriodDays, null);
  assert.equal(r.atRisk, true);
});

test('reads an explicit cleanupPeriodDays and clears the warning', async () => {
  const s = stats('2026-07-16', '2026-08-24');
  const r = await detectPruning(await settings('{"cleanupPeriodDays": 365}'), s, computeDisk([], s));
  assert.ok(r);
  assert.equal(r.cleanupPeriodDays, 365);
  assert.equal(r.atRisk, false);
});

test('malformed settings are treated as unset, not as a crash', async () => {
  const s = stats('2026-07-16', '2026-08-24');
  const r = await detectPruning(await settings('{ broken'), s, computeDisk([], s));
  assert.ok(r);
  assert.equal(r.cleanupPeriodDays, null);
  assert.equal(r.atRisk, true);
});

test('the disk figures come from the files, not from the settings file', async () => {
  const s = stats('2026-08-01', '2026-08-10');
  const disk = computeDisk([{ path: '/a', size: 500, mtime: 0, project: 'a', fromSubagentDir: false }], s);
  const r = await detectPruning(await settings(null), s, disk);
  assert.ok(r);
  assert.equal(r.yearBytes, disk.bytesPerDay * 365);
});

test('a short window on an unconfigured install is not yet at risk', async () => {
  const s = stats('2026-08-20', '2026-08-24');
  const r = await detectPruning(await settings(null), s, computeDisk([], s));
  assert.ok(r);
  assert.equal(r.atRisk, false);
});

const files = (size: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({
    path: `/tmp/f${i}.jsonl`, size, mtime: 0, project: 'a', fromSubagentDir: false,
  }));

test('a heavy user is not told to keep a year — 27 MB/day is ~10 GB', async () => {
  const s = { ...stats('2026-07-16', '2026-08-24'), activeDays: 30 };
  const disk = computeDisk(files(27_000_000, 30), s);
  const r = await detectPruning(await settings(null), s, disk);
  assert.ok(r);
  assert.equal(r.suggestedDays, 60, 'a year would blow the disk budget');
  assert.ok(r.yearBytes > 9e9, 'the year projection is surfaced so the user can overrule');
});

test('a light user is safely told to keep a year', async () => {
  const s = { ...stats('2026-07-16', '2026-08-24'), activeDays: 30 };
  const disk = computeDisk(files(1_000_000, 30), s);
  const r = await detectPruning(await settings(null), s, disk);
  assert.ok(r);
  assert.equal(r.suggestedDays, 365);
});

test('no files means no division by zero', async () => {
  const s = stats('2026-07-16', '2026-08-24');
  const disk = computeDisk([], s);
  const r = await detectPruning(await settings(null), s, disk);
  assert.ok(r);
  assert.equal(disk.bytesPerDay, 0);
  assert.equal(r.suggestedDays, 365);
});
