import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/run.js';

test('--help documents every flag the CLI accepts', async () => {
  const out = await run(['--help'], '/nonexistent');
  for (const flag of ['--since', '--html', '--json', '--no-save', '--version', '--help']) {
    assert.ok(out.includes(flag), `help must document ${flag}`);
  }
});

test('--help states the privacy position, since that is the pitch', async () => {
  const out = await run(['--help'], '/nonexistent');
  assert.match(out, /No network calls/i);
  assert.match(out, /never printed/i);
});

test('--help works without any transcripts present', async () => {
  const out = await run(['-h'], '/nonexistent/path');
  assert.doesNotMatch(out, /No Claude Code transcripts/);
});

test('--version prints a version, not a card', async () => {
  const out = await run(['--version'], '/nonexistent');
  assert.match(out, /^\d+\.\d+\.\d+$|^unknown$/);
});
