import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discover, normalizeProject } from '../src/discover.js';

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'aw-'));
  await mkdir(join(root, '-Users-me-Projects-alpha', 'sess-1', 'subagents'), { recursive: true });
  await writeFile(join(root, '-Users-me-Projects-alpha', 'sess-1.jsonl'), '');
  await writeFile(join(root, '-Users-me-Projects-alpha', 'sess-1', 'subagents', 'agent-a1.jsonl'), '');
  await mkdir(join(root, '-Users-me-Projects-alpha--worktrees-feat'), { recursive: true });
  await writeFile(join(root, '-Users-me-Projects-alpha--worktrees-feat', 'sess-2.jsonl'), '');
  await writeFile(join(root, '-Users-me-Projects-alpha', 'notes.md'), 'ignore me');
  return root;
}

test('finds nested subagent transcripts, not just top-level ones', async () => {
  const files = await discover(await fixture());
  assert.equal(files.length, 3);
  assert.equal(files.filter((f) => f.fromSubagentDir).length, 1);
});

test('ignores non-jsonl files', async () => {
  const files = await discover(await fixture());
  assert.ok(files.every((f) => f.path.endsWith('.jsonl')));
});

test('attributes a subagent file to its real project, not to "subagents"', async () => {
  const files = await discover(await fixture());
  const sub = files.find((f) => f.fromSubagentDir)!;
  assert.equal(sub.project, 'Projects-alpha');
});

test('folds worktree checkouts into the parent repo', () => {
  assert.equal(normalizeProject('-Users-me-Projects-alpha--worktrees-feat'), 'Projects-alpha');
  assert.equal(normalizeProject('-Users-me-Projects-alpha'), 'Projects-alpha');
});
