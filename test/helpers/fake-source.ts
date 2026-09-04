import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Signals, UsageRecord } from '../../src/types.js';
import type { Source } from '../../src/sources/types.js';

/**
 * Test sources that share no convention with Claude Code.
 *
 * These exist so the `Source` seam can be exercised without a second agent
 * being installed anywhere, and so a Claude-specific assumption reintroduced
 * downstream fails a test. They are better than a real second agent for the
 * job: hermetic, and immune to an upstream directory reorganisation.
 *
 * They live in one file because they did not always. Three separate fakes grew
 * across three test files, and two of them used the id `fake` with opposite
 * contracts — one that succeeds and one that throws on discover. Nothing
 * caught it, because each test only ever saw its own. Hence the required
 * explicit `id` below: a collision now needs someone to type the same name
 * twice on purpose.
 */

/** An empty `Signals`, which several fakes need and none of them vary. */
export function noSignals(): Signals {
  return { toolCounts: {}, userMessages: 0, limitEvents: [], overloads: 0, sessionCalls: {} };
}

/**
 * A `Source` with inert defaults: installed nowhere, discovers nothing, parses
 * nothing, supports everything.
 *
 * `id` is a required argument rather than an overridable default, so every
 * fake in the suite is named at its call site and two fakes cannot silently
 * share an identity. Override exactly the behaviour your test is about and
 * leave the rest — a fake that only differs in the one field under test says
 * what it is testing.
 */
export function fakeSource(id: string, over: Partial<Source> = {}): Source {
  return {
    id,
    label: `${id.charAt(0).toUpperCase()}${id.slice(1)} Agent`,
    notInstalled: `No ${id} history found.\nNothing to read — and nothing was sent anywhere.`,
    root: () => null,
    async discover() {
      return [];
    },
    async parse() {
      return { records: [], signals: noSignals() };
    },
    unsupported: [],
    ...over,
  };
}

/** A source whose discover throws, for the fail-soft and composition rules. */
export function throwingSource(id: string, over: Partial<Source> = {}): Source {
  return fakeSource(id, {
    root: () => `/${id}`,
    async discover() {
      throw new Error('schema drift');
    },
    ...over,
  });
}

/**
 * The canonical second source: a working agent that shares no convention with
 * Claude Code.
 *
 * Reads `test/fixtures/fake/.fake/sessions/s1.jsonl` — a flat directory rather
 * than one directory per project, its own line schema (`ts`/`in`/`out` rather
 * than a nested `message.usage`), and no skills, subagents, cache accounting
 * or usage-limit notices. That last part is the point: it declares all four
 * `unsupported` values, so the renderers must omit those sections rather than
 * print a zero.
 *
 * This is the artifact behind the claim that a second source needs no edit to
 * `stats.ts`, `rhythm.ts`, `snapshot.ts` or either renderer. If a
 * Claude-specific assumption is reintroduced downstream, this is what fails.
 */
export function syntheticSource(): Source {
  return fakeSource('fake', {
    label: 'Fake Agent',
    notInstalled: 'No Fake Agent history found.',
    root(home) {
      const dir = join(home, '.fake', 'sessions');
      return existsSync(dir) ? dir : null;
    },
    async discover(root) {
      return [{ path: join(root, 's1.jsonl'), size: 128, mtime: 0, project: 'proj', fromSubagentDir: false }];
    },
    async parse(files) {
      const records: UsageRecord[] = [];
      for (const file of files) {
        for (const line of (await readFile(file.path, 'utf8')).split('\n').filter(Boolean)) {
          const parsed = JSON.parse(line);
          records.push({
            id: parsed.ts,
            ts: parsed.ts,
            model: 'fake-model-1',
            input: parsed.in,
            output: parsed.out,
            cacheCreate: 0,
            cacheRead: 0,
            project: file.project,
            isSubagent: false,
            skill: null,
          });
        }
      }
      return { records, signals: noSignals() };
    },
    unsupported: ['skills', 'subagents', 'cache', 'limitEvents'],
  });
}
