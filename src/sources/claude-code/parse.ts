import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { basename, sep } from 'node:path';
import type { LimitEvent, Signals, TranscriptFile, UsageRecord } from '../../types.js';
import { localDay } from '../../stats.js';

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Extract the plain text of a message, whatever shape the content takes. */
function messageText(message: any): string {
  const c = message?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((b: any) => (typeof b?.text === 'string' ? b.text : '')).join(' ');
  return '';
}

/** True when a user line is a person typing, not a tool result being fed back. */
function isHumanTurn(message: any): boolean {
  const c = message?.content;
  if (typeof c === 'string') return c.trim().length > 0;
  if (Array.isArray(c)) return c.some((b: any) => b?.type === 'text');
  return false;
}

/**
 * A subagent's transcript sits anywhere under `<session>/subagents/`, either
 * directly (`agent-*.jsonl`) or deeper (`workflows/wf_<id>/agent-*.jsonl`).
 * It is part of that session, so its calls count toward `<session>`, not
 * toward a session named after the agent file. `fromSubagentDir` is decided
 * relative to the projects root, so a `subagents` folder above the root never
 * reaches the `lastIndexOf` below.
 */
function sessionIdOf(file: TranscriptFile): string {
  if (file.fromSubagentDir) {
    const segments = file.path.split(sep);
    const at = segments.lastIndexOf('subagents');
    if (at > 0) return segments[at - 1]!;
  }
  return basename(file.path).replace(/\.jsonl$/, '');
}

const LIMIT_RE = /hit your (\w+) limit.*?resets ([\d:apm.]+)/i;

/**
 * Stream one transcript. Transcripts reach hundreds of megabytes, so lines
 * are read one at a time and never buffered whole.
 *
 * `seen` is shared across every file: a single API response can appear as
 * several transcript lines sharing one message.id, and resumed sessions can
 * duplicate whole transcripts. Both collapse here.
 */
async function parseFile(
  file: TranscriptFile,
  seen: Set<string>,
  out: UsageRecord[],
  signals: Signals,
  limitKeys: Set<string>,
): Promise<void> {
  const sessionId = sessionIdOf(file);
  const stream = createReadStream(file.path, { encoding: 'utf8' });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of lines) {
    // Signals live on user lines too, so the cheap pre-filter has to let those through.
    const mayHaveUsage = line.includes('"usage"');
    const mayHaveSignal = line.includes('"tool_use"') || line.includes('"type":"user"') || line.includes('isApiErrorMessage');
    if (!mayHaveUsage && !mayHaveSignal) continue;
    let parsed: any;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    // Claude Code writes usage-wall notices as ASSISTANT lines flagged
    // isApiErrorMessage — not as user lines. Check before branching on type.
    if (parsed?.isApiErrorMessage) {
      const text = messageText(parsed.message);
      const m = text.match(LIMIT_RE);
      if (m) {
        // Local day, not a slice of the UTC string. A wall hit at 21:00 in
        // Los Angeles is 04:00 the next day in UTC, so slicing files it under
        // tomorrow — and the "across N weeks" figure counts these days.
        const day = localDay(parsed.timestamp ?? '');
        // Retries repeat the identical wall message; one (day, kind, reset) is one event.
        // LIMIT_RE ignores case, so the key uses the same lowercased kind that is stored.
        const kind = m[1]!.toLowerCase();
        const key = `${day}|${kind}|${m[2]}`;
        if (!limitKeys.has(key)) {
          limitKeys.add(key);
          signals.limitEvents.push({ day, kind, resets: m[2]! } as LimitEvent);
        }
      } else if (/overloaded/i.test(text)) {
        signals.overloads++;
      }
      continue;
    }

    if (parsed?.type === 'user') {
      // Every tool result is also a "user" line. Only lines carrying actual
      // prose are turns a human took, and that is what the metric claims.
      if (!parsed.isMeta && isHumanTurn(parsed.message)) signals.userMessages++;
      continue;
    }

    if (parsed?.type !== 'assistant') continue;

    for (const block of parsed.message?.content ?? []) {
      if (block?.type !== 'tool_use' || typeof block.name !== 'string') continue;
      // Every MCP server would otherwise flood the list with one-off names.
      const name = block.name.startsWith('mcp__') ? 'MCP tool' : block.name;
      signals.toolCounts[name] = (signals.toolCounts[name] ?? 0) + 1;
    }
    const message = parsed.message ?? {};
    const usage = message.usage;
    if (!usage) continue;
    const id: string | undefined = message.id ?? parsed.requestId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    signals.sessionCalls[sessionId] = (signals.sessionCalls[sessionId] ?? 0) + 1;
    const model: string = message.model ?? '';
    if (!model || model === '<synthetic>') continue;
    out.push({
      id,
      ts: typeof parsed.timestamp === 'string' ? parsed.timestamp : '',
      model,
      input: num(usage.input_tokens),
      output: num(usage.output_tokens),
      cacheCreate: num(usage.cache_creation_input_tokens),
      cacheRead: num(usage.cache_read_input_tokens),
      project: file.project,
      isSubagent: file.fromSubagentDir || parsed.isSidechain === true,
      skill:
        typeof parsed.attributionSkill === 'string' && parsed.attributionSkill
          ? parsed.attributionSkill
          : null,
    });
  }
}

export async function parseAll(
  files: TranscriptFile[],
): Promise<{ records: UsageRecord[]; signals: Signals }> {
  const seen = new Set<string>();
  const limitKeys = new Set<string>();
  const out: UsageRecord[] = [];
  const signals: Signals = { toolCounts: {}, userMessages: 0, limitEvents: [], overloads: 0, sessionCalls: {} };
  for (const file of files) await parseFile(file, seen, out, signals, limitKeys);
  signals.limitEvents.sort((a, b) => a.day.localeCompare(b.day));
  return { records: out, signals };
}
