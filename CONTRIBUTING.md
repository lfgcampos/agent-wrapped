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

- **Test the real entry point.** A bug once made `npx @lfgcampos/agent-wrapped` a silent
  no-op while every unit test passed, because nothing spawned the binary.
  `test/entrypoint.test.ts` exists to stop that recurring.
- **Fixture data hides display bugs.** Clean, well-separated fixture numbers once
  hid two skill bars rendering identically. Run against your own `~/.claude` and
  look at the output before opening a pull request.

## Releasing

**Merging to `main` releases.** If the `package.json` version on `main` is not
already on npm, `.github/workflows/release.yml` publishes it, tags the commit and
writes the GitHub release. If that version is already published — which is every
ordinary merge — the workflow stops after one registry lookup and does nothing.
There is no tag to remember and no command to run by hand.

So a release is a normal pull request that happens to bump the version:

```sh
# on your branch, in the same change as the code
npm version minor --no-git-tag-version   # patch / minor / major
# write the matching ## [x.y.z] section in CHANGELOG.md
```

`--no-git-tag-version` matters: the workflow creates the tag after a successful
publish, so a tag always means "this exact commit is on npm". A tag pushed by
hand beforehand just gets left alone.

**Write the release notes in the same change as the bump.** Add a `## [x.y.z]`
section to `CHANGELOG.md` describing what the change means for someone using the
tool, not what the commits did. CI fails any pull request whose `package.json`
version has no matching section, and the release workflow checks again before
publishing — npm versions cannot be un-published, so anything that can be
checked early is checked early.

Before publishing anything, the workflow requires:

- `CHANGELOG.md` has a non-empty section for that version,
- that version is not already on npm,
- the full test suite passes,
- the build succeeds, and
- the built binary answers `--version` and `--help`.

That last check exists because a released binary was once a silent no-op while
every unit test passed.

There is **no npm token anywhere** — publishing uses npm trusted publishing
(OIDC), so GitHub Actions mints a short-lived credential scoped to the release
workflow, and npm attaches a provenance attestation automatically.

**Do not rename or move `.github/workflows/release.yml`.** The trusted publisher
is registered against this repository *and this workflow path*. Moving the file
revokes publishing, and the failure surfaces as an authentication error rather
than anything that names the real cause.

**Why it is not tag-driven.** It used to be, and version 0.1.3 was lost to it:
`npm version` bumped `package.json` in one commit, the tag was pushed in another
step that never happened, and the release simply did not exist until somebody
checked npm months later. `npm version` is atomic only when you release from
`main` directly; the moment a bump travels through a pull request, the bump and
the tag are separated by a merge and nothing enforces the second half. Deriving
the release from `package.json` removes the step that can be skipped.

**First-time setup**, recorded here so it is not folklore: the very first version
had to be published by hand, because a trusted publisher is configured against a
package that already exists. Once it did, the trusted publisher was registered on
npmjs.com against this repository and the `release.yml` workflow.

## Why the package is scoped

Recorded so it is not attempted a third time: the unscoped name `agent-wrapped`
cannot be published. npm rejects new names that collide with an existing one once
punctuation is stripped, and [`agentwrapped`](https://www.npmjs.com/package/agentwrapped)
was published in June 2026. `agent-wrapped` normalises to exactly that string, so
the registry refuses it.

The registry returning 404 for `agent-wrapped` does **not** mean the name is
available — that only says nobody has published it. The similarity check runs at
publish time and is the constraint that actually binds. Anyone re-checking this
should test it the same way it will fail: `npm publish --dry-run` under the
unscoped name, not a `GET` against the registry.

`claude-wrapped` and `agentwrap` are taken as well. The scope stays. The binary is
plain `agent-wrapped`, the domain is agent-wrapped.dev, and those are the names
worth defending.

## Pull requests

Keep them focused, include a test, and say what you *considered and rejected* —
that is the part a diff cannot show. If you are changing one of the rules above,
open an issue first; they are all reversible, but each was a decision rather than
an accident.
