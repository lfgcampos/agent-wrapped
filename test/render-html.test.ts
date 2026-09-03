import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderHtml } from '../src/render-html.js';
import type { Retention, Rhythm, Stats } from '../src/types.js';

const stats: Stats = {
  calls: 42362, firstDay: '2026-07-16', lastDay: '2026-08-24', activeDays: 31, elapsedDays: 40,
  written: 26174559, contextRead: 10437777367, readWriteRatio: 398.8,
  cacheShare: 0.982, subagentCallShare: 0.424, subagentWrittenShare: 0.061,
  repoCount: 19, topThreeShare: 0.59, topRepoShare: 0.24, skillAttributedShare: 0.27, distinctSkills: 40,
  topSkills: [{ skill: 'superpowers:brainstorming', written: 1_100_000, share: 0.17 }],
  topFourSkillShare: 0.54,
  models: [
    { model: 'Opus 5', written: 20_000_000, share: 0.764 },
    { model: 'Sonnet 4.5', written: 5_000_000, share: 0.191 },
    { model: 'Haiku 4.5', written: 1_174_559, share: 0.045 },
  ],
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

test('the share card can be exported without a network call', () => {
  const html = renderHtml(stats, retention);
  assert.match(html, /id="sheet"/, 'a canvas is present');
  assert.match(html, /toBlob/, 'the image is produced in-page');
  assert.match(html, /createObjectURL/, 'saved via a local object URL');
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|WebSocket|navigator\.sendBeacon/, 'must not send anything');
});

test('the share payload carries aggregates only — never a project name', () => {
  const html = renderHtml(stats, retention);
  const payload = html.match(/const d = (\{.*?\});/s)![1]!;
  const parsed = JSON.parse(payload);
  assert.deepEqual(
    Object.keys(parsed).sort(),
    ['cache', 'days', 'from', 'ratio', 'subCalls', 'subWords', 'to'].sort(),
  );
  for (const v of Object.values(parsed)) {
    assert.doesNotMatch(String(v), /\/|Users|Projects/, 'no path-like value may cross into the page');
  }
});

const rhythm: Rhythm = {
  hours: new Array(24).fill(5), peakHour: 15, weekendShare: 0.19,
  currentStreak: 4, longestStreak: 18, longestStretchMs: 4 * 3_600_000 + 12 * 60_000,
};

test('the header says how many of the elapsed days were worked', () => {
  assert.match(renderHtml(stats, retention), /31 OF 40 DAYS ACTIVE/);
});

test('names the model most writing came from, against the number of models used', () => {
  assert.match(renderHtml(stats, retention), /came from Opus 5, of 3 models/);
});

test('a single-model user is not told about a choice they did not make', () => {
  const one = { ...stats, models: [{ model: 'Opus 5', written: 100, share: 1 }] };
  assert.match(renderHtml(one, retention), /the only model you used/);
});

test('escapes a model name rather than interpolating it raw', () => {
  // displayModel returns an id it cannot parse untouched, so a hostile id
  // reaches the page verbatim unless this escapes — same risk as skill names.
  const hostile = { ...stats, models: [{ model: '<img onerror=x>', written: 1, share: 1 }] };
  assert.doesNotMatch(renderHtml(hostile, retention), /<img/);
});

test('reports the longest unbroken stretch as a duration', () => {
  assert.match(renderHtml(stats, retention, rhythm), /4h 12m at a stretch/);
});
