import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTerminal, pct } from '../src/render-terminal.js';
import type { Retention, Rhythm, Stats } from '../src/types.js';

const stats: Stats = {
  calls: 42362, firstDay: '2026-07-16', lastDay: '2026-08-24', activeDays: 31, elapsedDays: 40,
  written: 26174559, contextRead: 10437777367, readWriteRatio: 398.8,
  cacheShare: 0.982, subagentCallShare: 0.424, subagentWrittenShare: 0.061,
  repoCount: 19, topThreeShare: 0.59, topRepoShare: 0.24, skillAttributedShare: 0.27, distinctSkills: 40,
  topSkills: [
    { skill: 'superpowers:brainstorming', written: 1_100_000, share: 0.17 },
    { skill: 'superpowers:writing-plans', written: 1_000_000, share: 0.16 },
    { skill: 'superpowers:test-driven-development', written: 800_000, share: 0.12 },
    { skill: 'superpowers:subagent-driven-development', written: 600_000, share: 0.09 },
  ],
  topFourSkillShare: 0.54,
  models: [
    { model: 'Opus 5', written: 20_000_000, share: 0.764 },
    { model: 'Sonnet 4.5', written: 5_000_000, share: 0.191 },
    { model: 'Haiku 4.5', written: 1_174_559, share: 0.045 },
  ],
};

const safe: Retention = { windowDays: 39, cleanupPeriodDays: 365, atRisk: false, bytesOnDisk: 9e8, bytesPerDay: 2.6e7, suggestedDays: 60, suggestedBytes: 1.6e9, yearBytes: 9.7e9 };
const risky: Retention = { windowDays: 31, cleanupPeriodDays: null, atRisk: true, bytesOnDisk: 9e8, bytesPerDay: 2.6e7, suggestedDays: 60, suggestedBytes: 1.6e9, yearBytes: 9.7e9 };

test('leads with the read:write ratio', () => {
  const out = renderTerminal(stats, safe);
  assert.match(out, /399 : 1/);
  assert.match(out, /tokens read for every token written/);
});

test('states the denominator next to the skill percentages', () => {
  assert.match(renderTerminal(stats, safe), /27% of all work/);
});

test('pairs subagent call share with subagent written share', () => {
  const out = renderTerminal(stats, safe);
  assert.match(out, /42%/);
  assert.match(out, /6%/);
});

test('shows the retention warning with a size-aware horizon, not a hardcoded year', () => {
  const out = renderTerminal(stats, risky);
  assert.match(out, /cleanupPeriodDays": 60/, 'recommends the horizon that fits the disk budget');
  assert.match(out, /9\.7 GB/, 'shows what a full year would actually cost');
  assert.match(out, /26 MB\/day/, 'shows the measured growth rate');
});

test('omits the retention warning when retention is configured', () => {
  assert.doesNotMatch(renderTerminal(stats, safe), /cleanupPeriodDays/);
});

test('never renders a project name, only counts and shares', () => {
  assert.match(renderTerminal(stats, safe), /3 of your 19 repos/);
});

test('contains no currency symbol anywhere', () => {
  assert.doesNotMatch(renderTerminal(stats, risky), /[$€£]/);
});

test('rounds percentages to whole numbers', () => {
  assert.equal(pct(0.982), '98%');
  assert.equal(pct(0.061), '6%');
});

test('a delta leads with the current value, not the size of the change', () => {
  const previous = {
    version: 1 as const, takenAt: '2026-07-25', firstDay: '2026-06-25', lastDay: '2026-07-25',
    activeDays: 20, calls: 100, written: 15_200_000, readWriteRatio: 323, cacheShare: 0.9,
    subagentCallShare: 0.4, currentStreak: 9, longestStreak: 12, weekendShare: 0.1, peakHour: 15,
    humanTurns: 10, limitEvents: 0, overloads: 0, sessions: 5,
    topSkill: 'superpowers:writing-plans', topTool: 'Bash', toolCounts: { Bash: 1 },
  };
  const out = renderTerminal(stats, safe, undefined, undefined, { previous, gapDays: 0 });
  assert.match(out, /399 : 1\s+↑ from 323 : 1/, 'current value comes first');
  assert.doesNotMatch(out, /↑ 76 : 1/, 'must not lead with the delta size');
});

test('a gap between runs is reported as lost history', () => {
  const previous = {
    version: 1 as const, takenAt: '2026-05-01', firstDay: '2026-04-01', lastDay: '2026-05-01',
    activeDays: 20, calls: 100, written: 1, readWriteRatio: 100, cacheShare: 0.9,
    subagentCallShare: 0.4, currentStreak: 1, longestStreak: 2, weekendShare: 0.1, peakHour: 15,
    humanTurns: 10, limitEvents: 0, overloads: 0, sessions: 5,
    topSkill: null, topTool: 'Bash', toolCounts: { Bash: 1 },
  };
  const out = renderTerminal(stats, safe, undefined, undefined, { previous, gapDays: 43 });
  assert.match(out, /43 days of history were deleted/);
});

// Peak at 15:00 so the rendered "you work most at" claim has something to find.
const rhythm: Rhythm = {
  hours: new Array(24).fill(0).map((_, h) => (h === 15 ? 40 : 5)),
  peakHour: 15, weekendShare: 0.19, currentStreak: 4, longestStreak: 18,
  longestStretchMs: 4 * 3_600_000 + 12 * 60_000,
};

test('the header says how many of the elapsed days were worked, not just the count', () => {
  assert.match(renderTerminal(stats, safe), /31 OF 40 DAYS ACTIVE/);
});

test('names the model most writing came from, against the number of models used', () => {
  const out = renderTerminal(stats, safe);
  assert.match(out, /76%\s+of your writing came from Opus 5, of 3 models/);
});

test('a single-model user is not told about a choice they did not make', () => {
  const out = renderTerminal({ ...stats, models: [{ model: 'Opus 5', written: 100, share: 1 }] }, safe);
  assert.match(out, /the only model you used/);
  assert.doesNotMatch(out, /of 1 models/);
});

test('reports the longest unbroken stretch as a duration', () => {
  assert.match(renderTerminal(stats, safe, rhythm), /4h 12m at a stretch/);
});

test('says nothing about a stretch when there was never more than one call', () => {
  const out = renderTerminal(stats, safe, { ...rhythm, longestStretchMs: 0 });
  assert.doesNotMatch(out, /at a stretch/);
});

const priorSnapshot = {
  version: 1 as const, takenAt: '2026-07-25', firstDay: '2026-06-25', lastDay: '2026-07-25',
  activeDays: 20, calls: 100, written: 15_200_000, readWriteRatio: 323, cacheShare: 0.9,
  subagentCallShare: 0.4, currentStreak: 9, longestStreak: 12, weekendShare: 0.1, peakHour: 15,
  humanTurns: 10, limitEvents: 0, overloads: 0, sessions: 5,
  topSkill: 'superpowers:writing-plans', topTool: 'Bash', toolCounts: { Bash: 1 },
};

/** The delta panel only — "at a stretch" also appears up in the rhythm line. */
const deltaBlock = (out: string) => out.slice(out.indexOf('SINCE YOUR LAST SNAPSHOT'));

test('the delta names a change of top model and compares the stretch', () => {
  const previous = { ...priorSnapshot, topModel: 'Sonnet 4.5', longestStretchMs: 3 * 3_600_000 };
  const out = deltaBlock(renderTerminal(stats, safe, rhythm, undefined, { previous, gapDays: 0 }));
  assert.match(out, /top model\s+Sonnet 4\.5 → Opus 5/);
  assert.match(out, /stretch\s+4h 12m\s+↑ from 3h 0m/);
});

test('the delta omits rows an older snapshot has no value for', () => {
  const out = deltaBlock(renderTerminal(stats, safe, rhythm, undefined, { previous: priorSnapshot, gapDays: 0 }));
  assert.doesNotMatch(out, /top model/, 'no model row without a recorded model');
  assert.doesNotMatch(out, /stretch/, 'no stretch row without a recorded stretch');
});
