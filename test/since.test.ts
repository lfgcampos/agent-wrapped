import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSince } from '../src/since.js';

const now = new Date('2026-08-25T12:00:00');

/**
 * Assert the contract — how far back the cutoff is — rather than how the result
 * renders in UTC. Rendering a locally-constructed date through toISOString()
 * shifts the day for anyone far enough from Greenwich (UTC+14 was the tell).
 */
const daysBack = (value: string) => Math.round((now.getTime() - parseSince(value, now)!.getTime()) / 86_400_000);

/** The local calendar date of a cutoff, so a month window is checked as a date, not a day count. */
const localDate = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate()];

test('parses day and week windows', () => {
  assert.equal(daysBack('30d'), 30);
  assert.equal(daysBack('2w'), 14);
});

test('parses a month window as calendar months, not 30-day blocks', () => {
  assert.deepEqual(localDate(parseSince('6m', now)!), [2026, 2, 25]);
  assert.deepEqual(localDate(parseSince('12m', new Date(2026, 10, 27))!), [2025, 11, 27]);
  assert.deepEqual(localDate(parseSince('14m', new Date(2026, 0, 15))!), [2024, 11, 15]);
});

test('keeps the time of day in a month window', () => {
  const cutoff = parseSince('1m', now)!;
  assert.equal(cutoff.getHours(), 12);
  assert.equal(cutoff.getMinutes(), 0);
});

test('clamps a month window to the last day of a shorter month', () => {
  assert.deepEqual(localDate(parseSince('1m', new Date(2026, 2, 31))!), [2026, 2, 28]);
  assert.deepEqual(localDate(parseSince('1m', new Date(2028, 2, 31))!), [2028, 2, 29]);
  assert.deepEqual(localDate(parseSince('6m', new Date(2026, 7, 31))!), [2026, 2, 28]);
});

test('rejects a month window too large for a date', () => {
  assert.equal(parseSince('99999999m', now), null);
});

test('is not confused by spacing or case', () => {
  assert.equal(daysBack('7D'), 7);
  assert.equal(daysBack(' 7 d '), 7);
});

test('parses an absolute date in the local calendar', () => {
  const d = parseSince('2026-08-01', now)!;
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 7); // August
  assert.equal(d.getDate(), 1);
});

test('rejects nonsense rather than silently scanning everything', () => {
  assert.equal(parseSince('last tuesday', now), null);
  assert.equal(parseSince('', now), null);
  assert.equal(parseSince('30', now), null);
});

test('rejects a zero-length window', () => {
  assert.equal(parseSince('0d', now), null);
  assert.equal(parseSince('0w', now), null);
  assert.equal(parseSince('0m', now), null);
});

test('rejects an impossible calendar date', () => {
  assert.equal(parseSince('2026-02-31', now), null);
  assert.equal(parseSince('2026-13-01', now), null);
  assert.equal(parseSince('2026-00-10', now), null);
  assert.equal(parseSince('2026-04-31', now), null);
});

test('accepts the last day of a leap-year February', () => {
  assert.equal(parseSince('2028-02-29', now)!.getDate(), 29);
  assert.equal(parseSince('2026-02-29', now), null);
});
