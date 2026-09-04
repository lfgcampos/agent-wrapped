import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/run.js';

test('--help documents every flag the CLI accepts', async () => {
  // The single list. `--source` used to be checked from cli.test.ts instead,
  // which left two files asserting flag documentation from two different
  // lists — and this one, whose name claims the job, silently missing a flag.
  const out = await run(['--help'], '/nonexistent');
  for (const flag of ['--since', '--source', '--html', '--json', '--no-save', '--version', '--help']) {
    assert.ok(out.includes(flag), `help must document ${flag}`);
  }
  // Folded in from cli.test.ts: --source takes a value, so the placeholder is
  // part of what has to be documented, not just the flag name.
  assert.match(out, /--source <id>/);
});

test('--help names the agents it can read, not Claude Code alone', async () => {
  // The summary line described a Claude-Code-only tool long after the reader
  // behind it stopped being one, so someone running --help could not tell
  // that a second agent would be picked up without a flag.
  // Whitespace-normalised, since the summary wraps across two lines.
  const out = (await run(['--help'], '/nonexistent')).replace(/\s+/g, ' ');
  assert.match(out, /coding agents on your machine/);
  assert.match(out, /Claude Code is the only one implemented today/);
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
