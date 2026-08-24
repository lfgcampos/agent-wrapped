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
  assert.match(renderTerminal(stats, safe), /27% of all work/);
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
