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

Releasing is one approval click. There is nothing to run locally, and merging on
its own never publishes.

A release is an ordinary pull request that happens to bump the version:

```sh
# on your branch, in the same change as the code
npm version minor --no-git-tag-version   # patch / minor / major
# write the matching ## [x.y.z] section in CHANGELOG.md
```

`--no-git-tag-version` matters: the workflow creates the tag itself after a
successful publish, so a tag always means "this exact commit is on npm".

When that merges, `.github/workflows/release.yml` runs in two stages:

1. **verify** — asks npm whether `package.json`'s version is already published.
   If it is, which is every ordinary merge, the workflow stops there. If it is
   not, it proves the release is sound: notes exist, tests pass, the build
   succeeds, and the built binary answers `--version` and `--help`.
2. **publish** — waits for a human to approve the `npm-publish` environment, then
   publishes, tags the commit and writes the GitHub release.

GitHub emails you when a run is waiting. Approving takes one click from the
Actions tab or your phone. Until then nothing is published, and no credential
has been minted — `id-token: write` is granted to the publish job alone, so
nothing before the gate can obtain one.

**Write the release notes in the same change as the bump.** CI fails any pull
request whose `package.json` version has no matching `## [x.y.z]` section in
`CHANGELOG.md`, and the release workflow checks again before publishing. npm
versions cannot be un-published, so anything that can be checked early is.

### Who can publish

Only whoever is listed as a required reviewer on the `npm-publish` environment.
Merge access and release authority are deliberately separate: reviewing a
contributor's pull request should not be the same click as shipping it to
everyone.

Three things hold that boundary, and the third is the only one that is a real
boundary rather than a habit:

1. **The environment gate** in `release.yml`. **This does nothing until you
   configure it.** An environment named in a workflow but absent from repository
   settings is created automatically *with no protection rules*, so the job
   sails straight through. Go to **Settings → Environments → npm-publish**, add
   yourself under **Required reviewers**, and confirm a run actually pauses
   before trusting it.
2. **`.github/CODEOWNERS`**, so a pull request touching the release path needs
   your review. This is a review requirement, not a permission boundary — it
   raises the cost of a bad change reaching `main`, it does not prevent one.
3. **The npm-side environment binding**, which is what actually holds. On
   npmjs.com, under the package's trusted publisher settings, set the GitHub
   environment to `npm-publish`. npm then refuses any OIDC token that did not
   come from a job running in that environment. Without this, a pull request
   that deletes the `environment:` block from `release.yml` removes the gate and
   publishes on merge; with it, the same edit produces a token npm rejects. Set
   it once, on npmjs.com, where a commit cannot reach it.

**Do not rename or move `.github/workflows/release.yml`.** The trusted publisher
is registered against this repository *and this workflow path*. Moving the file
revokes publishing, and the failure surfaces as an authentication error rather
than anything naming the real cause.

### Why it is not tag-driven

It used to be, and version 0.1.3 was lost to it. `npm version` bumped
`package.json` and tagged `v0.1.3`, the tag was pushed, and the release run
failed on the missing CHANGELOG section — correctly, but only after the tag
existed. The tag was deleted to clean up, and `package.json` was left naming a
version published nowhere, which is where it stayed until 0.2.0.

Nothing there was careless; the checks fired exactly as designed. The problem
was *when* they could fire. A tag-driven release cannot validate anything until
somebody has already tagged, so the cheapest failure — no release notes — costs
a tag and a manual cleanup instead of a red build on a pull request.

Deriving the release from `package.json` moves every check to a point where
failing is free, and the approval gate puts the deliberate human decision back
where it belongs — on publishing, not on tag syntax.

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

Every pull request requests the owner's review, via `.github/CODEOWNERS`. That
file only requests a review on its own; it blocks a merge only when branch
protection on `main` has **Require review from Code Owners** enabled alongside
**Require a pull request before merging**.

The one status check to require is **`ci-ok`**. `test` and `timezones` are matrix
jobs that report as `test (22, ubuntu-latest)` and so on, so a rule naming either
of them waits forever for a check that never arrives; `ci-ok` depends on all
three jobs and fails if any of them does. Requiring it rather than the matrix
names also means adding a Node version or a timezone needs no change to branch
protection, and cannot silently go unenforced.

One consequence, recorded because it looks like a misconfiguration when you hit
it: GitHub does not let anyone approve their own pull request, so with a single
code owner those rules block the owner's own work too. The fix is to leave
admin bypass available — do *not* enable "Do not allow bypassing the above
settings" — so the rule does what it is there for, which is stopping a
contributor's pull request from merging unreviewed, rather than locking the one
maintainer out of their own repository.
