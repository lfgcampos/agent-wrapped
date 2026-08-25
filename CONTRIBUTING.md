# Contributing

Thanks for looking. This is a small tool with strong opinions, so the fastest way
to get a change merged is to know which ones are deliberate.

## Getting started

```sh
npm install
npm test        # type-checks and runs the suite
npm run build
node dist/cli.js
```

Node 22 or newer. There are no runtime dependencies and only two dev
dependencies (`typescript`, `@types/node`) — please keep it that way.

## The rules that are not up for negotiation

These exist for reasons that are easy to miss and expensive to rediscover.

**No network calls, ever.** No telemetry, no analytics, no version check, no
"anonymous" usage ping. The entire value of this tool is that you can read it in
ten minutes and confirm it only reads your disk. A single `fetch` destroys that,
however well-intentioned.

**No runtime dependencies.** Same reason: every dependency is code a user would
have to audit to trust the claim above.

**No currency, anywhere.** Pricing local usage at API rates values a behaviour
that only exists *because* it is not billed that way — nobody paying per token
runs at maximum effort on every call. It is not a saving anyone declined, so the
number would be fiction. There is deliberately no price table in this codebase.

**Repository names are never rendered.** They are grouping keys, discarded before
display, and that includes `--json` output. People screenshot this tool; a client
name in the output is somebody's problem.

**No personality scoring.** Ratios are shown; conclusions about the person are
not. A tool that tells you what kind of developer you are, wrongly, on first run,
loses the trust that makes the factual panels worth reading.

**Percentages state their denominator.** "14% of skill work" and "2% of all work"
can be the same number. If a panel shows a share, the label says a share of what.

**Local calendar days, never UTC string slicing.** Timestamps are UTC. Slicing
the ISO string gives every user the UTC answer and splits an evening session
across two days for anyone west of Greenwich. This broke streaks once already.

## Testing

Tests are `node:test` with no framework. Two things worth knowing:

- **Test the real entry point.** A bug once made `npx agent-wrapped` a silent
  no-op while every unit test passed, because nothing spawned the binary.
  `test/entrypoint.test.ts` exists to stop that recurring.
- **Fixture data hides display bugs.** Clean, well-separated fixture numbers once
  hid two skill bars rendering identically. Run against your own `~/.claude` and
  look at the output before opening a pull request.

## Releasing

Releases are tag-driven and fully automated. There is **no npm token anywhere** —
publishing uses npm trusted publishing (OIDC), so GitHub Actions mints a
short-lived credential scoped to the release workflow, and npm attaches a
provenance attestation automatically.

To cut a release, bump the version and push the tag:

```sh
npm version patch     # or minor / major — bumps package.json, commits, tags
git push --follow-tags
```

Pushing the tag triggers `.github/workflows/release.yml`, which refuses to
publish unless:

- the tag matches the `package.json` version exactly,
- that version is not already on npm,
- the full test suite passes,
- the build succeeds, and
- the built binary answers `--version` and `--help`.

That last check exists because a released binary was once a silent no-op while
every unit test passed.

**First-time setup**, recorded here so it is not folklore: the very first version
had to be published by hand, because a trusted publisher is configured against a
package that already exists. Once it did, the trusted publisher was registered on
npmjs.com against this repository and the `release.yml` workflow.

## Pull requests

Keep them focused, include a test, and say what you *considered and rejected* —
that is the part a diff cannot show. If you are changing one of the rules above,
open an issue first; they are all reversible, but each was a decision rather than
an accident.
