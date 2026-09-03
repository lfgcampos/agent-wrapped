# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [semantic versioning](https://semver.org/spec/v2.0.0.html).

Each released version needs a section here — the release workflow reads it as the GitHub release body and refuses to publish without one.

## [Unreleased]

### Added

- **Which model did the writing.** The card names the model most of your words came from, as a share of all tokens written, next to how many models you used at all. The model was already on every transcript record and was being discarded before it reached the card. Ids are normalised to the name a person would say — `claude-sonnet-4-5-20250929` becomes `Sonnet 4.5` — and two context tiers of one model (`claude-opus-5` and `claude-opus-5[1m]`) count as one model rather than two. Two naming eras are in play and they order the parts oppositely, so the family is read as the first non-numeric segment rather than by position; an id that still does not parse is printed as it arrived, because a wrong model name is worse than a raw one.
- **Day coverage in the header.** `33 ACTIVE DAYS` became `33 OF 41 DAYS ACTIVE` — the same figure, against the span it was measured over. For most people that span is their retention window rather than a period they chose, which is why the window itself is printed on the same line.
- **Longest unbroken stretch**, on the rhythm line: the longest run of calls with no pause over 30 minutes in it, as `5h 48m at a stretch`. Deliberately *not* the span of a session. Claude Code resumes sessions, so one session id can cover days of wall clock with a weekend in the middle, which measures bookkeeping rather than work.
- **Both new figures are recorded in snapshots**, so a later run can show them moving. They are optional fields on the existing version 1 snapshot rather than a version 2, because `loadPrevious` accepts version 1 only — bumping it would discard every snapshot already on disk. A delta against a snapshot written before these fields omits those rows instead of inventing them.

### Changed

- **`detectRetention` no longer measures the history window itself.** It reads the span `computeStats` already computed, so the "N days of history" in the retention warning and the day coverage in the header cannot drift apart.

## [0.2.0]

### Added

- **The terminal card names itself.** One line at the foot of the card reads `agent-wrapped.dev`. A screenshot loses every link around it, and that line is what tells the next reader what they are looking at. It is a printed string, not a network call — the no-telemetry rule is unchanged.
- **Machine-readable documentation.** agent-wrapped.dev now serves `/index.md` (the whole page as Markdown), `/llms.txt`, `/robots.txt` and `/sitemap.xml`, and the page carries `SoftwareApplication` and `FAQPage` structured data. An agent asked about Claude Code usage statistics can fetch plain text instead of scraping 13 KB of inline CSS.
- **A questions section** on agent-wrapped.dev, answering where Claude Code keeps its transcripts, how long it keeps them, how to change `cleanupPeriodDays`, and how the card differs from `/insights`.
- **npm keywords went from seven to eighteen**, adding the terms people actually search — `anthropic`, `agent`, `token-usage`, `analytics`, `year-in-review`.

## 0.1.3 — never released

`package.json` was bumped to 0.1.3 and `v0.1.3` was tagged and pushed, but nothing was published: npm went from 0.1.2 straight to 0.2.0.

The release run failed at *Extract release notes from CHANGELOG*, because there was no `## [0.1.3]` section for it to find, and every step after it — test, build, publish — was skipped. The tag was deleted afterwards, leaving `package.json` naming a version that existed nowhere else.

The commit behind the bump (37e12bd) is the same one that introduced this file, `release-notes.mjs` and that very check. It changed only release tooling and touched nothing under `src/`, so the artefact would have been byte-identical to 0.1.2 in any case.

Recorded rather than quietly renumbered, because the mechanism is the useful part: the gate worked exactly as designed and still cost a stranded version number and a deleted tag, purely because it could not run until a tag already existed. CI now runs the same check on every pull request, where a missing section is a red build instead of a cleanup job, and releasing is driven by the version in `package.json` rather than by a hand-pushed tag, so there is no longer a second step to skip. Publishing waits on an approval, so a merge asks rather than ships.

## [0.1.2]

### Added

- **Shareable image.** The `--html` card now has a **Save as image** button that renders a 1200×630 PNG in your browser and saves it locally. Nothing is uploaded — the image is drawn on a canvas and saved through an object URL, and only aggregate numbers ever reach the page.

### Changed

- **The HTML card is written to `~/.agent-wrapped/card.html`** instead of a system temp path. Everything the tool writes now lives in one directory you can find again. If you scripted the old temp path, update it; the stale file is harmless and your OS will clear it.

### Fixed

- **The "open it with" hint was macOS-only.** Linux and Windows users were told to run `open`, which does not exist there. It now prints `xdg-open` or `start` as appropriate.

## [0.1.1]

### Fixed

- Package metadata: `homepage` now points at <https://agent-wrapped.dev>.

### Notes

- First release published through GitHub Actions with npm trusted publishing, so this is the first build carrying a provenance attestation. No functional change to the tool itself.

## [0.1.0]

Initial release.

### Added

- A wrapped card for how you work with Claude Code, read from your own transcripts: read:write ratio, cache share, subagent split, repo concentration, skill mix, tool mix, turn depth, streaks and rhythm, and usage-limit hits.
- `--since` to limit the window, which is also faster than a full run because transcripts older than the cutoff are never opened.
- `--html` for a self-contained page, `--json` for raw stats.
- Snapshots: each full run saves a ~1 KB summary to `~/.agent-wrapped/snapshots/` and compares against the previous one, so you can keep a year of history without keeping a year of transcripts.
- A size-aware retention warning that measures your own growth rate rather than telling everyone to keep a year of transcripts.

[Unreleased]: https://github.com/lfgcampos/agent-wrapped/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/lfgcampos/agent-wrapped/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/lfgcampos/agent-wrapped/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/lfgcampos/agent-wrapped/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/lfgcampos/agent-wrapped/releases/tag/v0.1.0
