<!--
For an agent that opens this pull request: fill each section below with plain sentences.
Write "none" in a section that does not apply. Never leave a section empty.
Keep the whole body to what a reviewer cannot read in the diff. Do not list files and do not restate the diff.
Do not narrate the run: no run ledger, no "nobody watched", no session link and no co-author line.
Delete every comment, the ones in the sections included, before you open the pull request.
-->

## What changed for the person who runs the CLI

<!-- One or two sentences, in the words of the pull request title. For an internal change, write "none". -->

## Why

<!-- The reason a reader cannot see in the diff. -->

## Considered and rejected

<!-- CONTRIBUTING.md asks for this: what you weighed and dropped, which a diff cannot show. When none applies, write "none". -->

## Non-negotiable rules

<!-- Say whether the change touches one: no network call ever, no runtime dependency, no currency, no repository name rendered (also in `--json`), no personality scoring, each percentage states its denominator, unsupported data listed and never shown as 0%, local calendar days. When none applies, write "none". -->

## Breaking change and release

<!-- What breaks for a person who runs the CLI, and what they must do. A version bump in `package.json` needs a matching `## [x.y.z]` section in `CHANGELOG.md`. When none applies, write "none". -->

## Deliberately not done

<!-- What a reviewer might expect in this change and will not find. Also name each problem or follow-up that this run found and filed no issue for. When none applies, write "none". -->

## Look first at

<!-- The one or two places where a mistake would cost the most. Name a file, a function or a rule of CONTRIBUTING.md. -->

## Checks

- `npm test`: <!-- pass, fail or not run -->
- Test for the change: <!-- Name the test that fails without the change. -->
- Own data: <!-- Did you run the CLI against your own `~/.claude` and look at the output? Say yes or no. Never paste that data here. -->
- Not verified: <!-- each check you did not run, such as the timezones job. Write "none" only when you ran every check this change needs. -->
