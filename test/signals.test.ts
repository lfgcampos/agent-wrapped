import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAll } from '../src/sources/claude-code/parse.js';
import { claudeCode } from '../src/sources/claude-code/index.js';
import type { TranscriptFile } from '../src/types.js';

async function file(contents: string): Promise<TranscriptFile[]> {
  const dir = await mkdtemp(join(tmpdir(), 'aw-'));
  const path = join(dir, 'sess-abc.jsonl');
  await writeFile(path, contents);
  return [{ path, size: 100, mtime: Date.now(), project: 'a', fromSubagentDir: false }];
}

const withTools = (id: string, names: string[]) =>
  JSON.stringify({
    type: 'assistant', timestamp: '2026-08-01T10:00:00.000Z',
    message: {
      id, model: 'claude-opus-5',
      usage: { output_tokens: 10, cache_read_input_tokens: 100 },
      content: names.map((name) => ({ type: 'tool_use', name })),
    },
  }) + '\n';

// Real shape: an ASSISTANT line flagged isApiErrorMessage, content as text blocks.
const limitLine = (ts: string, resets: string, kind = 'session') =>
  JSON.stringify({
    type: 'assistant', timestamp: ts, isApiErrorMessage: true,
    message: { content: [{ type: 'text', text: `You've hit your ${kind} limit · resets ${resets} (America/Sao_Paulo)` }] },
  }) + '\n';

test('counts tool calls by name', async () => {
  const { signals } = await parseAll(await file(withTools('m1', ['Bash', 'Bash', 'Edit'])));
  assert.equal(signals.toolCounts['Bash'], 2);
  assert.equal(signals.toolCounts['Edit'], 1);
});

test('collapses every MCP tool into one bucket', async () => {
  const { signals } = await parseAll(await file(withTools('m1', ['mcp__github__get_issue', 'mcp__slack__post'])));
  assert.equal(signals.toolCounts['MCP tool'], 2);
  assert.equal(signals.toolCounts['mcp__github__get_issue'], undefined);
});

test('counts human turns but not tool results fed back as user lines', async () => {
  const contents =
    withTools('m1', ['Bash']) +
    JSON.stringify({ type: 'user', message: { content: 'hi' } }) + '\n' +
    JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'output' }] } }) + '\n' +
    JSON.stringify({ type: 'user', isMeta: true, message: { content: [{ type: 'text', text: 'system note' }] } }) + '\n';
  const { signals } = await parseAll(await file(contents));
  assert.equal(signals.userMessages, 1, 'only the typed message counts');
});

test('deduplicates retried limit messages into one event', async () => {
  const contents =
    limitLine('2026-07-28T10:00:00.000Z', '1:30pm') +
    limitLine('2026-07-28T10:05:00.000Z', '1:30pm') +
    limitLine('2026-07-28T10:09:00.000Z', '1:30pm');
  const { signals } = await parseAll(await file(contents));
  assert.equal(signals.limitEvents.length, 1, 'three retries of the same wall are one event');
  assert.equal(signals.limitEvents[0]!.kind, 'session');
});

test('treats limit kinds that differ only in case as one event', async () => {
  const contents =
    limitLine('2026-07-28T10:00:00.000Z', '1:30pm', 'session') +
    limitLine('2026-07-28T10:05:00.000Z', '1:30pm', 'Session');
  const { signals } = await parseAll(await file(contents));
  assert.equal(signals.limitEvents.length, 1, "'session' and 'Session' are the same wall");
  assert.equal(signals.limitEvents[0]!.kind, 'session');
});

test('separate walls on separate days are separate events', async () => {
  const contents = limitLine('2026-07-28T10:00:00.000Z', '1:30pm') + limitLine('2026-08-07T20:00:00.000Z', '7:40pm');
  const { signals } = await parseAll(await file(contents));
  assert.equal(signals.limitEvents.length, 2);
});

test('counts server overloads separately from limits', async () => {
  const contents =
    JSON.stringify({ type: 'assistant', isApiErrorMessage: true, timestamp: '2026-08-05T10:00:00.000Z', message: { content: [{ type: 'text', text: 'API Error: 529 Overloaded. This is a server-side issue' }] } }) + '\n';
  const { signals } = await parseAll(await file(contents));
  assert.equal(signals.overloads, 1);
  assert.equal(signals.limitEvents.length, 0);
});

test('tracks calls per session', async () => {
  const { signals } = await parseAll(await file(withTools('m1', []) + withTools('m2', [])));
  assert.equal(signals.sessionCalls['sess-abc'], 2);
});

test('counts a message id once when two lines share it', async () => {
  const { signals } = await parseAll(await file(withTools('m1', []) + withTools('m1', [])));
  assert.equal(signals.sessionCalls['sess-abc'], 1);
});

test('a subagent transcript counts toward its parent session, not a session of its own', async () => {
  const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const root = claudeCode.root(join(repo, 'test', 'fixtures', 'claude-code'))!;
  const { signals } = await parseAll(await claudeCode.discover(root));
  const keys = Object.keys(signals.sessionCalls);
  assert.ok(keys.every((key) => !key.startsWith('agent-')), `no key from a subagent file name: ${keys.join(', ')}`);
  assert.deepEqual(keys.sort(), ['s1', 's2']);
});

test('a workflow transcript nested deeper under subagents/ also counts toward its parent session', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aw-'));
  const wf = join(root, '-Users-me-alpha', 'sessA', 'subagents', 'workflows', 'wf_1');
  await mkdir(wf, { recursive: true });
  await writeFile(join(root, '-Users-me-alpha', 'sessA.jsonl'), withTools('n1', []));
  await writeFile(join(wf, 'agent-x.jsonl'), withTools('n2', []));
  await writeFile(join(wf, 'journal.jsonl'), withTools('n3', []));
  const { signals } = await parseAll(await claudeCode.discover(root));
  assert.deepEqual(signals.sessionCalls, { sessA: 3 });
});
