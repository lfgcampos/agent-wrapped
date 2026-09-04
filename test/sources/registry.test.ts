import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { SOURCES, detectSources, selectSources } from '../../src/sources/index.js';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const fixtureHome = join(repo, 'test', 'fixtures', 'claude-code');

test('every registered source has a unique id', () => {
  const ids = SOURCES.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('detection finds an installed source without being asked', () => {
  assert.deepEqual(detectSources(fixtureHome).map((s) => s.id), ['claude-code']);
});

test('a home with nothing installed detects nothing', async () => {
  const empty = await mkdtemp(join(tmpdir(), 'aw-empty-'));
  assert.deepEqual(detectSources(empty), []);
});

test('--source narrows to one source', () => {
  const { sources, error } = selectSources(fixtureHome, 'claude-code');
  assert.equal(error, undefined);
  assert.deepEqual(sources.map((s) => s.id), ['claude-code']);
});

test('an unknown --source names the ids that would have worked', () => {
  const { error } = selectSources(fixtureHome, 'nope');
  assert.match(error ?? '', /nope/);
  assert.match(error ?? '', /claude-code/);
});

test('--source naming a source that is not installed is not an error', async () => {
  // A fresh, empty home: claude-code is a valid id, there is simply nothing
  // there. Matching it is still not an error — the empty result is the
  // answer, and detecting "nothing on disk" is analyseSource's job, not
  // selectSources's.
  const empty = await mkdtemp(join(tmpdir(), 'aw-empty-'));
  const { sources, error } = selectSources(empty, 'claude-code');
  assert.equal(error, undefined);
  assert.equal(sources.length, 1);
});
