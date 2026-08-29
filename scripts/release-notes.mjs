// Extract one version's section from CHANGELOG.md, for use as the GitHub
// release body. Exits non-zero when the section is missing or empty, so a
// release cannot ship without notes.
import { readFileSync } from 'node:fs';

/**
 * Join hard-wrapped lines back into single paragraphs.
 *
 * CHANGELOG.md is wrapped at about 80 columns, which is right for a file read
 * in an editor and reviewed as a diff. GitHub renders a single newline as a
 * line break, so pasting that wrapping into a release body reproduces every
 * wrap point as a ragged forced break. The file stays wrapped; what gets
 * emitted does not.
 *
 * Only continuation lines are joined. Headings, table rows, block quotes and
 * thematic breaks stand alone, list items start a new block that their own
 * continuations join, and fenced code is copied through untouched — wrapping
 * is meaningful inside it.
 */
function unwrap(markdown) {
  const out = [];
  let paragraph = [];
  let fenced = false;

  const flush = () => {
    if (paragraph.length) out.push(paragraph.join(' '));
    paragraph = [];
  };

  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      flush();
      out.push(line);
      fenced = !fenced;
    } else if (fenced) {
      out.push(line);
    } else if (line.trim() === '') {
      flush();
      out.push('');
    } else if (/^\s*(#{1,6}\s|\||>|([-*_])\s*\2\s*\2[\s\-*_]*$)/.test(line)) {
      // Standalone: joining a following line onto these changes what they mean.
      flush();
      out.push(line.trimEnd());
    } else if (/^\s*([-*+]|\d+[.)])\s/.test(line)) {
      // A new list item ends the previous block and begins one of its own.
      flush();
      paragraph.push(line.trimEnd());
    } else {
      paragraph.push(line.trim());
    }
  }
  flush();
  return out.join('\n');
}

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
console.log(unwrap(body));
