---
trigger: always_on
alwaysApply: true
last_modified: 2026-10-23
---

# GedMap

Client-side GEDCOM file analyzer that visualizes ancestor birthplaces on a Mapbox map.
`CLAUDE.md` and `GEMINI.md` are symlinks to this file. Edit `AGENTS.md` and bump
`last_modified`.

**At the start of every session, print the full absolute path of the `AGENTS.md` you
loaded and its `last_modified` date** (front matter), so a stale or wrong copy is caught
first.

Keep this file short — one-liners over essays, **under 24,000 bytes** (`wc -c AGENTS.md`):
Antigravity caps rule files at 24 KB and silently truncates the tail. State the rule and
the failure it prevents; incident narratives belong in commits, background in
`docs/agents-reference.md`. Add a rule the first time something bites, rewrite or trim
rather than append, and delete rules that stopped biting.

## Stack and commands

TypeScript (strict), React 19, Vite 8, Tailwind CSS 4, Vitest; Mapbox GL JS for the map;
HERE Geocoding API for place lookups.

```sh
npm install
npm run dev        # dev server
npm run build      # typecheck (tsc -b) + production build
npm run lint       # ESLint
npm run typecheck  # tsc -b --noEmit
npm test           # all tests once (test:watch; test:coverage for V8 coverage)
```

## Testing

- Vitest, jsdom for components; `*.test.{ts,tsx}` next to the source (suite map in
  `docs/agents-reference.md`).
- Utility tests import directly and use mock search functions; component tests use
  `@testing-library/react`, wrapped in `<ThemeProvider>` when the component calls
  `useTheme()`. The geocode tests set `import.meta.env.VITE_HERE_API_KEY` via
  `vi.hoisted()` and mock `fetch`. Build strict `AncestorEntry`/`GeocodedAncestor`/
  `PersonSummary` fixtures with `src/testFixtures.ts`, not by hand.
- **Always add tests**: every new function, hook or component gets one exercising its
  behavior; a bug fix gets a regression test that fails before the fix.
- **Run tests before reporting done**: `npm test` and `npm run lint` must pass, and
  `npm run build` when you touch build config.
- **Fix preexisting failures as the first commit**; if genuinely unrelated and out of
  scope, say so up front and confirm before skipping. **No sleeps, retries or bumped
  timeouts** for flaky tests — controlled promises, fake timers, `act(...)`, or fix the
  race. **Never disable a failing check** (lint, typecheck, test, hook).

## Talking to the user

- **One question at a time**, in plain chat or the client's question tool
  (`AskUserQuestion` in Claude Code, `ask_question` in Antigravity). After asking, stop and
  wait: don't proceed on an assumed answer, pick a "recommended" option, or keep working
  on what it affects. Never ask while the user is typing.
- **Answer a mid-turn message first**, before any further tool call — except a merge cue,
  whose hygiene runs first and whose announced switch is the answer.
- **Message only when the user needs to see it** (maintainer, 2026-10-15): each notifies
  their phone. Work in silence; speak up for a question or blocker, something to merge or
  act on, a merge, an autopilot decision (to review when seen, never waited on), or a
  change from the plan, `spec.md` or their instructions (review-prompted included). Never
  for progress (a client's nudge doesn't count), a review or push alone (its report rides
  the next message), routine machinery, or a mistake caught and fixed before it reached
  the repo. The session-start `AGENTS.md` line still opens every session.
- **Keep replies short**: lead with the most important point; ask before unloading more.
- **End the turn by restating any pending decision** — a question you asked or an
  autopilot guess for review — as the last line, written out, every turn until answered;
  nothing pending, no line. The open-PR link goes just above it. A scheduled check that
  finds nothing new re-arms silently and sends no reply.

## Node version

- **`.nvmrc` and `engines.node` name the Node major and move together or not at all**;
  `nodeVersion.test.js` fails CI on a split. **Never hard-code a version in `ci.yml`** —
  use `node-version-file: .nvmrc`. Currently Node **24** (active LTS).
- **`.claude/hooks/session-start.sh` provisions the `.nvmrc` major before `npm install`**
  — automatically only in Claude Code; another agent runs the hook (or `nvm use`)
  itself. It re-resolves the newest release every run and, offline, keeps the cached
  toolchain and says so. It writes `PATH` to `$CLAUDE_ENV_FILE` when set; otherwise it
  symlinks `node`/`npm`/`npx` (and `deno` where installed) into the first existing `PATH`
  directory under `$HOME` (creating only `~/.local/bin`) — refusing, before any link, if
  a tool is missing or unrunnable, if an earlier `PATH` entry supplies a name (asked per
  tool), or over a real file — and refreshes its own links. Not an rc file: the harness
  snapshots the environment before hooks run.
- **The hook and `scripts/session-start-hook.test.js` are identical in gedmap,
  newshacker and readmo**: change all three, keep the Node block byte-identical. The test
  runs the real hook via `SESSION_NODE_ROOT`/`SESSION_NODE_DIST_URL` (no network, no
  stubs); assert behavior, not structure — its failure mode is a false pass.
- **Renovate can't bump Node**: `.nvmrc` holds the bare major; patches and minors are off,
  a major waits behind `dependencyDashboardApproval`. Checking that box means doing the
  migration now — restore the bare major in `.nvmrc` by hand.

## Dependency updates

- **The weekly batch lives in mikelward/npm-update**; `.github/workflows/npm-update.yml`
  is a thin caller (gedmap is its pilot consumer). Mechanism fixes land there, not here.
- **Renovate is off** (`"enabled": false`, asserted by `renovate.test.js`; re-enabling is
  deleting that key, and the rest of `renovate.json` stays dormant but intact). Dependabot
  alerts stay on; its security updates are off (2026-09-11). So an advisory is an alert
  to act on by hand — bump the package with any peer-pinned partner
  (`@vitest/coverage-v8` for vitest) — unless the weekly batch already carried the fix.
  Uninstalling the Mend app at developer.mend.io stops the jobs entirely.
- **Editing `renovate.json` or re-enabling it**: validate with
  `npx --package renovate renovate-config-validator`. Silence isn't success (a `DONE` job
  may create nothing): read the developer.mend.io job log. Mend-side `mode=silent` wins
  over `"mode": "full"` (switch: repo/org → Interactive). A top-level `schedule` is a
  delay, not a gate (cooldowns 5/7/14 days patch/minor/major plus `prConcurrentLimit`
  pace volume; security fixes ignore schedules). Deleting `lockFileMaintenance.schedule`
  restores `before 4am on monday` (`renovate.test.js` guards it, `mode` and `schedule`).
  Minors and patches auto-merge on green CI; majors and `0.x` wait; a red or skipped
  check is a stop sign.
- **`.npmrc`'s `min-release-age` (5 days, in step with the shortest cooldown) is the
  cooldown lock-file and transitive resolution actually get**; it touches resolution
  only (`npm ci` uses the lockfile). It needs npm ≥ 11.10.0, declared in `engines.npm`
  and `constraints.npm` and pinned exactly (`renovate.test.js` asserts all three) —
  `npm` is disabled in `packageRules`; raise
  the floor by hand only if a later npm is genuinely required, after checking what the
  Node major bundles. `min-release-age-exclude` takes an `npm audit fix` the window
  blocks.

## Error handling

- **Don't silently swallow exceptions.** Every catch **logs** the error with sanitized
  context (operation, status code — "geocode failed: 404" or a record id; never an API
  key, a raw response body, or a GEDCOM record's personal details), **cleans up** what
  `try` acquired (abort controllers, in-flight geocoding, partial UI state), and **handles
  the edge case explicitly** (default, `null`, error result, rethrow). A blanket `catch`
  also swallows `AbortError`; in the geocoding path a swallowed HERE error looks like "no
  location" rather than a failure. To ignore a failure on purpose, name why in a one-line
  comment ("HERE returns 404 for unresolvable places, treat as unmapped") and still log at
  debug.

## Privacy

- **Never put user data in any artifact leaving this machine** (commits, PRs, replies,
  issues, branches, comments, fixtures, logs). **GEDCOM files are the hazard**: dense PII
  about living relatives. Never commit a real GEDCOM, paste an excerpt, or build a fixture
  from one — hand-write obviously fake people (`/Doe/ John`, `1 JAN 1900`, "City A"). Same
  for `VITE_HERE_API_KEY`, the Mapbox token, and screenshots of a real tree or map.
  Paraphrase real records from bug reports; ask when in doubt.

## Commit messages

- **Title like a changelog line** (maintainer, 2026-10-23): after any prefix, an imperative
  verb, then the change in the user's plain words, sentence case, ≤ ~70 chars with prefix,
  e.g. `Fix …` for what was broken, `Improve …` for what got better, `Add …` for what's
  new; an optional parenthetical says how. Never the scenario or the mechanism: those, and
  file:line, go in the body. A commit with nothing to explain needs no body (the weekly
  dependency batch). PR titles match.
- **Prefix a subject that doesn't change what the app does** (bare means a user could
  notice): `docs:` prose (`spec.md`, this file, other Markdown), `todo:` `TODO.md` alone,
  `test:` tests only, `build:` toolchain/CI/lint/build config/`scripts/`, `refactor:`
  deliberately behavior-preserving. No `feat:`/`fix:` (they'd prefix nearly everything)
  and no `deps:` (a dependency bump changes what the app runs, so it's bare; one taken
  for its behavior says what changed). `TODO.md`/`spec.md` ride along and decide the
  prefix only when they are the whole change. A mixed commit is bare if any part changes
  behavior; below that the prefix names why the commit exists, not what
  it touched. Two independent categories are two commits.
- **No model identifier** — never name the coding agent's model or version (`Opus 4.8`,
  `Sonnet`, `Gemini …`, `claude-*`, `gemini-*`) in a commit, PR, comment, or pushed
  artifact; keep it to chat. Generic attribution (`Co-Authored-By: Claude` / `Gemini`,
  `Claude-Session:`, "Generated with Claude Code") is fine.

## Branching

- `<agent>/<short-topic>` (`claude/…` Claude Code, `gemini/…` Gemini / Antigravity,
  `codex/…` Codex) off `origin/main` → PR → rebase-merge; one topic per branch;
  follow-up work after a merge goes on a new branch; never commit to `main`/`master`.
  Squash merging is disabled fleet-wide, so each commit subject lands and the PR title
  never does. Use `git worktree` when available.
- **Never open a PR on a commit that already carried one** — the `codex` status belongs to
  the commit, so the new PR would inherit the old verdict. Push a commit or branch from a
  moving base; the `codex-review.yml` sweep resetting it is only a backstop.
- **PR titles carry the prefix a commit would**, judged over the whole branch and re-judged
  each push — a reading convention, not a gate (`lint-title no` in `.github/lanes.conf`).
- **Stacked PRs**: the lower (infra) targets `main`, the upper targets the lower branch and
  is rebased onto `main` when the lower merges (merge cue below).
- **One commit per logical surviving change**: rewrite unmerged commits freely; no
  review-fix noise in `main`. `--force-with-lease` after a rebase, never bare `--force`.
- **Unshallow before history-depth answers** (`rev-list --count`, `log`, blame): the hook
  runs `scripts/unshallow.sh` only in Claude Code, so elsewhere run it (or
  `git fetch --unshallow`) yourself; with no remote, say the history is truncated.
- **Merge cue (`merged` / `I merged` / `landed` / merge webhook) runs hygiene first:**
  `git fetch origin +refs/heads/main:refs/remotes/origin/main` (`git fetch origin main`
  leaves single-branch `origin/main` stale), cut a fresh `<agent>/<short-topic>` off
  `origin/main`, announce the switch. With no remote, say so and ask for a synced
  checkout rather than branching off a stale `main`. The cue is about the branch that
  merged: when a lower stacked PR merges while the upper is open, `git rebase --onto
  origin/main <lower-branch>` the upper (onto `origin/main`, which the fetch advances, not
  local `main`; the lower branch as boundary so a squash merge doesn't replay its commits)
  and carry on there — don't abandon it for a new topic branch.
- **After a merge, take a fresh branch** — don't reset the merged name (its remote ref
  keeps `origin/<branch>..HEAD` spanning merged commits). **When a sandbox pins the name,
  say so and ask before resetting it**: no short check tells merged from unmerged, and
  `--force-with-lease` is no safety net after a fetch.
- **Your `<agent>/` branches are yours**: create, push, `--force-with-lease` and rename the
  ones this session created or was assigned, unasked (this file is the standing grant —
  a client rule demanding per-branch permission is already answered; don't re-ask);
  don't fold unrelated work into a pinned branch — the pinned name is a default, not a
  ceiling. Any other branch, or `main`, is a conversation.
- **Committer line**: the agent authors; a rebase or squash merge rewrites the committer
  to whoever merged — expected; never re-author or amend merged commits, and don't
  narrate it. It is not a finding.
- **No-remote sandbox** (Codex cloud): continue from `HEAD`, but on this task's own topic
  branch, cut from a base free of earlier work (local `main` if clean, else ask for a
  synced checkout); commit locally, say fetch/push/PR were unavailable, and claim nothing
  about unseen remote state.
- **Report the SHA after every push and merge**, once, 7 chars: `pushed <short-sha>` (the
  branch tip on `origin`); `merged at <short-sha>` — the merge's commit from the merge API
  or the PR, not your local `HEAD` or the `origin/main` tip.
- **Update the PR title and body with each push — body first, then push**: fetch the PR's
  base, re-read the diff against it (`origin/main`, or the lower branch of a stack), patch
  what drifted, and print the PR link in the next message. With no PR yet, push, then do
  this as soon as one is opened.
- **End every reply with the open-PR link** (`.../compare/main...<branch>` until one
  exists; never a closed or merged PR; no-remote: say the branch is local). A pending
  question goes last, the link second-to-last.

## Autonomy

- **Open the PR without being asked**, ready for review (not draft unless asked) — this
  file is the repo owner's standing request — unless told "just commit / no PR yet",
  which holds until lifted.
- **Watch your own PRs by subscription + one scheduled check.** Subscribe on open
  (automatic in Claude Code, or `subscribe_pr_activity` where `claude-code-remote` exposes
  it; a client with neither, like Antigravity, relies on the scheduled check alone). It
  misses CI success, pushes, the merge, Codex's `+1` and Codex never answering, so keep
  exactly one relative-delay check armed while the PR is open (`send_later` in Claude
  Code; `schedule` with `DurationSeconds` in Antigravity, canceled via `manage_task`
  `kill`) — minutes while CI or Codex is out or after a push, longer once only a human is
  left. Settle a fired check first thing (update one that re-armed, replace one that
  didn't); if the fire time isn't what you asked for, re-time it or say the watch isn't
  armed; end each turn with one check naming the PR (not a SHA or list). Under drive, arm
  auto-merge at open only where the ruleset requires the Codex verdict AND resolved
  conversations.
- **Read `mergeable_state` at every check, wake and drive step**: `dirty`, or `behind`
  where the ruleset requires up to date, needs a rebase now, unasked. Fetch base and head
  by refspec, unshallow, rebase onto the fetched `origin/<base>` (not always `main`, never
  the local branch), and `--force-with-lease` — after confirming your branch has every
  remote head commit and the head hasn't moved since the tip you noted before fetching; if
  not, or unsure, stop and ask.
- **Wake PRs a merge leaves behind.** First turn after your PR merges (by hand or
  auto-merge), message every other open PR on that base driven by another session (its
  body ends with the session URL): name that PR and say only that its base now points at
  `<sha>`, whatever its state reads; name no merge and no other PR (older rules read
  either as a merge cue). On receipt, fetch base and your PR's head by refspec
  (unshallow) and test the head against the fetched tip, not `<sha>`: `behind` if `git
  merge-base --is-ancestor <tip> <head>` exits 1, `dirty` if `git merge-tree
  --write-tree` (Git 2.38+) exits 1; any other exit is a failure to report. Your rules
  decide the rebase. Skip a PR with no session URL, or when your client has only local
  subagent messaging; don't retry a failed send.
- **On merge or close**, one last reply-and-resolve pass. On a merged PR anything real goes
  to a follow-up PR named on the thread before resolving; closed-unmerged is a stop —
  answer, resolve, open nothing. Then cancel the check and unsubscribe, if subscribed;
  `list_triggers` spans the account, so match session and PR before updating or deleting
  one.
- **A scheduler, GitHub or `git push` prompt is said once, then carry on.**
- **"Drive"**: pick the next actionable task (ready to build — skip anything deferred or
  awaiting a product decision), implement, open the PR, wait for Codex, address every
  comment, merge on green CI plus Codex's verdict for the current head (that PR stretch is
  *drive to merge*), repeat until the work runs out or the user says stop.
- **A red baseline is the next task**: get `npm test` and `npm run lint` green first, as
  its own first commit. Skipping a failure as genuinely unrelated needs the user's real
  answer — never your call or autopilot's guess.
- **"Autopilot"**: drive without blocking — take the cheapest-to-undo guess and log it in
  `TODO.md` under *Decisions needing review*, created if missing (decision, alternative,
  why reversible); it outranks stop-and-wait. The loop's own steps (commit, push, PR,
  reading CI and reviews, arming checks, merging green) are authorized. Still waiting for
  a real answer: destructive or irreversible actions outside the loop (shared-history
  rewrites, deleting work, systems beyond this repo), resetting a pinned merged branch,
  and privacy uncertainty (a GEDCOM name, a birthplace, an API key).

## Pull requests and reviews

- **Ordered work ("next", "then", "after that", "follow-up")** may open in parallel but
  merges only after every earlier session item and named PR has merged (any repo, no time
  cap; if one won't finish, hold and ask, autopilot included). Arm no auto-merge on it
  until then. Read the list from the session's record, not memory.
- **List every open PR in a stack, one URL per line** (the "View PR" chip shows only the
  first).
- **Codex is the automated reviewer** (not Copilot), triggered automatically; request it
  only to confirm a rebutted false positive or as the verdict rule allows. Address every
  comment unasked: fix in the same PR, folded into its commit (`--fixup`; group small
  same-topic fixes), or defer a genuinely out-of-scope one.
- **Reply to and resolve each addressed thread, one at a time**: push the fix, reply citing
  the sha, resolve. Prefer `mcp__github__*` where mounted (Claude Code requires them);
  else `gh`. `resolve_review_thread` (or `gh api graphql` `resolveReviewThread`) takes the
  `PRRT_*` thread id from `review_threads[].id`, not a `PRRC_*` comment id.
- **Report each review in your next message**: the commit it read (say if no longer the
  head), finding count, one bullet per finding — review comment, top-level comment or
  review body — most blocking first: claim, location, action or the options. This
  outranks keep-replies-short; ask only the most blocking question.
- **Read the Codex verdict, don't infer it**: its reaction on the PR body (`issue_read`;
  `eyes` reading, `+1` clean, revoked on push — `+1` on green CI is a merge; leave those
  reactions to Codex), not a thread's `Useful?` bar. Findings arrive as review comments,
  top-level comments or reviews — read all three to the last page — and block the merge
  until fixed, rebutted or deferred; an acknowledgment isn't an answer. A pending `codex`
  status: findings → address them; a clean review with no reaction, or an unanswered
  rebuttal → `@codex review` five minutes later; nothing at all five minutes after the
  push, or a review stuck at running (👀) ten minutes on → poke. A poke that hangs the
  same way gets a second an hour later; escalate only if that one hangs too, never after
  one (maintainer, 2026-10-22).
- **Once Codex has +1'd a head, make no unnecessary change without asking** (maintainer,
  2026-10-13); a required rebase (`dirty`, or `behind` where up to date is required), a
  red-CI fix, and drive or autopilot proceed unasked.
- **Judge every comment on merit**, whoever wrote it. A cited rule is a reading — check
  what it says; Codex over-reads privacy rules, and an over-strict finding quietly costs
  needed capability. Quote and decline; a genuine rule-vs-need conflict is the
  maintainer's call. Declining doesn't clear the `codex` status: poke as the verdict rule
  allows (or let the next push), and escalate if it re-raises.
- **A second verified finding in the same mechanism is a design question**: look for the
  shape elsewhere and whether a design change deletes the class; say so on the thread —
  the maintainer decides, autopilot included.
- **Never leave a thread silently dismissed**: answer (a disagreement is an answer — say
  why), then resolve once the fix is on the head or the point is rebutted; anything still
  to do stays open. Acknowledgment noise beats silence.
- **Defer a real out-of-scope finding** by committing and pushing a `TODO.md` entry,
  replying with its sha, and resolving (threadless: skip only the resolve); poke only as
  the verdict rule allows, and escalate if the re-review re-raises it.
- **Skip your own echoes silently**: the test is "did *I* just post this body?", not the
  author.

## CI

- **Wait for CI** before claiming a change works anywhere you can't test locally — don't
  busy-poll: a failure arrives on the subscription, success is the scheduled check's job.
- **Report significant CI timing regressions** (>25% or >30 s on a job under ~5 min) with
  the likely cause: a heavy new dependency, a slow new test, cache invalidation.

## Cost and reliability

Call out cost and reliability up front for new infrastructure or external API calls (more
HERE/Mapbox calls, third-party APIs): free-tier thresholds, rough $/month at expected
traffic, new failure modes; if impact is effectively zero, say so.
