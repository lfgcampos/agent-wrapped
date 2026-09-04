import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../src/run.js';

async function home(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'aw-'));
  const project = join(root, '.claude', 'projects', '-Users-me-Projects-alpha');
  await mkdir(join(project, 'sess-1', 'subagents'), { recursive: true });
  const record = (id: string, extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      type: 'assistant',
      timestamp: '2026-08-01T10:00:00.000Z',
      message: {
        id,
        model: 'claude-opus-5',
        usage: { input_tokens: 0, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 900 },
      },
      ...extra,
    }) + '\n';
  await writeFile(join(project, 'sess-1.jsonl'), record('m1', { attributionSkill: 'brainstorming' }) + record('m1'));
  await writeFile(join(project, 'sess-1', 'subagents', 'agent-a.jsonl'), record('m2'));
  return root;
}

test('renders a card end to end from a transcript tree', async () => {
  const out = await run([], await home());
  assert.match(out, /tokens read for every token written/);
  assert.match(out, /9 : 1/); // 1800 context read over 200 written
});

test('--json emits machine-readable stats with no project names', async () => {
  const out = await run(['--json'], await home());
  const parsed = JSON.parse(out);
  assert.equal(parsed.sources['claude-code'].stats.calls, 2);
  assert.equal(parsed.sources['claude-code'].stats.repoCount, 1);
  assert.ok(!out.includes('alpha'), 'project names must never be emitted');
});

test('--json keys results by source, with one shape regardless of source count', async () => {
  const out = await run(['--json'], await home());
  const parsed = JSON.parse(out);
  assert.deepEqual(Object.keys(parsed), ['sources']);
  assert.ok(parsed.sources['claude-code'], 'keyed by source id');
  const one = parsed.sources['claude-code'];
  assert.deepEqual(
    Object.keys(one).sort(),
    ['delta', 'disk', 'label', 'previous', 'pruning', 'rhythm', 'signals', 'stats', 'unsupported'].sort(),
  );
});

test('--json never emits a project name', async () => {
  const out = await run(['--json'], await home());
  // Project names are grouping keys only. The fixture uses -Users-me-Projects-alpha.
  assert.doesNotMatch(out, /Users-me|alpha|beta/);
});

test('reports a clear message when there are no transcripts', async () => {
  const empty = await mkdtemp(join(tmpdir(), 'aw-'));
  const out = await run([], empty);
  assert.match(out, /No Claude Code transcripts found/);
});

test('--json on an all-failed run still returns parseable JSON, keyed by source', async () => {
  // Regression: --json used to fall through to the same plain-text message as
  // the test above when every selected source failed, since that early return
  // ran before the --json check. A --json consumer piping this through
  // JSON.parse must never hit a syntax error instead of a data shape it can
  // branch on — so this asserts by actually parsing, not by pattern-matching
  // the string, since an unparseable string is exactly the defect in question.
  const empty = await mkdtemp(join(tmpdir(), 'aw-'));
  const out = await run(['--json'], empty);
  const parsed = JSON.parse(out);
  assert.deepEqual(parsed, { sources: { 'claude-code': { label: 'Claude Code', reason: 'not-installed' } } });
});

test('--html writes into the tool directory under the given home', async () => {
  // The fixture home lives in a temp dir, so "not in a temp path" is untestable
  // here. The real contract is that the card lands under THIS home's data dir.
  const root = await home();
  const out = await run(['--html'], root);
  assert.ok(out.includes(join(root, '.agent-wrapped', 'card.html')), out);
  assert.doesNotMatch(out, /agent-wrapped\.html/, 'the old flat temp filename is gone');
});

test('--html --json together write the file and return parseable JSON — neither cancels the other', async () => {
  // Regression: moving --json ahead of the all-failed early return also
  // moved it ahead of --html, so the two flags together used to silently
  // cancel each other depending on check order. --html is a side-effecting
  // action and --json is an output format — they are orthogonal, not
  // alternatives, so both must take effect when both flags are given. Uses a
  // temp home (not the shared fixture) so this run's own --html write can
  // never trip the "no leftover .agent-wrapped" guard on test/fixtures.
  const root = await home();
  const cardFile = join(root, '.agent-wrapped', 'card.html');
  const out = await run(['--html', '--json'], root);
  const parsed = JSON.parse(out); // the returned string must still be JSON, not the "Wrote ..." sentence
  assert.equal(parsed.sources['claude-code'].stats.calls, 2, 'still the same keyed JSON payload as --json alone');
  await access(cardFile); // throws if --html's write did not happen
});

test('an unknown --source is rejected with the valid ids', async () => {
  const out = await run(['--source', 'nope'], await home());
  assert.match(out, /Unknown --source "nope"/);
  assert.match(out, /claude-code/);
});

// '--source names the flag in --help' used to live here. Flag documentation is
// asserted in one place now — test/help.test.ts, 'documents every flag the CLI
// accepts', which is the test whose name claims that job. Add new flags to that
// list, not to a second one here.

test('--source narrows a run to just that source', async () => {
  const out = await run(['--source', 'claude-code'], await home());
  assert.match(out, /tokens read for every token written/);
});
