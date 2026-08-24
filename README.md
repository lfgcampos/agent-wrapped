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

## Keep your history

Claude Code deletes transcripts after about 30 days by default, so most people have
a month of data rather than a year. If the card warns you about this, the fix is one
line in `~/.claude/settings.json`:

```json
{ "cleanupPeriodDays": 365 }
```

That only affects data from now on — anything already deleted is gone.

## Usage

```sh
npx agent-wrapped           # terminal card
npx agent-wrapped --html    # write a self-contained page and print its path
npx agent-wrapped --json    # raw stats, for your own charts
```

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
