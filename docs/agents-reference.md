# Agent reference

Background for rules in [`AGENTS.md`](../AGENTS.md). Every rule lives there;
this file holds the reasoning and history behind them, so the rules file stays
under Antigravity's 24,000-byte cap without losing why a rule exists.

## Test layout

- `src/utils/parseGedcom.test.ts` — GEDCOM parser: tokenization, tree building, family
  links, relationship labels, ancestor collection.
- `src/utils/geocode.test.ts` — geocoding: place splitting, feature ranking, progressive
  query shortening, concurrent ancestor geocoding.
- `src/components/StatsOverlay.test.tsx` — stats display: counts, unmapped sections.
- `src/components/PersonPicker.test.tsx` — person picker: rendering, search filtering,
  selection.
- `src/components/AncestorSidebar.test.tsx` — sidebar: generation grouping, search,
  open/close.
- `src/components/MiniMap.test.ts` — Mercator projection math.
- `src/ThemeContext.test.tsx` — theme toggling and persistence.

## Node version

- **Why `.nvmrc` and `engines.node` must agree.** `.nvmrc` feeds CI's
  `setup-node` (`node-version-file`), `nvm use`, and the session-start hook;
  `engines.node` feeds the build image and npm's EBADENGINE warning. A split
  goes green on one runtime while the deployed build runs another. CI once ran
  a hard-coded `22` while nothing else pinned anything, which is how the drift
  started — hence `node-version-file: .nvmrc` and `nodeVersion.test.js`.
- **Why the hook re-resolves every run.** Container state survives between
  sessions, so an existence-only check would pin the first version ever
  installed. An unreachable nodejs.org keeps the cached toolchain and says so
  rather than failing session startup.
- **Provisioning vs. reaching the session.** The hook exports `PATH` and writes
  it to `$CLAUDE_ENV_FILE`, but that variable is not always set (it is unset in
  the web sandbox today); then the export reaches only the hook and its
  children. `/opt/node24` once sat correctly provisioned while every agent shell
  ran the image's Node 22, on an npm too old to honor `.npmrc`'s cooldown. A
  shell rc file is not the fallback: the harness snapshots the environment
  before hooks run, so an rc edit lands a session late while looking like it
  worked. So the fallback changes what the *name* resolves to: symlinks for
  `node`/`npm`/`npx` (and `deno` where the hook installs one) in the first
  `PATH` directory under `$HOME` that exists — creating only `~/.local/bin`,
  never another tool's missing directory such as `~/.nix-profile/bin`.
- **The three refusals.** It links nothing if any tool is missing or
  unrunnable in the source; nothing if any *earlier* `PATH` entry still supplies
  one of the names (asked per tool, since node and npm need not share a
  directory); nothing over a real file. All three are decided before the first
  link, because a half-linked toolchain is a split one, worse than the fallback
  it replaces. It does not stop at whichever directory currently answers: from
  the second session on that is the shim directory itself, and refusing to touch
  its own links would strand every later `.nvmrc` major on the old runtime.
- **Why Renovate can't bump Node.** `.nvmrc` holds the bare major on purpose —
  every consumer resolves the newest release itself — but Renovate's nvm
  manager can only write a full version, so `Update Node.js to v24.18.1`
  rewrote `.nvmrc` to `24.18.1` and `nodeVersion.test.js` failed it, in all
  three repos, every time a Node patch shipped. There was never a mergeable
  version of that PR.

## Dependency updates

- **Why Renovate is off.** The config kept producing PRs that were unmergeable
  or harmful: Node patches that could never go green, and — once
  `constraints.npm` was added — an auto-merge-eligible npm floor above what the
  pinned Node major bundles. `"enabled": false` makes the job log
  `Repository is disabled` and create nothing: no PRs, no `renovate/*`
  branches, no dashboard, and no vulnerability-alert PRs, since a disabled repo
  is skipped before alerts are considered.
- **Why Dependabot security updates are off (2026-09-11).** A grouped security
  update for a transitive `@vitest/mocker` advisory arrived as a vitest 4 → 5
  major when the patched 4.1.11 sat inside the declared range: grouped security
  updates resolve to the latest version, not the lowest fixed one.
- **`mode=silent`.** The Mend-hosted app injects its own config via
  `RENOVATE_CONFIG` and defaults an "All repositories" install to silent: no
  PRs, no `renovate/*` branches, no dashboard, not even an onboarding PR. A
  silent run clones, scans, extracts, creates nothing, and reports `DONE`, so a
  job list of `DONE` looks identical to a repo with nothing to update.
- **Schedules.** This repo once ran a Saturday 06:00–12:00 window that added up
  to six days on top of the cooldowns for no benefit; a window only parks
  updates that have already cooled down. Renovate forces `schedule: []` and
  `prCreation: immediate` on vulnerability-alert branches.
- **`minimumReleaseAge` is a lookup-time filter.** It only ever governed the
  direct dependency a PR names. Lock file maintenance never does a lookup — it
  deletes the lockfile and lets npm rebuild it — and those PRs auto-merge, so
  the highest-volume path to production had no cooldown; transitive
  dependencies escaped the same way inside ordinary bumps. npm's own
  `min-release-age` in `.npmrc` is enforced while resolving, so it covers both.
- **The npm floor.** `min-release-age` landed in npm 11.10.0 and is silently
  ignored before it ("Unknown project config"). Node bundles vary within a
  major — 24.12.0 ships npm 11.6.2 (no), 24.14.1 ships 11.11.0 (yes) — so the
  floor is declared, not inferred. Adding `constraints.npm` made Renovate start
  managing it: within minutes it opened `>=11.18.0` (a minor, auto-merge
  eligible) and `v12` in all three repos, both above the npm Node 24 bundles
  (24.18.1 ships 11.16.0), and a lower-bound test did not catch it because a
  floor that is too high still clears a `>=` check. Hence `npm` disabled in
  `packageRules` and the guard pinning the floor exactly.

## Commit messages

- **Why there is no `deps:` prefix.** `.github/workflows/npm-update.yml` used to
  write `deps:` on the weekly batch, which is how 33 of 50 commits ended up
  reading `deps: Update dependencies (<date>)` with nothing to say whether the
  app changed.

## Branching

- **Why a merged branch name isn't reset without asking.** No short check
  separates "already merged" from "not yet merged": a rebase merge rewrites the
  commits, a squash merge collapses them, `main` moves on so a tip-to-tip diff
  reports upstream drift as branch work, the remote ref can hold a commit the
  local one doesn't, and no tree comparison sees uncommitted work a `--hard`
  reset would erase. `--force-with-lease` is no safety net either: fetching
  updates the ref the lease compares against. Confirming costs one question in
  a rare situation; guessing costs someone their work.
- **Why a PR never opens on a commit that already carried one.** The `codex`
  status belongs to the commit and records nothing about which PR earned it, so
  a PR on the byte-identical head of a closed one inherits its verdict. The
  verdict sweep (`codex-review.yml`, the shared mikelward/codex-review action)
  resets it to `pending` within about a minute, but that races merge
  eligibility.
