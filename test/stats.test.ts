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
});

test('single-repo users get a top-repo share rather than nonsense about three repos', () => {
  const s = computeStats([rec({ project: 'only', output: 100 })]);
  assert.equal(s.repoCount, 1);
  assert.equal(s.topRepoShare, 1);
});
