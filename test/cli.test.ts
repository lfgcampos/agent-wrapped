import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../src/cli.js';

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
  assert.equal(parsed.stats.calls, 2);
  assert.equal(parsed.stats.repoCount, 1);
  assert.ok(!out.includes('alpha'), 'project names must never be emitted');
});

test('reports a clear message when there are no transcripts', async () => {
  const empty = await mkdtemp(join(tmpdir(), 'aw-'));
  const out = await run([], empty);
  assert.match(out, /No Claude Code transcripts found/);
});
