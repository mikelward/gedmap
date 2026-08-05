# GedMap

Client-side GEDCOM file analyzer that visualizes ancestor birthplaces on a Mapbox map.

## Tech Stack

- React 19, Vite 8, Tailwind CSS 4, Vitest
- Mapbox GL JS for map rendering
- HERE Geocoding API for place lookups

## Development

```sh
npm install
npm run dev        # Start dev server
npm run build      # Production build
npm run lint       # ESLint
```

## Testing

```sh
npm test              # Run all tests once
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with V8 coverage report
```

Tests use [Vitest](https://vitest.dev/) with jsdom for component tests. Test files
live next to their source files using the `*.test.{js,jsx}` convention.

### Test structure

- `src/utils/parseGedcom.test.js` — GEDCOM parser: tokenization, tree building, family links, relationship labels, ancestor collection
- `src/utils/geocode.test.js` — Geocoding: place splitting, feature ranking, progressive query shortening, concurrent ancestor geocoding
- `src/components/StatsOverlay.test.jsx` — Stats display: counts, unmapped sections
- `src/components/PersonPicker.test.jsx` — Person picker: rendering, search filtering, selection
- `src/components/AncestorSidebar.test.jsx` — Sidebar: generation grouping, search, open/close
- `src/components/MiniMap.test.jsx` — Mercator projection math
- `src/ThemeContext.test.jsx` — Theme toggling and persistence

### Writing tests

- Utility tests: import functions directly, use mock search functions for geocoding
- Component tests: use `@testing-library/react`, wrap with `<ThemeProvider>` if the component uses `useTheme()`
- The geocode tests set `import.meta.env.VITE_HERE_API_KEY` via `vi.hoisted()` and mock `fetch` to avoid real API calls

## Workflow

Keep this file short and concrete — add a new rule the first time something
bites, not the third.

- **Always add tests.** Every new function, hook, or component needs at least
  one test that exercises its behavior. Bug fixes get a regression test that
  fails before the fix.
- **Always run tests before reporting a task done.** `npm test`, `npm run lint`,
  and `npm run build` (when touching build config) must pass.
- **Fix any preexisting test failures as the *first* commit of the series.**
  Don't stack new work on a red baseline. If the failure is genuinely
  unrelated and out of scope, say so up front and confirm before skipping it.
- **Don't paper over flaky/racy tests** with `sleep`, retry loops, or bumped
  timeouts. Make the ordering explicit (controlled promises, fake timers,
  `act(...)`) or fix the underlying race.
- **Don't disable a failing check** (lint, typecheck, test, hook) to make it
  pass — fix the underlying issue.
- **Call out cost and reliability up front** when recommending new
  infrastructure or external API calls (additional HERE/Mapbox calls,
  third-party APIs, etc.). Free-tier thresholds, rough $/month at expected
  traffic, new failure modes. If impact is effectively zero, say so.

## Talking to the user

- **One question at a time.** Never stack multiple questions in a single turn —
  ask the most important one, wait for the answer, then ask the next if you
  still need it. A wall of bundled questions is harder to answer than a short
  back-and-forth.
- **Don't interrupt.** Never fire off a question while the user is still
  typing. Let them finish; a half-typed message isn't an invitation to jump in.
- **Keep replies short — don't dump a full page.** Lead with the single most
  important point and stop. If there's more, say the first point and ask
  whether they're ready for the next one rather than emptying everything at
  once.
- **End the turn by restating any pending decision.** If you're waiting on an
  answer — a question you asked, or a guess autopilot recorded for review —
  the last line of the reply is that question, written out in about a
  sentence. A back-reference ("as asked above") isn't actionable when the
  question is pages back or was never actually put into words; restate it
  every turn until it's answered. Nothing pending, no line. It is the *last*
  line: where *Branching* also ends the reply with the open-PR link, that
  link goes just above it. This governs replies the user reads: a scheduled
  check that finds nothing new re-arms silently and produces no reply at all,
  so there is nothing to restate.

## Asking questions

- **Ask in chat, never with `AskUserQuestion`.** That's Claude Code's
  multiple-choice question prompt, and it's broken in the Claude mobile app —
  a question asked through it may be unanswerable. Plain chat also keeps the
  question, its context, and the answer in one readable thread.
- **After asking, stop and wait for the answer.** Don't proceed on an assumed
  answer, pick a "recommended" option yourself, or keep working on the part
  the question affects.

## Node version

- **The Node major is named in two places and they move together or not at
  all:** `.nvmrc` (CI's `setup-node` via `node-version-file`, `nvm use`, and
  the web sandbox's session-start hook) and `engines.node` in `package.json`
  (the build image, plus npm's EBADENGINE warning). `nodeVersion.test.js`
  fails CI on a mismatch — a split is quiet in the worst way, going green on
  one runtime while the deployed build runs another.
- **Never hard-code a Node version in `ci.yml`.** Use `node-version-file:
  .nvmrc` so there's one source of truth. CI ran a hard-coded `22` while
  nothing else pinned anything at all, which is how the drift started.
- **The web sandbox is the consumer that can't follow on its own.** Its image
  ships whatever Node it ships (22 today), so `.claude/hooks/session-start.sh`
  provisions the `.nvmrc` major before `npm install`. It re-resolves the newest
  release of that major every run rather than trusting the container's cached
  copy, because container state survives between sessions and an
  existence-only check would pin the first version ever installed.
  Best-effort: an unreachable nodejs.org keeps the cached toolchain and says
  so, rather than failing session startup.
- **The hook is identical in all three repos, and so is its test.**
  `scripts/session-start-hook.test.js` runs the real hook end to end against a
  temp install root and a `file://` release fixture, via the `SESSION_NODE_ROOT`
  and `SESSION_NODE_DIST_URL` seams — no network, no stubbed internals. Its
  failure mode is a *false pass*, so behavior is asserted, not structure. When
  you change the hook, change it everywhere and keep the Node block
  byte-identical.
- **Renovate does not bump the Node runtime, and can't be made to.** `.nvmrc`
  holds the bare major on purpose — every consumer resolves the newest release
  of it on its own — but Renovate's nvm manager can only write a *full*
  version, so `Update Node.js to v24.18.1` rewrote `.nvmrc` to `24.18.1` and
  `nodeVersion.test.js` failed it, in all three repos, every time a Node patch
  shipped. There was never a mergeable version of that PR: the upgrade it
  offers already happens at runtime without a commit. Patches and minors are
  off; a **major** is held behind `dependencyDashboardApproval`, so a new LTS
  still shows up on the dashboard without opening a PR nobody can merge.
  Checking that box means "I am doing the migration now" — expect to restore
  the bare major in `.nvmrc` by hand in that branch.
- Currently Node **24** (the active LTS; 22 dropped to maintenance when 26
  shipped).

## Dependency updates

- **Dependency updates are one batched PR a month**, from
  `.github/workflows/dependency-update.yml`. It runs `npm update --save` on the
  1st, and on demand from the Actions tab (*Run workflow*), so every dependency
  moves to the newest version its **existing range** allows. A major stays a
  deliberate migration you start yourself; an unattended job must not be able
  to produce one. **That is a guarantee for direct dependencies and
  best-effort beneath them.** The publish job re-derives every `package.json`
  range change from the diff and stops the run on a crossing, so nothing you
  declare can cross a major. A *subdependency* whose own range is `*` or
  `>=x` can, without anything appearing in the `package.json` diff, and
  `scripts/check-dependency-update.mjs` is what covers that.
- **The lockfile check asks each CONSUMER what it resolves; it does not match
  instances across the two trees.** Getting here cost fifteen review rounds,
  almost all of them spent on the design this replaced, so the dead end is
  worth recording. That design paired up the copies of each package name
  across the snapshots and then compared the majors each pair resolved. Both
  obvious pairing keys are wrong in opposite directions — an npm path is a
  *location*, so a consumer that hoists looks deleted-and-recreated and the
  major it just crossed reads as an edge that never existed; a name is an
  *aggregate*, so two copies of one consumer collapse and a swap between them
  cancels out. `name@version` is not a third option either, since the consumer
  being bumped is the normal case here. So it matched by strongest evidence
  instead (same location, then version, then major), treated every
  non-same-location pairing as a *hypothesis* needing a live dependent to
  prove it, split rejected hypotheses back into halves, ordered those splits
  outermost-first, and broke cycles in that order. Each of those was a real
  fix for a real miss. **All of it was compensating for a guess that never had
  to be made** — and it was still wrong, because a matcher pairs one-to-one
  and exclusively, so when consumers merely *redistribute* across copies that
  all survive (one dependent stays on the nested copy, another moves to the
  hoisted one) the move is not any pairing at all, both copies are vouched for
  by whichever dependent stayed, and the transitive major crosses in silence.
  What the check actually wants to know is *did a real consumer's resolution
  move, and did it cross a major* — and a consumer answers that about itself.
  So: seed the root and any workspaces, then walk every edge each consumer
  declares on **both** sides, comparing the major each side resolves and
  recursing into the pair that edge lands on. Pairs come from resolution, so
  there is nothing to guess and nothing to prove. The whole apparatus above
  deleted with it, and the result is faster by more than an order of magnitude
  (14 ms on a real 868-entry lockfile, against ~260 ms) because nothing is
  matched or re-scanned to a fixed point.
  Three things fall out of "declared on both sides" that used to be separate
  guards: an edge the batch **added** or **dropped** is a change of what a
  package depends on rather than a crossing, and is skipped; an instance that
  is merely *reachable* from a consumer is not evidence that consumer used it,
  because resolution is positional and declaration is what proves use; and a
  copy that vanished because its dependent dropped it has nobody declaring it
  on both sides, so nothing vouches for it.
  Two rules that once sat beside this one — comparing an entry's own major at
  a stable path, and comparing the SET of majors a name resolves to — are
  **gone**, and that reversal is worth keeping written down. They were retained
  as cheap corroboration after measurement showed the instance rule already
  rejected everything they rejected, on the principle that "the new rule
  subsumes the old one" had been wrong every previous round. That principle is
  about *coverage* and still holds there; it says nothing about correctness,
  and these two were unsound in a way this check is not. Being aggregates over
  the whole tree they cannot tell a crossing from an add-and-drop: one package
  dropping `bar@1` while an unrelated one picks up `bar@2` moves both the
  shared-path major and the by-name set, and both fire on a legitimate batch.
  Only a consumer can tell those apart, and an aggregate has no consumer to
  ask — so there was no gated version of them to keep. Corroboration that
  raises false alarms is not corroboration, and for an unattended job a monthly
  cry-wolf is worse than the silent miss they never actually covered.
  **A consumer's edge fields have to include `devDependencies`.** They were
  left out on the reasoning that a dependency's dev deps are never installed —
  true, but npm does not record them for a dependency either. It strips the
  field from an installed tarball's entry and writes it only for the root and
  for `link: true` workspaces, which are exactly the entries whose dev edges
  *are* installed. Omitting it meant nothing walked the dev-tooling subtree at
  all, and with a `*` range the manifest diff never moves either.
  **The root and any workspaces are seeded directly**, because they are where
  the walk starts. A workspace has to be seeded or it is invisible — npm splits
  it across two entries, a versioned one at its repo path with no
  `node_modules/` segment and a `link: true` record with no version, and
  neither is a resolved package. No repo here uses workspaces yet; the fixture
  exists because adding one would otherwise narrow what the job checks with
  nothing red to say so. It is a script rather
  than a `node -e` string in the YAML for a reason that already bit: a
  single-quoted shell argument ends at the first apostrophe, and one in a
  comment silently truncated the program to valid JavaScript that exited 0
  with half its rules gone. `scripts/check-dependency-update.test.js` covers
  the shapes (in-place bump, hoist, benign dedupe, a dedupe that carries a
  crossing, a newly added copy that carries one, consumers redistributing
  across copies that all survive, a dropped dependency and a newly added
  dependency and a coincidental resolution and an independent add/drop of the
  same version that must NOT be read as crossings, two levels deduping at
  once, a stable path whose dependents all turned over, a direct
  devDependency crossing and a major under a dev-only subtree, a workspace's
  own edge, a consumer and child relocating together, relocations past
  unrelated newcomers, duplicate-consumer swap, consumer bumped and hoisted
  while crossing, clean batch); each guard there was
  verified by reintroducing the defect and watching it go red. Several of
  those shapes were found against the matcher design and are named for the
  tree rather than for the mechanism they once probed — they are kept because
  the shapes are real, and every one of them still has to come out right. Two things in
  the workflow are load-bearing, both guarding failures that would otherwise
  be silent:
  - **The job runs the full check suite itself.** A PR opened by `GITHUB_TOKEN`
    does not trigger `on: pull_request` workflows — that is GitHub's
    loop-prevention rule, with no per-repo opt-out short of a PAT — so `ci.yml`
    never runs on the monthly PR and a PR with no red tick would read as
    verified when nothing had verified it. Results go in the PR body. Pushing
    any commit to the branch makes CI run normally from then on.
  - **`dependency-update.test.js` asserts those checks stay in step with
    `ci.yml`.** Add a step to one and not the other and the monthly PR is
    quietly verified by a weaker suite than `main`, looking identical either
    way. It also pins the `.nvmrc`-as-single-source rule, `workflow_dispatch`,
    and first-party-actions-only.
  The test also bounds the supply chain: every action the job uses must be
  either first-party (`actions/*`) or something `ci.yml` already runs, so an
  unattended job with push access is never where a genuinely new third-party
  action first enters the repo (`gh` is preinstalled, so opening the PR adds
  none). The rule started as the stricter "nothing `ci.yml` doesn't already
  use" and was loosened deliberately when the publish job needed
  `upload-artifact`/`download-artifact` — GitHub's own actions, which `ci.yml`
  has no reason to run. **Cost:** negligible — Actions minutes are free on public repos,
  and one ~5-minute run a month is far inside the free tier on private ones.
- **The machine that runs the update can't fully vouch for it — that boundary
  is deliberate.** Testing a dependency means executing it: the install runs its
  lifecycle scripts, and the suite loads its code into the same process as the
  test runner. Anything running there can also tamper with the report. The
  cheap channels are closed where closing them is cheap — the update resolves
  with `--ignore-scripts` so the manifests are fingerprinted before any newly
  selected package runs, those fingerprints are step *outputs* rather than files
  on the same disk (a snapshot under `/tmp` can be rewritten alongside the thing
  it guards), and `$GITHUB_PATH`/`$GITHUB_ENV` are truncated inside the step
  that ran the scripts so a planted `npm` can't reach a later one — but the last
  channel cannot be closed: to test a package the suite has to load its code,
  and code that runs can make a test pass. So the design assumes the checks
  *can* lie and keeps the blast radius small instead: the update job holds no
  write token; the publish job checks out the base commit fresh, runs no
  dependency code, and is where the manifests are actually validated (contents
  against `HEAD`, fingerprints against what the update job recorded); and the
  branch it pushes contains nothing but the dependency manifests. Read the PR
  body's check results as evidence, not proof — the manifest diff is the part
  that is actually verified.
- **Renovate is off.** `"enabled": false` at the top of `renovate.json` is the
  master switch: the job still runs, logs `Repository is disabled`, and creates
  nothing — no PRs, no `renovate/*` branches, no dependency dashboard, and no
  vulnerability-alert PRs either, since a disabled repo is skipped before alerts
  are considered. It was switched off after the config kept producing PRs that
  were unmergeable or actively harmful: Node patches that could never go green,
  and — once `constraints.npm` was added — an auto-merge-eligible npm floor
  above what the pinned Node major bundles. GitHub's own Dependabot **security**
  updates are a separate switch in repo settings and still run, so advisories
  stay covered. Everything in the Renovate bullets below is dormant but
  retained, so re-enabling is deleting one key rather than rebuilding a config that took several rounds to
  get right; `renovate.test.js` asserts the switch, so an accidental re-enable
  fails CI. Uninstalling the Mend app at developer.mend.io is the other half, if
  you want the jobs to stop running at all.
- **Renovate (Mend-hosted app) owns dependency bumps.** Config lives in
  `renovate.json` at the repo root; validate changes with
  `npx --package renovate renovate-config-validator`.
- **Renovate silence is not success — every failure mode here is silent.** A
  bot that opens nothing looks exactly like a repo with nothing to update. If
  no Renovate PR or Dependency Dashboard issue has appeared in a while, open
  the per-repo job log at developer.mend.io before assuming there's nothing to
  do. A `DONE` job does not mean Renovate did anything: a silent-mode run
  clones, scans, extracts, creates nothing, and reports `DONE`.
- **`mode=silent` suppresses everything, and it's a Mend-side switch.** The
  Mend-hosted app injects its own config via `RENOVATE_CONFIG` and defaults an
  "All repositories" install to silent: no PRs, no `renovate/*` branches, no
  Dependency Dashboard, not even an onboarding PR. `"mode": "full"` in
  `renovate.json` states the repo-side intent (and is what a self-hosted or
  CLI run honors), but the injected value wins — if PRs still never appear the
  remaining switch is developer.mend.io → repo/org → Interactive.
- **A top-level `schedule` is a delay, not a gate.** Cooldowns
  (`minimumReleaseAge`: 5 days patch / 7 minor / 14 major) plus
  `prConcurrentLimit` are what pace volume; a window only parks updates that
  have *already* cooled down. This repo ran a Saturday 06:00–12:00 window that
  added up to six days on top of the cooldowns for no benefit. Schedules never
  apply to security fixes either — Renovate forces `schedule: []` and
  `prCreation: immediate` on vulnerability-alert branches.
- **Deleting `lockFileMaintenance.schedule` does not mean "any time".** That
  option's own default is `before 4am on monday`, so dropping the key silently
  restores a weekly window instead of removing one. `renovate.test.js` guards
  both this and `mode`/`schedule`.
- **`minimumReleaseAge` is a lookup-time filter, so `.npmrc` carries the other
  half.** Renovate applies its cooldown when it *looks up* a version, which
  means it only ever governed the direct dependency a PR names. Lock file
  maintenance never does a lookup — it deletes the lockfile and lets npm
  rebuild it, taking whatever is newest — and those PRs auto-merge, so the
  highest-volume path to production was the one path with no cooldown on it.
  Transitive dependencies escaped the same way inside ordinary bumps: Renovate
  picks the direct version, npm resolves everything underneath. `.npmrc` sets
  npm's own `min-release-age` (5 days, matching the shortest Renovate cooldown;
  `renovate.test.js` asserts they stay in step), which npm enforces while
  resolving and therefore covers both. It only affects resolution — `npm ci`
  installs from the lockfile, so CI and Vercel builds are untouched.
- **The npm that resolves is the one that has to support the window, and for
  lock file maintenance that npm is Renovate's.** `min-release-age` landed in
  **npm 11.10.0** and is silently ignored before it ("Unknown project config"),
  so the floor is declared rather than inferred from the Node major — Node
  bundles vary within one: 24.12.0 ships npm 11.6.2 (no), 24.14.1 ships 11.11.0
  (yes). `engines.npm` covers local installs and Vercel; `constraints.npm` in
  renovate.json covers the lockfile regeneration that the window exists to
  protect. Both are asserted, because an unsupported npm doesn't fail — it just
  quietly resolves without the window. If the window ever blocks an
  `npm audit fix`, npm keeps the vulnerable version and exits non-zero rather
  than failing quietly — `min-release-age-exclude` is the escape hatch for
  taking that fix immediately.
- **The npm floor is not a dependency, and Renovate must not treat it as one.**
  Adding `constraints.npm` made Renovate start managing it: within minutes it
  opened `>=11.18.0` (a minor, so auto-merge eligible) and `v12` in all three
  repos. Both sit above the npm Node 24 actually bundles — 24.18.1 ships
  11.16.0 — so either would EBADENGINE every contributor, CI runner and Vercel
  build, and the lower-bound assertion in renovate.test did **not** catch it,
  because a floor that is too high still clears a `>=` check. `npm` is now
  disabled in packageRules, and the guard pins the floor to exactly the release
  that introduced the option rather than asserting a minimum. Raise it by hand
  only if a later npm becomes genuinely required, and check what the pinned
  Node major bundles first.
- **Minors and patches auto-merge on green CI; majors always wait for review.**
  Pre-1.0 (`0.x`) packages are excluded from auto-merge — SemVer permits
  breaking changes in a 0.x minor. Auto-merge is only as safe as CI, so a red
  or skipped check is a stop sign, not noise to route around.

## Error handling

- **Don't silently swallow exceptions.** A bare `catch {}` or
  `catch (e) { /* ignore */ }` hides real failures and burns hours when
  something eventually breaks. Every catch needs to do three things: **log**
  the error with enough context to identify the failed call — the operation,
  the status code — but **sanitized context only**. Never log an API key, a
  raw response body, or the personal details of a GEDCOM record; the
  *Privacy* rule below applies to logs too, so redact or summarize instead
  ("geocode failed: 404" or a record id, not the ancestor's name and
  birthplace). **Clean up** what the `try` acquired — abort controllers, in-flight
  geocoding requests, partial state — so a failure doesn't leak resources or
  leave the UI half-mutated; and **handle the edge case explicitly** — pick
  how the caller sees this failure (default value, `null`, an error result,
  rethrow) rather than letting control fall through. A blanket `catch` also
  swallows `AbortError` from a deliberately-canceled fetch, turning a normal
  cancellation into a silent no-op. This matters most in the geocoding path:
  a swallowed HERE error silently becomes "this ancestor has no location",
  which looks like missing data rather than a failure. If you genuinely do
  want to ignore a specific failure, name the reason in a one-line comment
  ("HERE returns 404 for unresolvable places, treat as unmapped") and still
  log at debug so it's traceable.

## Privacy

- **Never put user data in any artifact that leaves this machine.** That
  includes commit subjects and bodies, PR titles / descriptions / comments,
  review replies, issue text, branch names, code comments, test fixtures, and
  anything else that ends up on GitHub or in logs. **GEDCOM files are the
  hazard here**: a real one is a dense block of PII — names, birth and death
  dates, birthplaces and addresses, and living relatives who never agreed to
  any of it. Never commit a real GEDCOM, paste an excerpt into a PR, or build
  a test fixture from one; hand-write fixtures with obviously-fake people
  (`/Doe/ John`, `1 JAN 1900`, "City A"). The same goes for the user's
  `VITE_HERE_API_KEY` and Mapbox token, and for any screenshot showing a real
  family tree or map. If a user-supplied bug report contains real records,
  paraphrase in the commit / PR — don't quote verbatim. When in doubt, ask
  before pushing.

## Branching

- **Workflow.** `claude/<short-topic>` branch off `origin/main` → PR → merge
  via rebase or squash. One topic per branch. Follow-up work after a merge
  goes on a new branch. Never commit to `main` / `master`.
- **Use `git worktree` when it's available.** Give each branch its own
  worktree instead of switching branches in place, so work in progress on one
  branch isn't disturbed by work on another.
- **Stacked PRs.** The lower PR (infra) targets `main`; the upper PR
  (feature) targets the lower PR's branch. When the lower PR merges, rebase
  the upper one onto `main`.
- **One commit per logical surviving change.** Rewrite unmerged commits
  freely (squash, amend, reorder, split). Review-fix noise shouldn't survive
  into `main`.
- `git push --force-with-lease` to your own live feature branch after a
  rebase is routine — don't ask. Confirm before destructive actions on
  shared/merged branches, resetting a merged branch name included — see the
  post-merge rule below.
- **Unshallow before answering anything that depends on git history depth.**
  The sandbox clones shallow, so `git rev-list --count`, `git log` past the
  shallow boundary, and blame return wrong answers without warning. If
  `git rev-parse --is-shallow-repository` says `true`, run
  `git fetch --unshallow` first. Don't quote a count off a shallow clone.
- **Merge cue (`merged` / `I merged` / `landed` / merge webhook) runs hygiene
  *before* engaging with the rest of the message:** `git fetch origin main`,
  cut a fresh `claude/<short-topic>` branch off `origin/main`, announce the
  switch. Where the sandbox has no remote, the cue can't be honored as written
  — a fresh branch needs a base that contains the merge, and an offline
  checkout can't fetch one; say so and ask for a synced checkout rather than
  branching off a stale `main`. The cue is about the branch that merged: when
  a lower PR in a stack merges while an upper one is still open, rebase the
  upper branch with `git rebase --onto origin/main <lower-branch>` — onto
  `origin/main`, not local `main`, which the fetch does not advance, and
  naming the lower branch as the upstream boundary so a squash merge doesn't
  replay the lower commits too. Carry on there — don't abandon it for a new
  topic branch.
- **After a merge, take a fresh `claude/<short-topic>`** — don't reset the
  merged name onto the new base. Its remote ref still points at the pre-merge
  tip, so `origin/<branch>..HEAD` keeps spanning the merged commits and
  unpushed-work checks report your own merged history back at you. When a
  sandbox pins the branch name so a fresh one isn't available, say so and ask
  before resetting it. No short check reliably separates "already merged" from
  "not yet merged" here: a rebase merge rewrites the commits, a squash merge
  collapses them, `main` moves on underneath so a tip-to-tip diff reports
  upstream drift as branch work, the remote ref can hold a commit the local
  one doesn't, and no tree comparison sees the uncommitted work a `--hard`
  reset would erase. Confirming costs one question in a rare situation;
  guessing costs someone their work. Don't reach for `--force-with-lease` as
  the safety net either — fetching updates the remote-tracking ref the lease
  compares against, so a commit you have already fetched passes the lease
  unnoticed.
- **The agent authors; whoever merges takes over the committer line.** A squash
  or rebase merge rewrites the committer to the person who pressed the button —
  the repo owner normally, the agent itself when it merges under *drive*. That's
  expected either way — never re-author or amend already-merged commits to "fix"
  authorship or signing.
- **No-remote sandbox exception.** Sandboxes without remote Git support (such
  as Codex cloud) may continue from the checked-out HEAD without fetching
  `origin` — but still on this task's own topic branch: unless the checked-out
  branch is already it, cut a local `claude/<short-topic>` first — and cut it
  from a base free of earlier work (local `main` where it carries none,
  otherwise ask for a synced checkout), since branching off a stale topic tip
  only renames that topic's commits into your PR. Committing onto `main` or
  onto a stale topic branch from earlier work both mix unrelated topics into
  one PR once remote access returns; only fetch, push and the PR are
  unavailable, not the branching rules — a missing remote or unsupported fetch
  must not block otherwise-local work. Commit locally, and say plainly that
  fetch, push, and pull requests were unavailable rather than implying they
  happened. Do not make claims that depend on unseen remote state.
- **After every push and after every merge, report the resulting HEAD SHA** so
  the operator can tell which build is deployed. Format: `pushed <short-sha>`
  after a push — your branch tip on `origin/<branch>`; `merged at <short-sha>`
  after a merge — the commit the merge produced on `main`, which is *not* your
  local `HEAD`: a rebase or squash merge leaves the feature branch pointing at
  the source commit, so take the SHA the merge API returned, or the merge
  commit the PR itself records — not the `origin/main` tip, which another push
  can have moved past it by the time you look. 7-char prefix is fine. Mention
  it once per push.
- **On every push, update the PR title and body.** Whenever you push to a
  branch with an open PR, edit its title and description
  (`mcp__github__update_pull_request`) so they still describe what is on the
  branch — new commits, reversed decisions, changed scope — and print the PR
  link in the chat reply for that push, not only at the end of the
  conversation. A body that listed three bullets goes stale the moment a
  fourth commit lands; fetch the PR's base first — pushing your branch doesn't
  refresh it, and a stale base ref describes changes the PR no longer contains
  — then re-read the diff against that base (`origin/main`, or the lower
  branch when this is the upper PR of a stack) and patch whatever drifted
  rather than waiting to be told.
- End every reply with the open-PR link (or `.../compare/main...<branch>`
  until a PR exists). Never link to a closed or merged PR. In a no-remote
  sandbox there is no link to give: say the branch is local and unpushed
  rather than inventing a URL. When a pending decision also needs restating
  (see *Talking to the user*), the link goes second-to-last and the question
  is the final line.

## Autonomy

- **Open the PR without being asked.** Pushing a finished branch and opening
  its pull request are one step, not two — don't park a branch waiting for
  "please open a PR." The exception is an explicit instruction not to ("just
  commit", "no PR yet"), which holds until the user lifts it. This file is the
  repo owner's standing request for that PR, so a client-level rule reading
  "open a PR only when the user explicitly asks" is already satisfied — the
  ask is here, and it doesn't need repeating per branch.
- **Opening the PR includes wiring up the watch.** In the same step, subscribe
  to the PR's activity (`subscribe_pr_activity`) *and* arm the first scheduled
  check. Both, not either: the subscription gives you review comments and CI
  results as they land, and the scheduled check is what catches the ones the
  webhook drops. A PR that is only subscribed looks watched and silently
  isn't.
- **Poll your own open PRs every 5 minutes** — the ones you opened or were
  explicitly asked to watch — for new review comments, CI status, approvals,
  and the Codex thumbs up. Webhooks drop events, so a PR nobody is polling
  stalls silently. Never end a turn by going idle with one of yours still
  open: arm the next check with whatever the client offers (`send_later`, a
  scheduled task / cron, `/loop`), and arm it *without asking*. Scheduling
  your own follow-up is routine hygiene, not a decision that needs approval.
  Someone else's open PR is not your polling job — adopt one only when asked.
  Once a PR is green, reviewed, and has nothing left but the merge, drop to
  half-hourly — that's a queue waiting on a human, not work in flight. Merged
  or closed unmerged is terminal: wait for one more check to see CI and Codex
  report on the final head, but don't block on a report that may never
  land — an early manual merge, a docs-only push a path filter never runs CI
  on, a down review service — settle for whatever's known by then and move
  on. Either way, run one last reply-or-resolve pass, then cancel the watch
  in full: `unsubscribe_pr_activity` *and* the pending scheduled trigger, not
  just one of the two. Open a follow-up PR (with its own watch) for anything
  a merged PR still needs.
- **What the polling costs.** Twelve wake-ups an hour per PR, each a model
  turn plus a few GitHub API calls — roughly a dollar an hour on a large
  context. The scheduler is the single point of failure: one missed re-arm
  ends the watch silently, with no error anywhere. If you can't arm the next
  check, say so in the reply rather than leaving a PR that looks watched and
  isn't.
- **One pending check per PR, not one per wake-up.** A webhook event can start
  a turn while a scheduled check is still pending; arming another there leaves
  two chains, each re-arming itself, and the cost doubles every time it
  happens. Before arming, reuse or cancel the pending one (`update_trigger`,
  or `delete_trigger` then re-arm) so exactly one check is outstanding.
- **"Drive" means run the loop automatically**: pick the next task, implement
  it, open the PR, wait for the automatic Codex review, address every comment,
  merge once CI is green and Codex has left its thumbs up — then pick the next
  actionable task and go around again. Actionable means ready to build: skip
  anything explicitly deferred or waiting on a product decision rather than
  guessing the decision. Driving ends when the work runs out or the user says stop, not
  when one PR merges.
- **A red baseline is the next task.** Before picking up any task, run
  `npm test` and `npm run lint` and get them green. A preexisting failure is
  work to do, not a thing to classify as "unrelated" and step around —
  deciding it's out of scope is exactly the call that goes wrong, and the cost
  is every later PR merged onto an unverified tree. Fix it first (as its own
  first commit, per *Workflow*), then pick the task. That section's "genuinely
  unrelated, out of scope" escape hatch is the only way past a red tree, and it
  needs a real answer from the user — not a call you make on your own, and not
  one autopilot guesses.
- **"Autopilot" is drive without blocking on the user.** Wherever drive would
  stop and ask, autopilot takes its best guess and keeps going, preferring the
  option that is cheapest to undo or change later. Record each guess in
  `TODO.md` under a `Decisions needing review` heading — what was decided,
  what the alternative was, and why it's reversible — creating the file or the
  heading if it isn't there, so nothing guessed silently becomes permanent.
  While autopilot is in effect it outranks *Asking questions*' "after asking,
  stop and wait for the answer"; that rule governs everywhere else. The
  carve-out is for destructive or irreversible actions *outside* the loop —
  rewriting shared history, deleting work, anything reaching a system beyond
  this repo — which still wait for a real answer. Resetting a pinned merged
  branch waits too, even though it is inside the loop: the post-merge rule
  asks precisely because no check can tell what the reset would destroy, and
  autopilot guessing there is the loss that rule exists to prevent. The loop's
  own steps don't count: committing, pushing, opening a PR, subscribing to it,
  reading its CI and review state, arming the next scheduled check, and
  merging a green PR are authorized here, so autopilot must not stall on them
  — the carve-out is aimed at destructive writes to systems outside the repo,
  not at the loop's own GitHub reads and follow-ups. Privacy uncertainty is
  never inside the loop either: if you can't tell whether something is user
  data — a name from a GEDCOM, a birthplace, an API key — it waits for a real
  answer, since a push can't be un-published and a `TODO.md` note doesn't
  retract it.

## Pull requests and reviews

- **"Drive to merge"** is the PR stretch of *drive* (see *Autonomy* above):
  open the PR, wait for the automatic Codex review, address every review comment — fix it
  if you agree, reply on the thread saying why if you don't — and merge once
  CI is green and Codex has left its thumbs up.
- Open PRs ready for review (not draft) unless asked otherwise.
- When a feature has multiple open PRs in a stack, list **every** open PR
  on the feature by URL, one per line — the "View PR" chip sticks to the
  first link and hides the rest (anthropics/claude-code#46625).
- **Codex is the automated reviewer on this repo** — not Copilot. Its reviews
  are triggered automatically; you don't request them.
- **Address Codex comments automatically — don't wait to be asked.** Read each
  one, decide whether it's a real issue or a false positive, and if it's real,
  fix it in the same PR. Fold the fix into the commit it belongs to (rebase /
  `--fixup`) rather than tacking on an "address review" commit, per the
  one-commit-per-logical-change rule. Group several small fixes into one
  commit when they share a topic.
- **Reply to (and resolve) every addressed comment**, one thread at a time,
  not in bulk. `resolve_review_thread` works — pass the `PRRT_*` thread node
  ID from `pull_request_read` / `get_review_comments` (`review_threads[].id`)
  as `threadId`. A comment's `PRRC_*` node ID fails; they're different
  objects. Order of operations: push the fix commit first, then reply citing
  the new sha, then resolve.
- **Report when Codex finishes reviewing a fresh push** — a one-liner naming
  the SHA and comment count, e.g. `Codex reviewed 87d9f02 — 0 comments`. Tie
  it to the *latest* pushed SHA so a stale review of a superseded commit isn't
  conflated with the current state.
- Never leave a review comment thread silently dismissed. Either reply on
  the thread *or* resolve it. When you think a comment is a false positive,
  say *why* on the thread (one or two sentences). Acknowledgement noise
  is fine and preferred over silence.
- **Skip echo events silently.** `mcp__github__add_reply_to_pull_request_comment`
  / `add_issue_comment` post under whichever GitHub identity backs the MCP
  auth, so a moment after you post a reply the same body comes back as a
  webhook event authored by that identity. That's your own echo, not user
  feedback — continue without a chat-side acknowledgement. The test is "did
  *I* just post this body?", not "who is the author?".
- **Canceling the watch**: see the polling bullet under **Autonomy**.

## CI

- After pushing, **wait for CI** before claiming a change works in any
  environment you can't test locally. Don't busy-poll inside the turn —
  webhooks deliver. The scheduled PR check under *Autonomy* is the exception,
  and the reason it exists: those events get dropped often enough to stall a
  PR silently.
- Report significant CI timing regressions (rule of thumb: >25% or >30s
  on a job under ~5min). Name the likely cause: heavy new dependency,
  slow new test, cache invalidation.
