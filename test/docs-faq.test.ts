import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * docs/index.html carries every FAQ answer twice: once as visible prose and
 * once inside the JSON-LD FAQPage block. Google drops the rich result when the
 * two disagree, and nothing else in this repository notices — the mismatch has
 * shipped twice, each time caught only because somebody happened to look.
 */
const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pagePath = join(repo, 'docs', 'index.html');

/**
 * Entities matter here: the visible prose uses them for typography the JSON-LD
 * cannot (`&nbsp;` keeps "25 MB" on one line), and a comparison that skipped
 * decoding would report those as differences. Google decodes before reading,
 * so this must too — otherwise the test fails on correct pages.
 */
const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ', '&rsquo;': '’', '&lsquo;': '‘',
  '&mdash;': '—', '&ndash;': '–', '&hellip;': '…',
  '&middot;': '·', '&rarr;': '→', '&amp;': '&',
  '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
};

function decode(text: string): string {
  return text.replace(/&[a-z]+;|&#\d+;/g, (e) => ENTITIES[e] ?? e);
}

/** Visible text of a fragment: tags stripped, entities decoded, spaces collapsed. */
function plain(html: string): string {
  return decode(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

test('every FAQ answer matches its JSON-LD copy, or the rich result is dropped', async () => {
  const html = await readFile(pagePath, 'utf8');
  const block = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(block, 'the page must carry a JSON-LD block');

  let graph;
  try {
    graph = JSON.parse(block[1]!);
  } catch (e) {
    assert.fail(`the JSON-LD block does not parse: ${(e as Error).message}`);
  }
  const faq = graph['@graph'].find((n: { '@type': string }) => n['@type'] === 'FAQPage');
  assert.ok(faq, 'the JSON-LD must contain a FAQPage node');
  assert.ok(faq.mainEntity.length > 0, 'the FAQPage must contain questions');

  for (const entry of faq.mainEntity) {
    const question = plain(entry.name);
    // Find the heading whose visible text matches this question, then take the
    // paragraph after it. Matching on decoded text rather than raw markup is
    // what lets the heading use <code> and curly quotes freely.
    const headings = [...html.matchAll(/<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g)];
    const found = headings.find((h) => plain(h[1]!) === question);
    assert.ok(
      found,
      `No visible <h3> matches the JSON-LD question ${JSON.stringify(question)}.\n` +
        `Either the heading text drifted from the structured copy, or the answer is not in a <p> directly after its <h3>.`,
    );
    assert.equal(
      plain(found[2]!),
      plain(entry.acceptedAnswer.text),
      `The visible answer and the JSON-LD answer differ for ${JSON.stringify(question)}.\n` +
        `Google reads both and drops the FAQ rich result when they disagree, so edit them together.`,
    );
  }
});
