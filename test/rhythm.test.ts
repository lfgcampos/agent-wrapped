import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRhythm, toolShares, sessionStats } from '../src/rhythm.js';
import type { UsageRecord } from '../src/types.js';

const rec = (ts: string, over: Partial<UsageRecord> = {}): UsageRecord => ({
  id: ts + Math.random(), ts, model: 'claude-opus-5', input: 0, output: 100,
  cacheCreate: 0, cacheRead: 900, project: 'a', isSubagent: false, skill: null, ...over,
});

// Local noon avoids any timezone pushing a date across a boundary during tests.
const noon = (day: string) => `${day}T12:00:00.000`;

test('counts a run of consecutive days as the current streak', () => {
  const r = computeRhythm([rec(noon('2026-08-10')), rec(noon('2026-08-11')), rec(noon('2026-08-12'))], new Date('2026-08-12T12:00:00'));
  assert.equal(r.currentStreak, 3);
});

test('a gap breaks the streak', () => {
  const r = computeRhythm([rec(noon('2026-08-01')), rec(noon('2026-08-05')), rec(noon('2026-08-06'))], new Date('2026-08-06T12:00:00'));
  assert.equal(r.currentStreak, 2);
  assert.equal(r.longestStreak, 2);
});

test('remembers the longest streak even after it is broken', () => {
  const days = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-09'];
  const r = computeRhythm(days.map((d) => rec(noon(d))), new Date('2026-08-09T12:00:00'));
  assert.equal(r.longestStreak, 4);
  assert.equal(r.currentStreak, 1);
});

test('a stale streak is not current — last activity was weeks ago', () => {
  const r = computeRhythm([rec(noon('2026-07-01')), rec(noon('2026-07-02'))], new Date('2026-08-24T12:00:00'));
  assert.equal(r.currentStreak, 0);
  assert.equal(r.longestStreak, 2);
});

test('yesterday still counts as a live streak', () => {
  const r = computeRhythm([rec(noon('2026-08-23')), rec(noon('2026-08-24'))], new Date('2026-08-25T09:00:00'));
  assert.equal(r.currentStreak, 2);
});

test('weekend share is measured in tokens written', () => {
  // 2026-08-22 is a Saturday, 2026-08-24 a Monday.
  const r = computeRhythm([rec(noon('2026-08-22'), { output: 30 }), rec(noon('2026-08-24'), { output: 70 })], new Date('2026-08-24T12:00:00'));
  assert.equal(r.weekendShare, 0.3);
});

test('the hour histogram has 24 local buckets and finds the peak', () => {
  const r = computeRhythm([rec('2026-08-10T09:30:00.000'), rec('2026-08-10T09:45:00.000'), rec('2026-08-10T22:00:00.000')], new Date('2026-08-10T23:00:00'));
  assert.equal(r.hours.length, 24);
  assert.equal(r.hours[9], 2);
  assert.equal(r.peakHour, 9);
});

test('tool shares rank by call count and exclude nothing', () => {
  const shares = toolShares({ Bash: 62, Read: 14, Edit: 24 });
  assert.equal(shares[0]!.tool, 'Bash');
  assert.equal(shares[0]!.share, 0.62);
});

test('session stats report count, median and largest', () => {
  const s = sessionStats({ a: 10, b: 62, c: 2102 });
  assert.equal(s.count, 3);
  assert.equal(s.median, 62);
  assert.equal(s.largest, 2102);
});

test('empty input never yields NaN', () => {
  const r = computeRhythm([], new Date('2026-08-24T12:00:00'));
  assert.equal(r.currentStreak, 0);
  assert.equal(r.weekendShare, 0);
  assert.equal(sessionStats({}).median, 0);
});

test('calls with no long pause between them are a single stretch', () => {
  const r = computeRhythm([
    rec('2026-08-10T09:00:00.000'),
    rec('2026-08-10T09:10:00.000'),
    rec('2026-08-10T09:25:00.000'),
  ]);
  assert.equal(r.longestStretchMs, 25 * 60_000);
});

test('a pause longer than the idle threshold ends the stretch', () => {
  const r = computeRhythm([
    rec('2026-08-10T09:00:00.000'),
    rec('2026-08-10T09:10:00.000'),
    rec('2026-08-10T10:00:00.000'),
    rec('2026-08-10T10:05:00.000'),
  ]);
  assert.equal(r.longestStretchMs, 10 * 60_000);
});

test('a pause of exactly the idle threshold is still the same stretch', () => {
  const held = computeRhythm([rec('2026-08-10T09:00:00.000'), rec('2026-08-10T09:30:00.000')]);
  assert.equal(held.longestStretchMs, 30 * 60_000);
  const broken = computeRhythm([rec('2026-08-10T09:00:00.000'), rec('2026-08-10T09:30:00.001')]);
  assert.equal(broken.longestStretchMs, 0);
});

test('a lone call is a stretch of no duration, not a stretch of one call', () => {
  assert.equal(computeRhythm([rec('2026-08-10T09:00:00.000')]).longestStretchMs, 0);
});

test('the stretch is found regardless of the order records arrive in', () => {
  const r = computeRhythm([
    rec('2026-08-10T09:25:00.000'),
    rec('2026-08-10T09:00:00.000'),
    rec('2026-08-10T09:10:00.000'),
  ]);
  assert.equal(r.longestStretchMs, 25 * 60_000);
});

test('records with unusable timestamps do not join a stretch', () => {
  const r = computeRhythm([
    rec('2026-08-10T09:00:00.000'),
    rec(''),
    rec('not a date'),
    rec('2026-08-10T09:10:00.000'),
  ]);
  assert.equal(r.longestStretchMs, 10 * 60_000);
});

test('tools with equal call counts are ordered by name, not by insertion order', () => {
  // Insertion order below is the reverse of alphabetical, so a stable sort that
  // ignored the name would preserve it and fail this. Insertion order comes
  // from discover()'s readdir walk, which is a fact about the filesystem
  // rather than about the user's work.
  const order = toolShares({ Write: 2, Read: 2, Edit: 2 }).map((s) => s.tool);
  assert.deepEqual(order, ['Edit', 'Read', 'Write']);
});

test('a tie-break never outranks a real difference in call count', () => {
  const order = toolShares({ Zed: 9, Alpha: 1 }).map((s) => s.tool);
  assert.deepEqual(order, ['Zed', 'Alpha']);
});
