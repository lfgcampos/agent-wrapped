import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderHtml } from '../src/render-html.js';
import type { Retention, Stats } from '../src/types.js';

const stats: Stats = {
  calls: 42362, firstDay: '2026-07-16', lastDay: '2026-08-24', activeDays: 31,
  written: 26174559, contextRead: 10437777367, readWriteRatio: 398.8,
  cacheShare: 0.982, subagentCallShare: 0.424, subagentWrittenShare: 0.061,
  repoCount: 19, topThreeShare: 0.59, topRepoShare: 0.24, skillAttributedShare: 0.27, distinctSkills: 40,
  topSkills: [{ skill: 'superpowers:brainstorming', written: 1_100_000, share: 0.17 }],
  topFourSkillShare: 0.54,
};
const retention: Retention = { windowDays: 31, cleanupPeriodDays: null, atRisk: true, bytesOnDisk: 9e8, bytesPerDay: 2.6e7, suggestedDays: 60, suggestedBytes: 1.6e9, yearBytes: 9.7e9 };

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
