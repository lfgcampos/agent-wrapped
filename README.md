# agent-wrapped

**A wrapped card for how you actually work with Claude Code** — read from your own
transcripts, rendered on your own machine, sent nowhere.

**[agent-wrapped.dev](https://agent-wrapped.dev)**

```sh
npx @lfgcampos/agent-wrapped
```

The package is scoped; the command it installs is plain `agent-wrapped`, so after a
global install you just run that.

```
  CLAUDE CODE · 33 ACTIVE DAYS                  2026-07-16 → 2026-08-25

         394 : 1
         tokens read for every token written

  4-day streak · longest 18 · you work most at 3pm
  ▂▂▂▅▅▁▁▁▁▁▁▂▁▁▂█▆▇▃▄▅▆▆▃   19% of your writing is weekend work
  00                      23

   98%   of what it read was cache — the same context, re-sent
   42%   of your calls were subagents…
    6%   …but they wrote only that share of the words
   58%   of your writing went to 3 of your 19 repos

  WHAT YOU REACH FOR                    (% of 49,566 tool calls)
  ██████████████  62%  Bash
  ███░░░░░░░░░░░  14%  Read
  ██░░░░░░░░░░░░  13%  Edit
  █░░░░░░░░░░░░░   4%  Write

  15.2 agent turns for every message you send · 733 sessions

  BATTLE SCARS
     4   times you hit the usage limit, across 3 weeks
    14   times the server was overloaded on you
```

Add `--html` for a self-contained page at `~/.agent-wrapped/card.html`. It has a
**Save as image** button that renders a 1200×630 PNG for sharing — drawn in your
own browser, never uploaded anywhere.

## Nothing leaves your machine

- **No network calls.** No server, no account, no analytics, no version check.
- **Zero runtime dependencies.** No third-party code to audit but this.
- **It is about a thousand lines.** Read `src/` and confirm both claims yourself.

It reads exactly two paths, both read-only: `~/.claude/projects` (your transcripts)
and `~/.claude/settings.json` (to check your retention setting).

**Your repository names are never rendered**, never logged, and never written to
`--json`. They are used as grouping keys and discarded before anything is displayed,
so a screenshot is safe to post.

## Usage

```sh
npx @lfgcampos/agent-wrapped                 # terminal card, all available history
npx @lfgcampos/agent-wrapped --since 30d     # window: 30d, 12w, 6m, or 2026-08-01
npx @lfgcampos/agent-wrapped --html          # writes ~/.agent-wrapped/card.html
npx @lfgcampos/agent-wrapped --json          # raw stats, for your own charts
npx @lfgcampos/agent-wrapped --no-save       # skip writing a snapshot
npx @lfgcampos/agent-wrapped --help
```

`--since` is *faster* than a full run: any transcript last written before the cutoff
is skipped without being opened.

## Build history without hoarding transcripts

Every full run saves a summary to `~/.agent-wrapped/snapshots/YYYY-MM-DD.json` and
compares against the most recent earlier one:

```
  SINCE YOUR LAST SNAPSHOT   (2026-07-25, 31 days ago)
     ratio     394 : 1  ↑ from 323 : 1
     written   27.6M  ↑ from 15.2M
     streak    4 days  ↓ from 9 days
     top skill writing-plans → brainstorming
```

A snapshot is about **1 KB** against roughly a gigabyte of transcripts summarised.
Run it on the first of each month and you accumulate years of history for well under
a megabyte — while letting Claude Code delete the raw transcripts as usual.

Snapshots live **outside `~/.claude`** deliberately: Claude Code prunes its own
directory on a schedule, and storing history there would let the very cleanup this
tool warns about delete the record kept to survive it.

If you run less often than your retention window, transcripts are deleted while you
are away, and the card tells you how much was lost:

```
  ⚠  43 days of history were deleted between these two runs.
```

## Keeping more raw history is a disk decision

Claude Code deletes transcripts after about 30 days by default, so most people have a
month of data rather than a year. Keeping more is not free — a heavy user writes
roughly 25 MB per day, which is about **9 GB for a year**. So the card measures *your*
growth rate and suggests a horizon that fits, showing the year's cost so you can
overrule it knowingly:

```
  ⚠  41 days of history · 799 MB on disk (24 MB/day)
     Keeping a full year would cost you about 8.8 GB.
     Suggested, in ~/.claude/settings.json:  "cleanupPeriodDays": 60   (~1.5 GB)
```

Either way it only affects data from now on — anything already deleted is gone.

## What the numbers mean

Every percentage states its denominator, because the same figure can be honest two
different ways.

| Number | Divided by |
|---|---|
| **read:write ratio** | every context token read (fresh input + cache writes + cache reads), over tokens written |
| **cache share** | cache reads over *all context read* — not over all tokens |
| **subagent shares** | calls over all calls; written tokens over all written tokens. Reported as a pair on purpose: subagents read heavily and write little |
| **repo concentration** | tokens written in your top 3 repos over all tokens written |
| **skill percentages** | tokens written inside that skill over tokens written inside *any* skill — itself a minority of your work, stated on the card |
| **tool mix** | calls to that tool over all tool calls |
| **streak** | consecutive local calendar days with activity; "current" only if it reaches today or yesterday |

Skill and repo shares are weighted by **tokens written**, not total tokens. Totals are
dominated by cache reads, which would flatten everything to roughly the same value.

There are no costs or currency figures anywhere, deliberately. Pricing local usage at
API rates values a behaviour that only exists *because* it is not billed that way, so
the number would be fiction rather than a saving.

## How does this relate to `/insights`?

They complement each other. Claude Code's built-in `/insights` asks a model to write a
narrative about *what it was like* working with Claude — friction, satisfaction,
interruptions. It costs tokens and takes time.

`agent-wrapped` answers a different question — *what does my usage look like as a
number* — deterministically, instantly, with no model call, in a form you can share.

## Requirements

Node 22 or newer. Tested on Node 22, 24 and 26, on Linux, macOS and Windows, and
across four timezones — day boundaries are computed locally, and that is easy to get
wrong.

## Releasing

Tag-driven and automated — see [CONTRIBUTING.md](CONTRIBUTING.md#releasing).
Published with npm trusted publishing (OIDC), so every release carries a
provenance attestation and no long-lived token exists to leak.

## Contributing

Pull requests welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first — it lists
the handful of design rules that are deliberate (no network calls, no dependencies, no
currency, no personality scoring) so you do not spend effort on a change that gets
turned down for a reason that was never written down.

## Who made this

Built by **Lucas Campos** — [LinkedIn](https://www.linkedin.com/in/lfgcampos/) ·
[GitHub](https://github.com/lfgcampos).

I write about engineering leadership and AI-assisted development at
[lfgcampos.substack.com](https://lfgcampos.substack.com).

Also mine: **[whatkindof.dev](https://whatkindof.dev)** — a developer personality
test for the AI era. That one asks how you *think* you work; this one reads what
your logs actually say.

## Licence

[MIT](LICENSE) © Lucas Campos
