import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDisk } from '../src/disk.js';
import type { Stats, TranscriptFile } from '../src/types.js';

const file = (size: number): TranscriptFile => ({
  path: '/x.jsonl', size, mtime: 0, project: 'a', fromSubagentDir: false,
});

/** Only the two fields computeDisk reads; the rest never influence it. */
const stats = (activeDays: number) => ({ activeDays } as Stats);

test('bytes on disk is the sum of every file', () => {
  const d = computeDisk([file(100), file(250)], stats(2));
  assert.equal(d.bytesOnDisk, 350);
});

test('bytes per day divides by active days, not by the elapsed span', () => {
  const d = computeDisk([file(100), file(200)], stats(3));
  assert.equal(d.bytesPerDay, 100);
});

test('no active days yields zero rather than Infinity', () => {
  const d = computeDisk([file(100)], stats(0));
  assert.equal(d.bytesPerDay, 0);
});

test('no files yields zeroes rather than NaN', () => {
  const d = computeDisk([], stats(5));
  assert.equal(d.bytesOnDisk, 0);
  assert.equal(d.bytesPerDay, 0);
});
