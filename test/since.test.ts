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

test('parses day, week and month windows', () => {
  assert.equal(daysBack('30d'), 30);
  assert.equal(daysBack('2w'), 14);
  assert.equal(daysBack('6m'), 180);
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

test('rejects a window too large for a date', () => {
  assert.equal(parseSince('999999999d', now), null);
  assert.equal(parseSince('999999999w', now), null);
  assert.equal(parseSince('999999999m', now), null);
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
