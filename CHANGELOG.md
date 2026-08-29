# Changelog

Notable changes to this project. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html).

Each released version needs a section here — the release workflow reads it as the
GitHub release body and refuses to publish without one.

## [Unreleased]

## [0.2.0]

### Added

- **The terminal card names itself.** One line at the foot of the card reads
  `agent-wrapped.dev`. A screenshot loses every link around it, and that line is
  what tells the next reader what they are looking at. It is a printed string,
  not a network call — the no-telemetry rule is unchanged.
- **Machine-readable documentation.** agent-wrapped.dev now serves `/index.md`
  (the whole page as Markdown), `/llms.txt`, `/robots.txt` and `/sitemap.xml`, and
  the page carries `SoftwareApplication` and `FAQPage` structured data. An agent
  asked about Claude Code usage statistics can fetch plain text instead of
  scraping 13 KB of inline CSS.
- **A questions section** on agent-wrapped.dev, answering where Claude Code keeps
  its transcripts, how long it keeps them, how to change `cleanupPeriodDays`, and
  how the card differs from `/insights`.
- **npm keywords went from seven to eighteen**, adding the terms people actually
  search — `anthropic`, `agent`, `token-usage`, `analytics`, `year-in-review`.

## 0.1.3 — never released

`package.json` was bumped to 0.1.3, but the tag was never pushed and nothing was
published: npm went from 0.1.2 straight to 0.2.0. The commit behind the bump
(37e12bd) changed only release tooling — the CHANGELOG, `release-notes.mjs` and
the release workflow — and touched nothing under `src/`, so the published
artefact would have been byte-identical to 0.1.2.

Recorded rather than quietly renumbered, because the gap is the useful part: a
version bumped in one commit and tagged in another can be lost between the two.
Releasing is now driven by the version in `package.json` rather than by a
hand-pushed tag, so there is no longer a second step to skip, and CI fails any
change whose version has no notes in this file. Publishing itself waits on an
approval, so a merge asks rather than ships.

## [0.1.2]

### Added

- **Shareable image.** The `--html` card now has a **Save as image** button that
  renders a 1200×630 PNG in your browser and saves it locally. Nothing is
  uploaded — the image is drawn on a canvas and saved through an object URL, and
  only aggregate numbers ever reach the page.

### Changed

- **The HTML card is written to `~/.agent-wrapped/card.html`** instead of a
  system temp path. Everything the tool writes now lives in one directory you can
  find again. If you scripted the old temp path, update it; the stale file is
  harmless and your OS will clear it.

### Fixed

- **The "open it with" hint was macOS-only.** Linux and Windows users were told to
  run `open`, which does not exist there. It now prints `xdg-open` or `start` as
  appropriate.

## [0.1.1]

### Fixed

- Package metadata: `homepage` now points at <https://agent-wrapped.dev>.

### Notes

- First release published through GitHub Actions with npm trusted publishing, so
  this is the first build carrying a provenance attestation. No functional change
  to the tool itself.

## [0.1.0]

Initial release.

### Added

- A wrapped card for how you work with Claude Code, read from your own
  transcripts: read:write ratio, cache share, subagent split, repo concentration,
  skill mix, tool mix, turn depth, streaks and rhythm, and usage-limit hits.
- `--since` to limit the window, which is also faster than a full run because
  transcripts older than the cutoff are never opened.
- `--html` for a self-contained page, `--json` for raw stats.
- Snapshots: each full run saves a ~1 KB summary to `~/.agent-wrapped/snapshots/`
  and compares against the previous one, so you can keep a year of history
  without keeping a year of transcripts.
- A size-aware retention warning that measures your own growth rate rather than
  telling everyone to keep a year of transcripts.

[Unreleased]: https://github.com/lfgcampos/agent-wrapped/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/lfgcampos/agent-wrapped/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/lfgcampos/agent-wrapped/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/lfgcampos/agent-wrapped/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/lfgcampos/agent-wrapped/releases/tag/v0.1.0
