import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { claudeCode } from '../../src/sources/claude-code/index.js';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const fixtureHome = join(repo, 'test', 'fixtures', 'claude-code');

test('the source identifies itself with a stable id and a human label', () => {
  assert.equal(claudeCode.id, 'claude-code');
  assert.equal(claudeCode.label, 'Claude Code');
});

test('Claude Code supports every field the card can show', () => {
  assert.deepEqual([...claudeCode.unsupported], []);
});

test('the root is the projects directory under the given home', () => {
  assert.equal(claudeCode.root(fixtureHome), join(fixtureHome, '.claude', 'projects'));
});

test('a home with no Claude Code install has no root', async () => {
  const empty = await mkdtemp(join(tmpdir(), 'aw-empty-'));
  assert.equal(claudeCode.root(empty), null);
});

test('the source names its own not-installed wording, since root() cannot once absent', () => {
  assert.ok(claudeCode.notInstalled.length > 0);
  assert.match(claudeCode.notInstalled, /Claude Code/);
  assert.match(claudeCode.notInstalled, /~\/\.claude\/projects/);
});

test('discovery and parsing round-trip the fixture tree', async () => {
  const root = claudeCode.root(fixtureHome)!;
  const files = await claudeCode.discover(root);
  assert.equal(files.length, 3);
  const { records, signals } = await claudeCode.parse(files);
  assert.equal(records.length, 5);
  assert.equal(signals.userMessages, 2);
});
