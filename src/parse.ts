import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { TranscriptFile, UsageRecord } from './types.js';

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Stream one transcript. Transcripts reach hundreds of megabytes, so lines
 * are read one at a time and never buffered whole.
 *
 * `seen` is shared across every file: a single API response can appear as
 * several transcript lines sharing one message.id, and resumed sessions can
 * duplicate whole transcripts. Both collapse here.
 */
async function parseFile(file: TranscriptFile, seen: Set<string>, out: UsageRecord[]): Promise<void> {
  const stream = createReadStream(file.path, { encoding: 'utf8' });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.includes('"usage"')) continue; // cheap pre-filter before JSON.parse
    let parsed: any;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (parsed?.type !== 'assistant') continue;
    const message = parsed.message ?? {};
    const usage = message.usage;
    if (!usage) continue;
    const id: string | undefined = message.id ?? parsed.requestId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
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

export async function parseAll(files: TranscriptFile[]): Promise<UsageRecord[]> {
  const seen = new Set<string>();
  const out: UsageRecord[] = [];
  for (const file of files) await parseFile(file, seen, out);
  return out;
}
