import { dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { cardPath, openCommand } from './paths.js';
import { SOURCES, selectSources } from './sources/index.js';
import type { Source, Unsupported } from './sources/types.js';
import { analyseSource } from './pipeline.js';
import type { SourceOutcome, SourceResult } from './pipeline.js';
import { renderCards } from './render-terminal.js';
import { parseSince } from './since.js';
import { renderHtml } from './render-html.js';

/** A source that produced no card, paired with why. */
type Failure = Extract<SourceOutcome, { ok: false }>;

/**
 * Pure entry point: takes the home directory as a parameter so tests can point
 * it at a fixture tree. Importing this module must never execute anything —
 * that is why the bin wrapper lives in cli.ts.
 */
const HELP = `agent-wrapped — a local-first wrapped card for the coding agents on your
machine. Claude Code is the only one implemented today.

Usage
  agent-wrapped [options]

Options
  --since <window>   Limit to a window: 30d, 12w, 6m, or a date like 2026-08-01.
                     Faster than a full run — older transcripts are never opened.
  --source <id>      Read only one agent. Available: ${SOURCES.map((s) => s.id).join(', ')}.
                     By default every agent found on this machine is read.
  --html             Write a self-contained page to ~/.agent-wrapped/card.html.
                     It has a Save-as-image button for a shareable PNG.
  --json             Print the raw stats as JSON.
  --no-save          Do not write a snapshot for this run.
  --version, -v      Print the version.
  --help, -h         Print this help.

Snapshots
  Every full run saves a ~1 KB summary to ~/.agent-wrapped/snapshots/ and
  compares against the most recent earlier one, so you can keep a year of
  history without keeping a year of transcripts.

Privacy
  Everything happens on your machine.
  No network calls, no account, no telemetry.
  Repository names are never printed — they are only grouping keys.
  Reads only the local history directories of the agents you have installed.`;

/** Version comes from package.json so it can never drift from what npm published. */
function readVersion(): string {
  for (const rel of ['../package.json', '../../package.json']) {
    try {
      return JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8')).version ?? 'unknown';
    } catch {
      // try the next candidate — layout differs between dist/ and the test build
    }
  }
  return 'unknown';
}

function flagValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  const inline = argv.find((a) => a.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : undefined;
}

/**
 * The reassurance every read-nothing run ends on.
 *
 * Kept here rather than inside each source's `notInstalled` string: what was
 * looked for is the source's to describe, but "nothing was sent anywhere" is
 * the CLI's own promise and reads identically for every agent. One home means
 * a second source cannot word it differently, or forget it.
 */
const NOTHING_SENT = 'Nothing to read — and nothing was sent anywhere.';

/** The message for one source, when it is the only source that was asked about. */
function singleFailureMessage(source: Source, outcome: Failure): string {
  switch (outcome.reason) {
    case 'empty-window':
      return `No activity since ${outcome.cutoff}.`;
    case 'no-records':
      return `Found ${outcome.files} transcript file(s), but no usable usage records in them.\nThis is normal for a brand-new install — come back after a few sessions.`;
    case 'failed':
      return `Something went wrong analysing ${source.label} data.\nNothing was sent anywhere, and no snapshot was written.`;
    case 'not-installed':
      // Each source owns the first line — only it knows how to describe its
      // own location in a way worth showing someone (root() returns null
      // here, not the path). The reassurance is appended from one place, so
      // the two lines together stay byte-identical to the pre-registry
      // message without every source having to carry a copy of the second.
      return `${source.notInstalled}\n${NOTHING_SENT}`;
  }
}

/**
 * A short, source-scoped phrase for a per-source line: the multi-source
 * "nothing anywhere" summary, and the warnings beside a card that did render.
 */
function reasonPhrase(outcome: Failure): string {
  switch (outcome.reason) {
    case 'not-installed':
      // Deliberately not "not installed": pipeline.ts maps *zero discovered
      // files* to this reason too, so an installed agent with an empty
      // history directory arrives here. "No history found" is true of both
      // an absent agent and a present-but-empty one, which is as much as
      // this reason actually distinguishes.
      return 'no history found';
    case 'failed':
      return 'could not be read';
    case 'no-records':
      return `${outcome.files} transcript file(s) found, but no usable records`;
    case 'empty-window':
      return `no activity since ${outcome.cutoff}`;
  }
}

/**
 * The text of a run that produced no card at all.
 *
 * Exported so the composition rules can be tested directly against fake
 * sources, without a second real source being installed:
 *  - one source selected: byte-identical to the pre-registry baseline.
 *  - several sources selected: each is named with its own reason, so a
 *    silent empty card never stands in for what actually happened.
 */
export function describeNoCards(sources: ReadonlyArray<Source>, outcomes: SourceOutcome[]): string {
  if (sources.length === 1) {
    const outcome = outcomes[0]!;
    return outcome.ok ? '' : singleFailureMessage(sources[0]!, outcome);
  }
  const lines = sources.map((source, i) => {
    const outcome = outcomes[i]!;
    return outcome.ok ? `${source.label}: ok` : `${source.label}: ${reasonPhrase(outcome)}`;
  });
  return [...lines, '', NOTHING_SENT].join('\n');
}

/**
 * One line per source that failed, so a failure is reported rather than
 * dropped once at least one other source produced a card.
 *
 * Each line states that source's actual reason, through the same
 * `reasonPhrase` the all-failed summary uses. It used to say "could not be
 * read" for every failure, which is a false sentence for three of the four
 * reasons — an agent that is simply installed-but-empty, or has no activity
 * inside `--since`, was reported as unreadable.
 *
 * And no "try --source <id> to see the error in isolation" pointer: it never
 * could show the error. `analyseSource` catches by design, so a single-source
 * run prints prose, not the exception — and the reason is already on this
 * line anyway.
 */
export function failureWarnings(sources: ReadonlyArray<Source>, outcomes: SourceOutcome[]): string[] {
  const lines: string[] = [];
  sources.forEach((source, i) => {
    const outcome = outcomes[i]!;
    if (!outcome.ok) {
      lines.push(`  ⚠  ${source.label}: ${reasonPhrase(outcome)}.`);
    }
  });
  return lines;
}

/** The reason fields for one failed outcome, flattened for --json. */
function failureDetail(outcome: Failure): Record<string, unknown> {
  switch (outcome.reason) {
    case 'not-installed':
    case 'failed':
      return { reason: outcome.reason };
    case 'no-records':
      return { reason: outcome.reason, files: outcome.files };
    case 'empty-window':
      return { reason: outcome.reason, cutoff: outcome.cutoff };
  }
}

/**
 * One successful source's payload, with every figure it declared unsupported
 * replaced by null.
 *
 * `stats` and `signals` are computed by the same generic code for every
 * source, so a source that cannot know a figure still gets a zero for it —
 * `cacheShare: 0` sitting beside `unsupported: ["cache"]`. A consumer that
 * does not read `unsupported` would then chart "0% cache" for a provider with
 * no cache accounting at all: a wrong number where a missing one was
 * available. Same rule, and the same shape, as the share payload in
 * render-html.ts.
 *
 * `topSkills` and `limitEvents` are nulled rather than emptied. `[]` is
 * precisely what a source that *does* measure them emits when the answer is
 * "none", so `[]` here would be indistinguishable from a real measurement of
 * zero — the very confusion this is fixing. `null` is a value the measurement
 * can never produce, so it cannot be misread as one.
 */
function redactUnsupported(result: SourceResult): Record<string, unknown> {
  const { id, savedTo, ...rest } = result;
  const omits = (field: Unsupported) => rest.unsupported.includes(field);
  // Spread first and override after: overriding a key that already exists
  // leaves it in its original position, so the payload's key order does not
  // change, and a field added to SourceResult later still reaches --json
  // without having to be named here.
  return {
    ...rest,
    stats: {
      ...rest.stats,
      ...(omits('cache') ? { cacheShare: null } : {}),
      ...(omits('subagents') ? { subagentCallShare: null, subagentWrittenShare: null } : {}),
      ...(omits('skills')
        ? { skillAttributedShare: null, distinctSkills: null, topSkills: null, topFourSkillShare: null }
        : {}),
    },
    signals: {
      ...rest.signals,
      ...(omits('limitEvents') ? { limitEvents: null, overloads: null } : {}),
    },
  };
}

/**
 * The --json payload, keyed by source id.
 *
 * One shape whether one agent is installed or three: every selected source
 * appears under its id, successful or not. A failure is data here, not an
 * absence — otherwise a script reading this output would see a
 * well-formed, complete-looking object with no way to tell that a source
 * silently produced nothing. `id` is left out of each value since it is
 * already the key, and `savedTo` is left out entirely since it is a local
 * filesystem path that no chart needs. Every figure a source declared
 * unsupported is nulled rather than emitted as the zero the generic pipeline
 * computed for it — see `redactUnsupported` above.
 */
export function renderJson(sources: ReadonlyArray<Source>, outcomes: SourceOutcome[]): string {
  const entries: Record<string, unknown> = {};
  sources.forEach((source, i) => {
    const outcome = outcomes[i]!;
    if (outcome.ok) {
      entries[source.id] = redactUnsupported(outcome.result);
    } else {
      entries[source.id] = { label: source.label, ...failureDetail(outcome) };
    }
  });
  return JSON.stringify({ sources: entries }, null, 2);
}

/**
 * The message returned for --html, with any source failures appended exactly
 * as the terminal branch does — the written page itself does not change here
 * (that is Task 7's job), but the text around it must not go quiet about a
 * source that failed alongside the one that got written.
 */
export function htmlWrittenMessage(out: string, sources: ReadonlyArray<Source>, outcomes: SourceOutcome[]): string {
  const wrote = `Wrote ${out}\nOpen it with:  ${openCommand()} ${out}`;
  const warnings = failureWarnings(sources, outcomes);
  return warnings.length > 0 ? [wrote, ...warnings].join('\n') : wrote;
}

export async function run(argv: string[], home: string): Promise<string> {
  if (argv.includes('--help') || argv.includes('-h')) return HELP;
  if (argv.includes('--version') || argv.includes('-v')) return readVersion();

  const sinceRaw = flagValue(argv, '--since');
  let since: Date | null = null;
  if (sinceRaw !== undefined) {
    since = parseSince(sinceRaw);
    if (!since) {
      return `Could not understand --since "${sinceRaw}".\nUse a window like 30d, 12w, 6m — or a date like 2026-08-01.`;
    }
  }

  const { sources, error } = selectSources(home, flagValue(argv, '--source'));
  if (error) return error;

  let effectiveSources: ReadonlyArray<Source> = sources;
  let outcomes: SourceOutcome[];

  if (sources.length === 0) {
    // No --source was given, and detection found nothing installed anywhere.
    // Describe it against the whole registry, not an empty selection — an
    // empty "several sources" message would be silent about the very thing
    // the run was looking for. detectSources already established that every
    // one of these has no root() here, so there is nothing left to analyse.
    effectiveSources = SOURCES;
    outcomes = SOURCES.map(() => ({ ok: false, reason: 'not-installed' }));
  } else {
    const save = !argv.includes('--no-save') && !since;
    outcomes = await Promise.all(sources.map((source) => analyseSource(source, home, { since, save })));
  }

  const cards = outcomes.filter((o): o is Extract<SourceOutcome, { ok: true }> => o.ok).map((o) => o.result);

  // --html and --json are not alternate branches of one "how do I show this"
  // choice — they answer different questions, and chaining them as
  // mutually-exclusive cases means whichever is checked first silently
  // cancels the other. --html is a side-effecting *action* (write the page),
  // so it writes whenever there is at least one card, regardless of which
  // output format was also asked for — --html --json writes the file AND
  // returns JSON, neither cancelling the other. --json is an output
  // *format*, so it is the only one that must always come back as valid,
  // parseable JSON — including on an all-failed run (cards.length === 0),
  // where each entry still carries its own `reason`, and even though there
  // is nothing for --html to write in that case. Project names are grouping
  // keys only and must never be emitted. The terminal path is the only one
  // that ever falls back to a plain-text status line on an all-failed run —
  // do not "fix" that asymmetry by moving it up here to match; a status line
  // is the right shape there, and JSON would be worse.
  let cardWrittenTo: string | null = null;
  if (argv.includes('--html') && cards.length > 0) {
    cardWrittenTo = cardPath(home);
    await mkdir(dirname(cardWrittenTo), { recursive: true });
    await writeFile(cardWrittenTo, renderHtml(cards), 'utf8');
  }

  if (argv.includes('--json')) return renderJson(effectiveSources, outcomes);

  if (cards.length === 0) return describeNoCards(effectiveSources, outcomes);

  if (cardWrittenTo) return htmlWrittenMessage(cardWrittenTo, effectiveSources, outcomes);

  const rendered = renderCards(cards);
  const warnings = failureWarnings(effectiveSources, outcomes);
  return warnings.length > 0 ? [rendered, ...warnings].join('\n') : rendered;
}
