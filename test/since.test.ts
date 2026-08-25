import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSince } from '../src/since.js';

const now = new Date('2026-08-25T12:00:00');

test('parses day, week and month windows', () => {
  assert.equal(parseSince('30d', now)!.toISOString().slice(0, 10), '2026-07-26');
  assert.equal(parseSince('2w', now)!.toISOString().slice(0, 10), '2026-08-11');
  assert.equal(parseSince('6m', now)!.toISOString().slice(0, 10), '2026-02-26');
});

test('parses an absolute date', () => {
  assert.equal(parseSince('2026-08-01', now)!.getFullYear(), 2026);
});

test('rejects nonsense rather than silently scanning everything', () => {
  assert.equal(parseSince('last tuesday', now), null);
  assert.equal(parseSince('', now), null);
  assert.equal(parseSince('30', now), null);
});
