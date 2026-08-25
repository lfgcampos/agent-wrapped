# agent-wrapped

A wrapped card for how you actually work with Claude Code — read from your own
transcripts, rendered on your own machine.

```sh
npx agent-wrapped
```

```
  CLAUDE CODE · 31 ACTIVE DAYS                    2026-07-16 → 2026-08-24

         396 : 1
         tokens read for every token written

   98%   of what it read was cache — the same context, re-sent
   42%   of your calls were subagents…
    6%   …but they wrote only that share of the words
   58%   of your writing went to 3 of your 19 repos

  HOW YOU WORK   (% of words written inside a skill — 26% of all work)
  ██████████████  17%  brainstorming
  █████████████░  16%  writing-plans
  █████████░░░░░  12%  test-driven-development
  ███████░░░░░░░   9%  subagent-driven-development
                       …42 skills used · top 4 = 54% of skill work
```

## Nothing leaves your machine

- **No network calls.** There is no server, no account, no analytics, no upload.
  The code makes no HTTP requests of any kind.
- **Zero runtime dependencies.** Nothing is pulled in at run time, so there is no
  third-party code to audit but this.
- **It is a few hundred lines.** Read `src/` end to end in a couple of minutes and
  confirm the two claims above for yourself.

It reads exactly two paths, both read-only: `~/.claude/projects` (your transcripts)
and `~/.claude/settings.json` (to check your retention setting).

Your repository names are never rendered, never logged, and never written to
`--json` output. They are used only as grouping keys and are discarded before
anything is displayed — so a screenshot is safe to post.

## What the numbers mean

Every percentage has a denominator, and the card states it.

| Number | What it divides by |
|---|---|
| **read:write ratio** | every context token read (fresh input + cache writes + cache reads), over tokens written |
| **cache share** | cache reads over *all context read* — not over all tokens |
| **subagent call share** | subagent calls over all calls |
| **subagent written share** | tokens written by subagents over all tokens written |
| **repo concentration** | tokens written in your top 3 repos over all tokens written |
| **skill percentages** | tokens written inside that skill over tokens written inside *any* skill — which is itself only a minority of your work, stated on the card |

Skill shares are weighted by **tokens written**, not by total tokens. Total tokens
are dominated by cache reads, which would flatten every skill to roughly the same
value and tell you nothing.

There are no costs or currency figures anywhere, deliberately. Pricing your usage
at API rates prices a behaviour that only exists *because* it is not billed that
way, so the resulting number is not a saving anyone ever declined.

## Snapshots — build history without keeping the transcripts

Every full run writes a small summary to `~/.agent-wrapped/snapshots/YYYY-MM-DD.json`
and compares against the most recent earlier one:

```
  SINCE YOUR LAST SNAPSHOT   (2026-07-25, 31 days ago)
     ratio     394 : 1  ↑ from 323 : 1
     written   27.6M  ↑ from 15.2M
     streak    4 days  ↓ from 9 days
     top skill writing-plans → brainstorming
```

A snapshot is about **1 KB**, against roughly a gigabyte of transcripts summarised —
so run it on the first of each month and you accumulate years of history for well
under a megabyte, while letting Claude Code delete the raw transcripts as usual.

Snapshots are stored **outside `~/.claude`** on purpose: Claude Code prunes its own
directory on a schedule, and putting the history there would let the very cleanup we
warn about delete the record kept to survive it.

They never leave your machine, and `--no-save` skips writing entirely. Windowed runs
(`--since`) describe a slice rather than your whole history, so they never snapshot.

If you run less often than your retention window, transcripts are deleted while you
are away and the card tells you how much was lost:

```
  ⚠  43 days of history were deleted between these two runs.
     Run more often than your retention window to keep the record whole.
```

## Keep your history

Claude Code deletes transcripts after about 30 days by default, so most people have
a month of data rather than a year.

Keeping more is a disk decision, not a free one. Transcripts are large: a heavy user
writes roughly 25 MB per day, which is about **9 GB for a full year**. So the card
does not tell everyone to keep a year — it measures *your* growth rate and suggests a
horizon that fits, showing the year's cost so you can overrule it knowingly:

```
⚠  41 days of history · 797 MB on disk (24 MB/day)
   Keeping a full year would cost you about 8.8 GB.
   Suggested, in ~/.claude/settings.json:  "cleanupPeriodDays": 60   (~1.4 GB)
```

Whatever you choose only affects data from now on — anything already deleted is gone.

If disk matters more than raw detail, the cheaper path is to leave retention alone and
run this monthly: the snapshots above preserve the trend line for kilobytes.

## Usage

```sh
npx agent-wrapped              # terminal card, all available history
npx agent-wrapped --since 30d  # window: 30d, 12w, 6m, or 2026-08-01
npx agent-wrapped --no-save    # do not write a snapshot
npx agent-wrapped --html       # write a self-contained page and print its path
npx agent-wrapped --json       # raw stats, for your own charts
```

`--since` is also faster than a full run: any transcript last written before the
cutoff is skipped without being opened.

## Development

```sh
npm install
npm test          # type-checks and runs the suite
npm run build
node dist/cli.js
```

Requires Node 20 or newer.

## Licence

MIT
