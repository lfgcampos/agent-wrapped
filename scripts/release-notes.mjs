// Extract one version's section from CHANGELOG.md, for use as the GitHub
// release body. Exits non-zero when the section is missing or empty, so a
// release cannot ship without notes.
import { readFileSync } from 'node:fs';

const version = process.argv[2];
if (!version) {
  console.error('usage: node scripts/release-notes.mjs <version>');
  process.exit(2);
}

const lines = readFileSync('CHANGELOG.md', 'utf8').split('\n');
const start = lines.findIndex((l) => l.startsWith(`## [${version}]`));
if (start === -1) {
  console.error(`CHANGELOG.md has no "## [${version}]" section. Write the release notes first.`);
  process.exit(1);
}

const rest = lines.slice(start + 1);
const next = rest.findIndex((l) => l.startsWith('## '));
const body = (next === -1 ? rest : rest.slice(0, next)).join('\n').trim();

if (!body) {
  console.error(`The "## [${version}]" section in CHANGELOG.md is empty.`);
  process.exit(1);
}
console.log(body);
