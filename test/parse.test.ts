import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseAll } from '../src/parse.js';
import type { TranscriptFile } from '../src/types.js';

function line(obj: unknown): string {
  return JSON.stringify(obj) + '\n';
}

function assistant(id: string, over: Record<string, unknown> = {}): string {
  return line({
    type: 'assistant',
    timestamp: '2026-08-01T10:00:00.000Z',
    isSidechain: false,
    message: {
      id,
      model: 'claude-opus-5',
      usage: {
        input_tokens: 1,
        output_tokens: 100,
        cache_creation_input_tokens: 10,
        cache_read_input_tokens: 1000,
      },
    },
    ...over,
  });
}

async function fixtureFile(contents: string): Promise<TranscriptFile[]> {
  const dir = await mkdtemp(join(tmpdir(), 'aw-'));
  const path = join(dir, 'sess.jsonl');
  await writeFile(path, contents);
  return [{ path, size: 100, mtime: Date.now(), project: 'alpha', fromSubagentDir: false }];
}

test('extracts one record per assistant usage line', async () => {
  const { records } = await parseAll(await fixtureFile(assistant('m1') + assistant('m2')));
  assert.equal(records.length, 2);
  assert.equal(records[0]!.output, 100);
  assert.equal(records[0]!.cacheRead, 1000);
});

test('deduplicates repeated message.id — one response can span several lines', async () => {
  const { records } = await parseAll(await fixtureFile(assistant('m1') + assistant('m1')));
  assert.equal(records.length, 1);
});

test('skips synthetic model entries', async () => {
  const contents =
    assistant('m1') +
    line({ type: 'assistant', timestamp: '2026-08-01T10:00:00.000Z', message: { id: 'm2', model: '<synthetic>', usage: { output_tokens: 0 } } });
  const { records } = await parseAll(await fixtureFile(contents));
  assert.equal(records.length, 1);
});

test('ignores user lines and malformed JSON', async () => {
  const contents = assistant('m1') + line({ type: 'user', message: {} }) + '{not json\n';
  const { records } = await parseAll(await fixtureFile(contents));
  assert.equal(records.length, 1);
});

test('marks a record as subagent from the file path OR the isSidechain flag', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aw-'));
  const a = join(dir, 'a.jsonl');
  const b = join(dir, 'b.jsonl');
  await writeFile(a, assistant('m1'));
  await writeFile(b, assistant('m2', { isSidechain: true }));
  const { records } = await parseAll([
    { path: a, size: 100, mtime: Date.now(), project: 'alpha', fromSubagentDir: true },
    { path: b, size: 100, mtime: Date.now(), project: 'alpha', fromSubagentDir: false },
  ]);
  assert.equal(records.filter((r) => r.isSubagent).length, 2);
});

test('captures the attributed skill when present', async () => {
  const { records } = await parseAll(await fixtureFile(assistant('m1', { attributionSkill: 'superpowers:brainstorming' })));
  assert.equal(records[0]!.skill, 'superpowers:brainstorming');
});
