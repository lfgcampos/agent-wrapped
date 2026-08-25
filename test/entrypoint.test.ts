import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
/** The compiled bin, as a user would actually invoke it. */
const cli = join(here, '..', 'src', 'cli.js');

async function home(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'aw-'));
  const project = join(root, '.claude', 'projects', '-Users-me-Projects-alpha');
  await mkdir(project, { recursive: true });
  await writeFile(
    join(project, 's.jsonl'),
    JSON.stringify({
      type: 'assistant',
      timestamp: '2026-08-01T10:00:00.000Z',
      message: { id: 'm1', model: 'claude-opus-5', usage: { input_tokens: 0, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 900 } },
    }) + '\n',
  );
  return root;
}

test('the bin produces output when executed as a subprocess', async () => {
  const h = await home();
  const { stdout } = await exec(process.execPath, [cli], { env: { ...process.env, HOME: h, USERPROFILE: h } });
  assert.match(stdout, /tokens read for every token written/);
  assert.ok(stdout.trim().length > 0, 'the bin must not be a silent no-op');
});

test('importing run has no side effects — it must not print on import', async () => {
  const probe = `import('${join(here, '..', 'src', 'run.js')}').then(() => process.stdout.write('QUIET'));`;
  const h = await home();
  const { stdout } = await exec(process.execPath, ['--input-type=module', '-e', probe], {
    env: { ...process.env, HOME: h, USERPROFILE: h },
  });
  assert.equal(stdout, 'QUIET');
});
