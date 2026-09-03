import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats, displayModel } from '../src/stats.js';
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
  assert.equal(s.topSkills[0]!.skill, 'a');
  assert.equal(s.topSkills[0]!.share, 0.75);
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
  // Local times, no trailing Z: days are computed in the viewer's timezone, so a
  // UTC instant can legitimately fall on a different local day (18:00Z on Jul 16
  // is Jul 17 in Auckland). Asserting on UTC instants would test the timezone,
  // not the aggregation.
  const s = computeStats([
    rec({ ts: '2026-07-16T10:00:00.000' }),
    rec({ ts: '2026-07-16T18:00:00.000' }),
    rec({ ts: '2026-08-24T09:00:00.000' }),
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
  assert.equal(s.models.length, 0);
  assert.equal(s.elapsedDays, 0);
});

test('single-repo users get a top-repo share rather than nonsense about three repos', () => {
  const s = computeStats([rec({ project: 'only', output: 100 })]);
  assert.equal(s.repoCount, 1);
  assert.equal(s.topRepoShare, 1);
});

// Model ids arrive in two naming eras that order family and version oppositely
// (claude-3-5-haiku-... against claude-haiku-4-5-...), so these assert on both.
test('drops the release date from a model id', () => {
  assert.equal(displayModel('claude-sonnet-4-5-20250929'), 'Sonnet 4.5');
});

test('merges context-window tiers into a single model', () => {
  assert.equal(displayModel('claude-opus-5[1m]'), 'Opus 5');
  assert.equal(displayModel('claude-opus-5'), 'Opus 5');
});

test('reads the old naming order, where the version came before the family', () => {
  assert.equal(displayModel('claude-3-5-haiku-20241022'), 'Haiku 3.5');
  assert.equal(displayModel('claude-3-opus-20240229'), 'Opus 3');
});

test('names a family it has never seen rather than giving up on it', () => {
  assert.equal(displayModel('claude-fable-5-1'), 'Fable 5.1');
});

test('returns an unrecognisable id unchanged rather than inventing a name', () => {
  assert.equal(displayModel('some-local-model'), 'some-local-model');
  assert.equal(displayModel(''), '');
});

test('strips the vendor prefix and version suffix Bedrock and Vertex add', () => {
  assert.equal(displayModel('us.anthropic.claude-opus-4-5-20251101-v1:0'), 'Opus 4.5');
});

test('model shares are weighted by tokens written, over all writing', () => {
  const s = computeStats([
    rec({ model: 'claude-opus-5', output: 60 }),
    rec({ model: 'claude-sonnet-4-5-20250929', output: 30 }),
    rec({ model: 'claude-haiku-4-5-20251001', output: 10 }),
  ]);
  assert.equal(s.models.length, 3);
  assert.equal(s.models[0]!.model, 'Opus 5');
  assert.equal(s.models[0]!.share, 0.6);
  assert.equal(s.models[2]!.model, 'Haiku 4.5');
});

test('one model on two context tiers is one share, not two', () => {
  const s = computeStats([
    rec({ model: 'claude-opus-5', output: 50 }),
    rec({ model: 'claude-opus-5[1m]', output: 50 }),
  ]);
  assert.equal(s.models.length, 1);
  assert.equal(s.models[0]!.share, 1);
});

test('a model that wrote nothing still counts as a model that was used', () => {
  // Ranked last rather than dropped: it was reached for, and the count says so.
  const s = computeStats([
    rec({ model: 'claude-opus-5', output: 100 }),
    rec({ model: 'claude-haiku-4-5-20251001', output: 0 }),
  ]);
  assert.equal(s.models.length, 2);
  assert.equal(s.models[1]!.share, 0);
});

test('elapsed days spans first to last inclusive, so one day of work is one day', () => {
  const s = computeStats([rec({ ts: '2026-08-01T10:00:00.000' })]);
  assert.equal(s.activeDays, 1);
  assert.equal(s.elapsedDays, 1);
});

test('elapsed days counts the days worked through, not the days worked on', () => {
  const s = computeStats([
    rec({ ts: '2026-07-16T10:00:00.000' }),
    rec({ ts: '2026-08-24T09:00:00.000' }),
  ]);
  assert.equal(s.activeDays, 2);
  assert.equal(s.elapsedDays, 40);
  assert.ok(s.activeDays <= s.elapsedDays);
});

test('empty input has no elapsed days rather than one', () => {
  assert.equal(computeStats([]).elapsedDays, 0);
});
