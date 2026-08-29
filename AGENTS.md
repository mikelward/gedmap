# GedMap

Client-side GEDCOM file analyzer that visualizes ancestor birthplaces on a Mapbox map.

## Tech Stack

- TypeScript (strict), React 19, Vite 8, Tailwind CSS 4, Vitest
- Mapbox GL JS for map rendering
- HERE Geocoding API for place lookups

## Development

```sh
npm install
npm run dev        # Start dev server
npm run build      # Typecheck (tsc -b) + production build
npm run lint       # ESLint
npm run typecheck  # tsc -b --noEmit
```

## Testing

```sh
npm test              # Run all tests once
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with V8 coverage report
```

Tests use [Vitest](https://vitest.dev/) with jsdom for component tests. Test files
live next to their source files using the `*.test.{ts,tsx}` convention.

### Test structure

- `src/utils/parseGedcom.test.ts` — GEDCOM parser: tokenization, tree building, family links, relationship labels, ancestor collection
- `src/utils/geocode.test.ts` — Geocoding: place splitting, feature ranking, progressive query shortening, concurrent ancestor geocoding
- `src/components/StatsOverlay.test.tsx` — Stats display: counts, unmapped sections
- `src/components/PersonPicker.test.tsx` — Person picker: rendering, search filtering, selection
- `src/components/AncestorSidebar.test.tsx` — Sidebar: generation grouping, search, open/close
- `src/components/MiniMap.test.ts` — Mercator projection math
- `src/ThemeContext.test.tsx` — Theme toggling and persistence

### Writing tests

- Utility tests: import functions directly, use mock search functions for geocoding
- Component tests: use `@testing-library/react`, wrap with `<ThemeProvider>` if the component uses `useTheme()`
- The geocode tests set `import.meta.env.VITE_HERE_API_KEY` via `vi.hoisted()` and mock `fetch` to avoid real API calls
- `src/testFixtures.ts` has builders for the strict `AncestorEntry`/`GeocodedAncestor`/`PersonSummary` shapes (`src/types.ts`) — reach for those in a new component test instead of hand-rolling a full-shaped fixture object

## Workflow

Keep this file short and concrete — add a new rule the first time something
bites, not the third. Every session loads it whole, so each rule costs context
on every turn: say it once in the fewest words that carry the *why*, rewrite or
trim an existing rule rather than appending beside it, and delete one that has
stopped biting.

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
- **Respond to a mid-turn message immediately.** When the user sends a message while you're
  still working — surfaced as a "sent while you were working" interjection — address it in
  your very next output, before starting or continuing any further tool call, even if it's
  only one sentence. Don't let it queue up behind an in-flight chain of tool calls.
- **Don't report your own caught-and-fixed mistakes.** A wrong turn you noticed
  and corrected before it reached anything is not news — no "one thing worth
  flagging", no narration of the recovery. Say it only when it left something
  the user has to act on: work actually lost, a bad push someone may have
  pulled, a decision they would make differently knowing it.
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
- **Provisioning the runtime and making it REACH the session are two
  problems, and the second one failed silently for a while.** The hook
  exports PATH and writes it to `$CLAUDE_ENV_FILE` — but that variable is not
  always set (it is unset in the web sandbox today), and then the export
  reaches only the hook and its children: `/opt/node24` sat there correctly
  provisioned while every agent shell ran the image's Node 22, on an npm too
  old to honor `.npmrc`'s cooldown. A shell rc file is not the fallback — the
  harness snapshots the environment before hooks run, so an rc edit lands a
  session late while looking like it worked. So the fallback changes what the
  NAME resolves to instead: symlinks for `node`/`npm`/`npx` (and `deno` where
  the hook installs one) in the first PATH directory **under `$HOME`**, which
  wins the lookup whatever a later shell sources. Three refusals keep that
  from being a lie: it links nothing if any tool is missing or unrunnable in
  the source, nothing if any *earlier* PATH entry still supplies one of the
  names (node and npm need not come from the same directory, so the question
  is asked per tool), and nothing over a real file — all decided before the
  first link, because a half-linked toolchain is a split one, worse than the
  fallback it replaces. It does **not** stop at whichever directory currently
  answers: from the second session on that is this shim directory itself, and
  refusing to touch its own links would strand every later `.nvmrc` major on
  the old runtime.
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

- **The weekly batch itself now lives in mikelward/npm-update.** `.github/workflows/npm-update.yml` here is a thin caller (`uses: mikelward/npm-update/.github/workflows/npm-update.yml@main`, plus the schedule and the permissions grant) — see that repo's README.md for the wiring contract and its own AGENTS.md for the mechanism (fingerprinting, the check-npm-update.mjs lockfile-major-crossing walk, the two-job read-only/write-token split, the ci.yml/codex-review-check.yml dispatch). This repo was the source the extraction ported from and is its pilot consumer; a fix to the mechanism now lands in mikelward/npm-update, not here — this file no longer duplicates that narrative, to avoid the drift a hand-synced copy would cause.
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

## Commit messages

- Write a clear, plain-English subject in sentence case; keep it short
  (≤ ~70 chars, prefix included) and free of internal jargon.
- Put the mechanism, the bug fixed, and file:line detail in the body, after a
  blank line — the body is not size-constrained. A commit with nothing to
  explain needs no body: the weekly dependency batch is the standing example,
  where the diff is the manifests and the PR carries the check results.
- **Prefix a subject that does not change what the app does.** A bare subject
  means a user could notice the difference. Anything else takes one of these,
  lowercase, followed by the sentence-case subject as above:

  | Prefix | For |
  |---|---|
  | `docs:` | Prose: `spec.md`, this file, the rest of the Markdown |
  | `todo:` | `TODO.md` bookkeeping on its own |
  | `test:` | Tests only, with the code under test unchanged |
  | `build:` | Toolchain, CI, lint/build config, `scripts/` |
  | `refactor:` | Code that is deliberately behavior-preserving |

- **No `feat:` or `fix:`, on purpose** — they would prefix nearly everything
  left and leave the log as flat as it is now. The prefix marks the exception,
  so the default stays bare.
- **No `deps:` either — a dependency bump changes what the app runs, so it's
  bare like any other release-worthy change.**
  `.github/workflows/npm-update.yml` used to write a `deps:` prefix on the
  weekly batch specifically, which is how 33 of the last 50 commits ended up
  reading `deps: Update dependencies (<date>)` with nothing to say whether
  the app actually changed. That prefix is gone now: a bump taken *because*
  of the behavior it changes still says what changed; the routine weekly
  bump has nothing extra to say, but it's bare too — matching a dependency
  bump's own definition of release-worthy.
- **`TODO.md` and `spec.md` ride along and never decide the prefix** — either
  counts only when it is the whole change.
- **A mixed commit goes bare if any part of it changes behavior.** Below that
  line the prefix names why the commit exists, not what it touched: a
  toolchain pin that also edits the guides describing it is `build:`, because
  the prose moved to follow the toolchain. So there is no precedence order to
  memorize. Two genuinely independent categories are two commits.

## Branching

- **Workflow.** `claude/<short-topic>` branch off `origin/main` → PR → merge
  via rebase or squash. One topic per branch. Follow-up work after a merge
  goes on a new branch. Never commit to `main` / `master`.
- **Never open a PR on a commit that already carried one.** The `codex`
  status belongs to the commit, not the PR, and records nothing about which
  PR earned it — so a PR opened on the byte-identical head of a closed one
  inherits its verdict and can merge on a review of different work. Push a
  commit, or branch from a moving base, so the new PR has a head of its own.
  The verdict sweep (`codex-review.yml`, running the shared
  mikelward/codex-review action) resets the status to `pending` within about
  a minute of the PR opening, but that is an Actions job racing merge
  eligibility, so treat it as the backstop and this rule as the fix.
- **The PR title carries the same prefix as a commit subject** (see *Commit
  messages*), judged over the whole branch rather than any one commit, and
  re-judged on every push — a branch can start documentation-only and stop
  being so with the next commit. The title is there to be read: it is what the
  PR list shows the repo owner, so the prefix says at a glance whether a PR
  changes what the app does.
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
  Claude Code sessions get this automatically — `scripts/unshallow.sh` runs
  from the session-start hook — but the hook is Claude-only, so in any other
  environment run that script (or `git fetch --unshallow`) yourself first.
  The sandbox clones shallow, so `git rev-list --count`, `git log` past the
  shallow boundary, and blame return wrong answers without warning; where no
  remote is reachable (Codex cloud), say the history is truncated rather
  than quoting a count.
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
- **Branches under your own `<agent>/` prefix are yours.** Create, push,
  `--force-with-lease` and rename them freely — no permission, no announcement,
  no per-branch confirmation. Only a branch outside that prefix, or `main`
  itself, is a conversation. Deleting is the one the prefix can't settle: it
  doesn't say which session made the branch, so delete the ones this session
  created and ask about the rest.
- **The agent authors; whoever merges takes over the committer line.** A squash
  or rebase merge rewrites the committer to the person who pressed the button —
  the repo owner normally, the agent itself when it merges under *drive*. That's
  expected either way — never re-author or amend already-merged commits to "fix"
  authorship or signing, and don't narrate it: no note in the
reply, no offer to correct it. It is not a finding.
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
- **Update the PR title and body with the push, not after it.** Pushing to a
  branch with an open PR and editing its title and description are one step,
  not two: (`mcp__github__update_pull_request`) so they still describe what is
  on the branch — new commits, reversed decisions, changed scope — and print
  the PR link in the chat reply for that push, not only at the end of the
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
- **Watch your own PRs by subscription, plus one scheduled check.** Have a
  subscription — Claude Code makes one when you open a PR; where a client
  doesn't, call `subscribe_pr_activity`. It delivers reviews, comments and CI
  failures. It cannot deliver CI *success*, a push, the merge, Codex's clean
  verdict (a reaction), or Codex never answering at all — so keep exactly one
  check armed for as long as the PR is open (each event and each check costs
  a model turn). Under drive, arm auto-merge at PR open too — but only where
  the ruleset makes the Codex verdict a required check AND requires
  conversations resolved: where CI is the only requirement it merges before
  Codex has answered, and an open review comment holds nothing back on its own.
  - Settle the fired trigger first thing in the turn, not last. It may have
    silently re-armed rather than retired — update the one that survived,
    replace the one that didn't, and end the turn with exactly one pending.
  - Check the fire time you got against the one you asked for — a 4-minute
    request has come back as 64. Prefer a relative delay: the scheduler's
    clock is not this container's, so an absolute time computed here can be
    rejected as already past. Re-time it, or say the watch isn't armed.
  - A few minutes out while CI or the current head's Codex verdict is
    outstanding; longer once only a human is left; short again after a push.
  - A PR reading `dirty` — always — or `behind` where the ruleset requires
    branches up to date, needs a rebase onto its base and a lease-guarded
    force-push. Nothing reports a base advance, so only this check catches
    it. Fetch both refs by explicit refspec, unshallow a shallow clone, and
    rebase onto the fetched `origin/<base>` — not always `main`, never the
    local branch a fetch leaves behind. Confirm before you rebase that your
    branch has every commit the remote head has, and before you push that
    the head has not moved since the tip you noted before fetching: the push
    flags do not reliably refuse a rewind, a commit you never fetched, or
    one you fetched and did not rebase onto, and overwriting any of them
    loses someone's work. If either fails, or you can't tell, stop and ask.
  - Name the PR, and say what to re-read rather than what you read. A SHA or
    a list of which PRs are open goes stale before it fires; one PR number
    does not, and the trigger has to be matchable to it.
  - Merged or closed, take one last reply-and-resolve pass — a review can
    land after the merge. Nothing is holding the PR now, so on a merged one
    anything real goes to a follow-up PR, named on the thread, before you
    resolve it; leaving it open records the work nowhere. A closed-unmerged
    PR is a stop — the work was abandoned, so answer, resolve, and open
    nothing. Then cancel the check and unsubscribe. `list_triggers`
    spans the account, so match this session and this PR before updating
    or deleting one; an update reschedules whatever it matches as surely
    as a delete cancels it.
- **If a scheduler, GitHub or `git push` call prompts, say so once and carry on.**
  Permissions load at session start, so writing a settings file mid-session
  can't fix the session you're in.
- **"Drive" means run the loop automatically**: pick the next task,
  implement it, open the PR, wait for the automatic Codex review, address
  every comment, merge once CI is green and Codex's verdict for the current
  head is in — then pick the next actionable task and go around again.
  Actionable means ready to build: skip anything explicitly deferred or
  waiting on a product decision rather than guessing the decision. Driving
  ends when the work runs out or the user says stop, not when one PR merges.
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
  own steps don't count: committing, pushing, opening a PR, reading its CI and review state, arming the next scheduled check, and
  merging a green PR are authorized here, so autopilot must not stall on them
  — the carve-out is aimed at destructive writes to systems outside the repo,
  not at the loop's own GitHub reads and follow-ups. Privacy uncertainty is
  never inside the loop either: if you can't tell whether something is user
  data — a name from a GEDCOM, a birthplace, an API key — it waits for a real
  answer, since a push can't be un-published and a `TODO.md` note doesn't
  retract it.

## Pull requests and reviews

- **"Drive to merge"** is the PR stretch of *drive* (see *Autonomy* above):
  open the PR, wait for the automatic Codex review, address every review
  comment — fix it if you agree, reply on the thread saying why if you don't
  — and merge once CI is green and Codex's verdict for the current head is
  in.
- Open PRs ready for review (not draft) unless asked otherwise.
- When a feature has multiple open PRs in a stack, list **every** open PR
  on the feature by URL, one per line — the "View PR" chip sticks to the
  first link and hides the rest (anthropics/claude-code#46625).
- **Codex is the automated reviewer on this repo** — not Copilot. Its
  reviews are triggered automatically; you don't request them, except when
  nothing has come back five minutes after a push — that means it never
  picked the push up.
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
- **Read the Codex verdict, don't infer it.** It reacts to the PR body
  (`issue_read` → `reactions`), not to a review thread, whose `Useful?` bar
  reads true on any PR it has commented on. `eyes` means reading, `+1` means
  clean, and Codex revokes it on push — so a visible one belongs to the
  visible head, and `+1` with green CI is a merge. The count names no
  author, so leave PR-body reactions to Codex: nobody else's is revoked, and
  a review is the attributable form, naming the commit it read. Findings
  arrive as review comments, as a top-level comment, or as a review — read
  `get_review_comments`, `get_comments` and `get_reviews` to the last page,
  since all three page oldest first — and they block the merge until fixed
  or rebutted; an acknowledgment is not an answer. Nothing from Codex since
  the push, five minutes on, means it never picked it up — comment `@codex
  review`, once.
- **Judge every review comment on merit, whoever wrote it.** Verify the
  claim before acting; if it doesn't hold up, reply saying why and decline.
  A comment citing a rule is a *reading* of that rule, not the rule — check
  what the rule actually says. Codex misreads the privacy rules especially,
  and in one direction: stricter always feels safer, so an over-strict
  finding quietly costs capability the product needs. Quote the rule and
  decline rather than narrowing the code to satisfy it; where the rule
  really does forbid what the product needs, that conflict is the
  maintainer's call, not one to settle either way yourself.
- Never leave a review comment thread silently dismissed. Answer on the thread — a
  disagreement is an answer, so say why — then resolve it once the fix is on the
  head or the point is rebutted; anything still to do stays open. When you think a comment is a false positive,
  say *why* on the thread (one or two sentences). Acknowledgment noise
  is fine and preferred over silence.
- **Skip echo events silently.** `mcp__github__add_reply_to_pull_request_comment`
  / `add_issue_comment` post under whichever GitHub identity backs the MCP
  auth, so a moment after you post a reply the same body comes back as a
  webhook event authored by that identity. That's your own echo, not user
  feedback — continue without a chat-side acknowledgment. The test is "did
  *I* just post this body?", not "who is the author?".
## CI

- After pushing, **wait for CI** before claiming a change works in any
  environment you can't test locally. Don't busy-poll inside the turn — the
  subscription carries a failure, and success is what the scheduled check is
  for.
- Report significant CI timing regressions (rule of thumb: >25% or >30s
  on a job under ~5min). Name the likely cause: heavy new dependency,
  slow new test, cache invalidation.
