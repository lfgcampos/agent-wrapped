import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderHtml } from '../src/render-html.js';
import { pct } from '../src/render-terminal.js';
import type { SourceResult } from '../src/pipeline.js';
import type { Disk, Pruning, Rhythm, Signals, Stats } from '../src/types.js';

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
const disk: Disk = { bytesOnDisk: 9e8, bytesPerDay: 2.6e7 };
const pruning: Pruning = { cleanupPeriodDays: null, atRisk: true, suggestedDays: 60, suggestedBytes: 1.6e9, yearBytes: 9.7e9 };

const rhythm: Rhythm = {
  hours: new Array(24).fill(5), peakHour: 15, weekendShare: 0.19,
  currentStreak: 4, longestStreak: 18, longestStretchMs: 4 * 3_600_000 + 12 * 60_000,
};

const signals: Signals = { toolCounts: {}, userMessages: 0, limitEvents: [], overloads: 0, sessionCalls: {} };

const result = (over: Partial<SourceResult> = {}): SourceResult => ({
  id: 'claude-code', label: 'Claude Code', unsupported: [],
  stats, rhythm, signals, disk, pruning,
  previous: null, delta: null, savedTo: null, ...over,
});

test('produces a self-contained page with no external requests', () => {
  const html = renderHtml([result()]);
  assert.match(html, /<!doctype html>/i);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.doesNotMatch(html, /<script\s+src=/i);
});

test('carries the headline ratio and the skill denominator', () => {
  const html = renderHtml([result()]);
  assert.match(html, /399/);
  assert.match(html, /27%/);
});

test('escapes skill names rather than interpolating them raw', () => {
  const hostile = { ...stats, topSkills: [{ skill: '<img onerror=x>', written: 1, share: 1 }] };
  assert.doesNotMatch(renderHtml([result({ stats: hostile })]), /<img/);
});

test('escapes a hostile source label rather than interpolating it raw', () => {
  // label now reaches the page from a Source implementation, same as skill
  // and model names do from disk — same escaping risk, so the same test.
  //
  // Case-insensitive on purpose: the header runs label.toUpperCase() before
  // escapeHtml(), so a case-sensitive /<img/ would match the *escaped*
  // output's uppercased-but-still-unescaped mutation just as readily as an
  // unescaped one — i.e. it would pass even with escaping removed, proving
  // nothing. Verified by mutation: stripping escapeHtml() from the header
  // makes this fail; skill and model names have no such transform ahead of
  // their escaping, so /<img/ stays case-sensitive-correct for those.
  const hostile = result({ label: '<img src=x onerror=alert(1)>' });
  assert.doesNotMatch(renderHtml([hostile]), /<img/i);
});

test('escapes a tool name rather than interpolating it raw', () => {
  // The fourth hostile-value test, after skill, model and label. Tool names
  // reach the page the same way skill names do: parse.ts takes `block.name`
  // off a transcript line verbatim (only an `mcp__` prefix is collapsed, to
  // "MCP tool"), so a hostile name is interpolated into the table unless
  // escapeHtml catches it.
  //
  // Case-sensitive on purpose, unlike the label test: nothing transforms the
  // name between parse and escapeHtml — no toUpperCase as the header has — so
  // an unescaped `<img` reaches the page as `<img` and this matches it, while
  // the escaped `&lt;img` does not. Verified by mutation: dropping
  // escapeHtml() from the tool row makes this fail.
  const hostile: Signals = { ...signals, toolCounts: { '<img onerror=x>': 3 } };
  assert.doesNotMatch(renderHtml([result({ signals: hostile })]), /<img/);
});

test('contains no currency symbol', () => {
  assert.doesNotMatch(renderHtml([result()]), /[$€£]/);
});

test('the share card can be exported without a network call', () => {
  const html = renderHtml([result()]);
  assert.match(html, /id="sheet"/, 'a canvas is present');
  assert.match(html, /toBlob/, 'the image is produced in-page');
  assert.match(html, /createObjectURL/, 'saved via a local object URL');
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|WebSocket|navigator\.sendBeacon/, 'must not send anything');
});

test('the share payload carries aggregates only — never a project name', () => {
  const html = renderHtml([result()]);
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

test('a fully-supporting source still draws every share fact — no regression from the null gating', () => {
  const html = renderHtml([result()]);
  const payload = html.match(/const d = (\{.*?\});/s)![1]!;
  const parsed = JSON.parse(payload);
  assert.equal(parsed.cache, pct(stats.cacheShare));
  assert.equal(parsed.subCalls, pct(stats.subagentCallShare));
  assert.equal(parsed.subWords, pct(stats.subagentWrittenShare));
});

test('a source that cannot know cache or subagent share never lets a computed number reach the share image', () => {
  // stats.cacheShare/subagentCallShare/subagentWrittenShare are all non-zero
  // here on purpose: this proves the payload is gated on the source's
  // declared `unsupported` list, not on whether the number happens to be
  // zero. Before this fix, this source would have put pct(0.982) — "98%" —
  // into the payload, which is a wrong number, not a missing one.
  const html = renderHtml([result({ unsupported: ['cache', 'subagents'] })]);
  const payload = html.match(/const d = (\{.*?\});/s)![1]!;
  const parsed = JSON.parse(payload);
  assert.equal(parsed.cache, null, 'cache is declared unsupported by this source');
  assert.equal(parsed.subCalls, null, 'subagents is declared unsupported by this source');
  assert.equal(parsed.subWords, null, 'subagents is declared unsupported by this source');
  assert.equal(parsed.ratio, Math.round(stats.readWriteRatio), 'fields every source can supply are untouched');
  assert.doesNotMatch(payload, /"cache":"\d+%"|"subCalls":"\d+%"|"subWords":"\d+%"/, 'no percentage for an unsupported field ever reaches the page');
  // The drawing code must skip a null fact rather than draw it — this is
  // the guard that keeps the gap from opening in the first place.
  assert.match(html, /if \(d\.cache !== null\) facts\.push/, 'the canvas skips a null cache fact rather than drawing it');
  assert.match(html, /if \(d\.subCalls !== null && d\.subWords !== null\)/, 'the canvas skips a null subagent fact rather than drawing it');
});

test('the header says how many of the elapsed days were worked', () => {
  assert.match(renderHtml([result()]), /31 OF 40 DAYS ACTIVE/);
});

test('two sources produce two sections on one page, not just the first', () => {
  // This is the exact bug Task 7 was assigned to fix — --html wrote only
  // cards[0] and silently dropped every card after it. Nothing before this
  // test exercised renderHtml with more than one element.
  const second: SourceResult = { ...result(), id: 'second', label: 'Second Agent' };
  const html = renderHtml([result(), second]);
  assert.match(html, /CLAUDE CODE/);
  assert.match(html, /SECOND AGENT/);
  assert.equal((html.match(/<section>/g) ?? []).length, 2, 'one <section> per source');
  assert.ok(html.indexOf('CLAUDE CODE') < html.indexOf('SECOND AGENT'), 'sections stay in the order given');
});

test('names the model most writing came from, against the number of models used', () => {
  assert.match(renderHtml([result()]), /came from Opus 5, of 3 models/);
});

test('a single-model user is not told about a choice they did not make', () => {
  const one = { ...stats, models: [{ model: 'Opus 5', written: 100, share: 1 }] };
  assert.match(renderHtml([result({ stats: one })]), /the only model you used/);
});

test('escapes a model name rather than interpolating it raw', () => {
  // displayModel returns an id it cannot parse untouched, so a hostile id
  // reaches the page verbatim unless this escapes — same risk as skill names.
  const hostile = { ...stats, models: [{ model: '<img onerror=x>', written: 1, share: 1 }] };
  assert.doesNotMatch(renderHtml([result({ stats: hostile })]), /<img/);
});

test('reports the longest unbroken stretch as a duration', () => {
  assert.match(renderHtml([result()]), /4h 12m at a stretch/);
});

test('shows the retention warning with a size-aware horizon, not a hardcoded year', () => {
  // Mirrors the terminal renderer's equivalent test. The golden fixture can
  // never reach this block — it spans 3 days against a 25-day risk
  // threshold — so a unit test is the only guard the HTML page has.
  const html = renderHtml([result()]);
  assert.match(html, /cleanupPeriodDays": 60/, 'recommends the horizon that fits the disk budget');
  assert.match(html, /9\.7 GB/, 'shows what a full year would actually cost');
  assert.match(html, /26 MB\/day/, 'shows the measured growth rate');
});

test('a source with no pruning advice gets no retention warning', () => {
  assert.doesNotMatch(renderHtml([result({ pruning: null })]), /cleanupPeriodDays/);
});
