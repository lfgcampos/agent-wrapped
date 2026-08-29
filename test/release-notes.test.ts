import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
// dist-test/test/… → repo root. The script is plain .mjs and is never compiled.
const script = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'release-notes.mjs');

/** Run the extractor against a throwaway CHANGELOG, from its own directory. */
async function notes(changelog: string, version = '1.0.0'): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'aw-notes-'));
  await writeFile(join(dir, 'CHANGELOG.md'), changelog);
  const { stdout } = await exec(process.execPath, [script, version], { cwd: dir });
  return stdout.trimEnd();
}

test('joins hard-wrapped prose into one line', async () => {
  // GitHub renders a single newline as a break, so the wrapping that suits the
  // file would otherwise reach the release page as ragged forced breaks.
  const out = await notes(`## [1.0.0]\n\nOne sentence that the file\nhappens to wrap across\nthree lines.\n`);
  assert.equal(out, 'One sentence that the file happens to wrap across three lines.');
});

test('keeps list items apart while joining their continuations', async () => {
  const out = await notes(`## [1.0.0]\n\n- First item, wrapped\n  onto a second line.\n- Second item.\n`);
  assert.equal(out, '- First item, wrapped onto a second line.\n- Second item.');
});

test('leaves headings standing alone', async () => {
  const out = await notes(`## [1.0.0]\n\n### Added\n\nA thing.\n`);
  assert.equal(out, '### Added\n\nA thing.');
});

test('copies fenced code through untouched, because wrapping means something there', async () => {
  const out = await notes(`## [1.0.0]\n\n\`\`\`sh\nnpx thing \\\n  --flag\n\`\`\`\n`);
  assert.equal(out, '```sh\nnpx thing \\\n  --flag\n```');
});

test('keeps table rows on their own lines', async () => {
  const out = await notes(`## [1.0.0]\n\n| A | B |\n|---|---|\n| 1 | 2 |\n`);
  assert.equal(out, '| A | B |\n|---|---|\n| 1 | 2 |');
});

test('stops at the next version heading', async () => {
  const out = await notes(`## [1.0.0]\n\nMine.\n\n## [0.9.0]\n\nNot mine.\n`);
  assert.equal(out, 'Mine.');
});

test('fails when the section is missing, so a release cannot ship without notes', async () => {
  await assert.rejects(() => notes(`## [0.9.0]\n\nOther.\n`), /no "## \[1\.0\.0\]" section/);
});

test('fails when the section is present but empty', async () => {
  await assert.rejects(() => notes(`## [1.0.0]\n\n## [0.9.0]\n\nOther.\n`), /is empty/);
});
