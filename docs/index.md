# agent-wrapped

A wrapped card for how you actually work with Claude Code — read from your own transcripts, rendered on your own machine, sent nowhere.

```sh
npx @lfgcampos/agent-wrapped
```

Node 22 or newer. No install, no account, no config.

- Website: <https://agent-wrapped.dev>
- Source: <https://github.com/lfgcampos/agent-wrapped>
- Package: <https://www.npmjs.com/package/@lfgcampos/agent-wrapped>
- Licence: MIT

## What it prints

```
  CLAUDE CODE · 33 ACTIVE DAYS              2026-07-16 → 2026-08-25

         394 : 1
         tokens read for every token written

  4-day streak · longest 18 · you work most at 3pm
  ▂▂▂▅▅▁▁▁▁▁▁▂▁▁▂█▆▇▃▄▅▆▆▃   19% of your writing is weekend work
  00                      23

   98%   of what it read was cache — the same context, re-sent
   42%   of your calls were subagents…
    6%   …but they wrote only that share of the words
   58%   of your writing went to 3 of your 19 repos

  WHAT YOU REACH FOR                (% of 49,566 tool calls)
  ██████████████  62%  Bash
  ███░░░░░░░░░░░  14%  Read
  ██░░░░░░░░░░░░  13%  Edit
  █░░░░░░░░░░░░░   4%  Write

  15.2 agent turns for every message you send · 733 sessions

  BATTLE SCARS
     4   times you hit the usage limit, across 3 weeks
    14   times the server was overloaded on you
```

## Options

| Flag | What it does |
|---|---|
| `--since <window>` | Limit to a window: `30d`, `12w`, `6m`, or a date like `2026-08-01`. Faster than a full run — transcripts older than the cutoff are never opened. |
| `--html` | Write a self-contained page to `~/.agent-wrapped/card.html`, with a Save-as-image button that renders a 1200×630 PNG in your browser. |
| `--json` | Print the raw stats, for your own charts. |
| `--no-save` | Skip writing this run's snapshot. |
| `--version`, `-v` | Print the version. |
| `--help`, `-h` | Print help. |

## What each number divides by

Every percentage names its denominator, because the same figure can be honest two different ways.

| Number | Divided by |
|---|---|
| read:write ratio | every context token read (fresh input + cache writes + cache reads), over tokens written |
| cache share | cache reads over *all context read* — not over all tokens |
| subagent shares | calls over all calls; written tokens over all written tokens. Reported as a pair on purpose: subagents read heavily and write little |
| repo concentration | tokens written in your top 3 repos over all tokens written |
| skill percentages | tokens written inside that skill over tokens written inside *any* skill |
| tool mix | calls to that tool over all tool calls |
| streak | consecutive local calendar days with activity; "current" only if it reaches today or yesterday |

Skill and repo shares are weighted by tokens written, not total tokens. Totals are dominated by cache reads, which would flatten everything to roughly the same value.

There are no costs or currency figures anywhere, deliberately. Pricing local usage at API rates values a behaviour that only exists *because* it is not billed that way, so the number would be fiction rather than a saving.

## Questions

### How do I see my Claude Code usage statistics?

Run `npx @lfgcampos/agent-wrapped` in a terminal. It reads the transcripts Claude Code already keeps on your machine and prints a summary card — token read:write ratio, cache share, subagent share, tool mix, session counts, streaks and your hourly rhythm. Nothing is uploaded and no model is called, so it returns in seconds.

### Where does Claude Code store its transcripts and conversation history?

In `~/.claude/projects`, as JSONL files — one directory per project, one file per session. Your settings, including retention, live in `~/.claude/settings.json`. Those are the only two paths agent-wrapped reads, both read-only.

### How long does Claude Code keep transcripts?

About 30 days by default, after which older transcripts are deleted. The setting is `cleanupPeriodDays` in `~/.claude/settings.json`. Most people therefore have a month of history rather than a year, which is why agent-wrapped warns you before that window closes on data you have not summarised yet.

### How do I stop Claude Code from deleting my history?

Raise `cleanupPeriodDays` in `~/.claude/settings.json`. It is not free: a heavy user writes roughly 25 MB of transcripts a day, so a full year is around 9 GB. agent-wrapped measures *your* growth rate and suggests a horizon that fits, showing what a year would actually cost so you can overrule it knowingly. Changing the setting only affects data from now on — anything already deleted is gone.

The cheaper alternative is to keep the 30-day default and run agent-wrapped monthly. Each run saves a ~1 KB snapshot to `~/.agent-wrapped/snapshots/`, so years of history cost under a megabyte. Snapshots live outside `~/.claude` deliberately, so the very cleanup this tool warns about cannot delete the record kept to survive it.

### Is there a Claude Code Wrapped?

Not an official one. agent-wrapped is a third-party, MIT-licensed CLI that builds the equivalent from the transcripts already on your disk, at any time of year rather than once each December.

### Does agent-wrapped send my data anywhere?

No. There are no network calls at all — no server, no account, no analytics, no version check — and zero runtime dependencies, so there is no third-party code in the package. It is about a thousand lines of TypeScript; you can read `src/` and confirm both claims yourself.

Your repository names are never rendered, never logged, and never written to `--json`. They are used as grouping keys and discarded before anything is displayed, so a screenshot of the card is safe to post.

### How is this different from Claude Code's `/insights`?

They answer different questions. `/insights` asks a model to write a narrative about what it was *like* working with Claude — friction, satisfaction, interruptions. It costs tokens and takes time. agent-wrapped answers *what does my usage look like as a number*, deterministically and instantly, with no model call, in a form you can share.

### Does it work with Cursor, Codex, or other coding agents?

Not yet. It reads Claude Code's transcript format specifically. Support for other agents is a reasonable feature request — open an issue on GitHub.

### What are the requirements?

Node 22 or newer. Tested on Node 22, 24 and 26, on Linux, macOS and Windows, and across four timezones — day boundaries are computed locally, and that is easy to get wrong.

## Author

Lucas Campos — [Substack](https://lfgcampos.substack.com) · [LinkedIn](https://www.linkedin.com/in/lfgcampos/) · [GitHub](https://github.com/lfgcampos)
