# TODO

## Finish the gate → lanes check rename

The consumer-facing required check was renamed from `gate` to `lanes`
(mikelward/lanes#9). `lanes` now runs alongside `gate` here (both green),
but two steps remain, outside what a session without ruleset API access can
do:

- [ ] Flip the ruleset to require `lanes` instead of `gate`, now that
      `lanes` has reported on a `pull_request` run here: `repo-rules
      mikelward/gedmap lanes ...` (naming every check the ruleset should
      require — `mikelward/scripts`' tool).
- [ ] Once the ruleset requires `lanes`, delete the now-redundant `gate`
      job and its parity test (`workflow-check-rename.test.js`) in a
      follow-up PR.

## Review and merge gates

- [ ] **Add `zizmor` to the ruleset's required set** once it has reported
      on a pull request: the zizmor workflow now runs unfiltered on every
      PR precisely so it can be required (a paths-filtered workflow
      creates no check run at all on a non-matching PR, which a ruleset
      waits on forever) — the posture piloted in mikelward/lanes and
      mikelward/ci-commit-artifact. `repo-rules mikelward/gedmap` (naming
      every check the ruleset should require — `mikelward/scripts`' tool).
      **Precondition:** the weekly dependency PR is authored with
      `GITHUB_TOKEN`, which triggers no `pull_request` workflows, so a
      required `zizmor` would block it forever — the same trap
      npm-update's explicit `ci.yml`/`codex-review-check.yml` dispatches
      exist for (see npm-update.test.js). Before flipping the ruleset,
      give zizmor.yml a `workflow_dispatch` trigger and teach
      mikelward/npm-update's reusable workflow to dispatch it — a
      shared-mechanism change that lands in that repo, piloted through
      one consumer per its conventions.

## Decisions needing review

Guesses made under autopilot, recorded so nothing decided without the
repository owner silently becomes permanent. Each says what was decided, what
the alternative was, and why it is reversible.

- [ ] **The Codex gate's two documented limitations are taken as-is.** The
      shared codex-review setup is installed unchanged, with both known gaps
      recorded in `mikelward/codex-review`'s `docs/CONSUMER.md` rather than
      fixed here: a fork pull request's head gets no `codex-review-check`, and
      the head-associated run of that check comes from its own `push` trigger,
      so a same-repository pull request could in principle supply a job of
      that name calling something else. The alternative was holding this
      conversion until both are closed upstream. Fork pull requests are not a
      case these repositories take, and the second has no configuration remedy
      available — GitHub's *Require workflows to pass before merging* is an
      organization-ruleset rule and these repositories are on a personal
      account. The three workflow files are byte-identical template copies, so
      a local edit would fail the pin either way.
      *Reversible:* entirely — re-copy `templates/` when a remedy lands. Both
      are written out in full there, including the implementable one: move the
      consumer comparison inside the sweep, whose definition comes from the
      default branch and so is out of a branch's reach.

- [ ] **`.github/workflows/codex-review.test.js` was deleted rather than kept
      alongside the shared check.** It asserted the shape of a workflow file
      that is now compared byte for byte against the upstream template, where
      the same assertions are made once for all nine consumers. Keeping both
      means a local test that can only fail *after* the pin already has, or
      one that drifts into asserting something the template does not say —
      review found three different holes in three different hand-copied
      versions of this test in a single afternoon, which is what prompted the
      consolidation. `vite.config.js` sets no `include`, so vitest's default
      pattern picked the file up and simply stops seeing it; nothing needed
      rewiring, and `npm test` still passes (18 files, 309 tests).
      *Reversible:* one `git revert`.

## Add the ruleset settings the Codex gate expects

The ruleset already requires `codex`. Two more it does not have yet, both
explained in the shared `docs/CONSUMER.md`: require
`codex-review-check / codex-review-check`, and require branches to be up to
date before merging. Deliberately a follow-up — requiring a check in the same
change that installs it would block the change that installs it.

**The precondition that used to sit here is satisfied, and this note records
why it existed so it is not reintroduced.** A pull request created by
`GITHUB_TOKEN` does not trigger `on: pull_request`-family workflows — GitHub's
loop-prevention rule, with no per-repository opt-out — and that covers the
branch `push` as well as `pull_request_target`. `codex-review-check.yml` had
only those two triggers, so the weekly `npm-update.yml` pull request
would have carried no run of it at all: requiring the check would have blocked
that merge forever, with the auto-merge the job arms never firing and an
unattended job's output sitting open with nothing saying why.

The `codex` status was never exposed the same way, which is why requiring it
already worked: the sweep also runs on a `schedule`, so it reaches those pull
requests within the hour even when no event does. The check has no such
backstop, which is what made it specific to this repository.

Both halves are now in place. `workflow_dispatch` is on the shared
`codex-review-check.yml` template (`mikelward/codex-review#16`), and the
publish job dispatches it beside `ci.yml` using the `actions: write` scope it
already held. A failed dispatch is reported in the pull request body rather
than only the run summary, and outside the CI branch, so a failed CI dispatch
cannot hide it. `npm-update.test.js` pins the call, the trigger, the
ordering against body composition, and that separation. Raised by Codex on the
pull request that installed these files.

## CI

- Add an AGPL license gate: fail CI if a dependency declares an AGPL
  license, so introducing one by hand in a normal PR is caught, not just
  ones the weekly bot bumps. Likely `license-checker-rseidelsohn` checking
  the AGPL SPDX family, as a step in `ci.yml`'s existing `ci` job. GPL/LGPL
  undecided, matching typelauncher#632. Needs to satisfy
  `npm-update.test.js`'s ci.yml/npm-update.yml parity check too — work out
  the details (regex classification, pinning, exact command match) when
  actually building this, not here.

## Launch readiness (measurement, cost, overload)

gedmap has a natural audience it has never been shown to — genealogy
communities are large, underserved by good tooling, and full of hobbyists who
already pay for software. The blockers below are all things that would make a
successful post *worse* than no post: an app that looks broken to everyone who
arrives after a quota cap, with no instrumentation to say what happened.

Business-model reasoning (one-off vs. subscription, BYOK, price anchors) is in
`readmo/MONETIZATION.md` — this section is the engineering that is needed
whether or not anything is ever charged for.

### Measurement — nothing exists today

gedmap measures **nothing**: no analytics dependency, no backend, no accounts.
It is the only web product flying completely blind.

- [ ] **Cost and reliability of `@vercel/analytics`** (AGENTS.md requires this
      before recommending an external call, and the item below didn't have it):
      - **Cost — effectively zero at any plausible gedmap volume.** Vercel Web
        Analytics is included on the Pro plan this project already pays for,
        with an included monthly event allowance and usage-based pricing above
        it. Confirm the current included figure before launch rather than
        trusting this line; at three users it is not close, and even a Show HN
        day is a rounding error against it. Custom events count toward the same
        allowance, which is the argument for bucketing values rather than
        emitting one event per distinct number.
      - **Reliability — no user-facing failure mode.** It is a client-side
        script that fires and forgets: blocked by ad blockers and privacy
        browsers (so treat every count as a floor, not a census), and silently
        absent when Vercel is down. Nothing in gedmap reads it back, so an
        outage costs a gap in the data and nothing else. No added latency on
        any path the user waits for.
- [ ] Add `@vercel/analytics` and a handful of real events: file uploaded,
      ancestors parsed (bucketed count), geocode run completed (bucketed
      counts of mapped / failed / unavailable), map interacted with. Bucket
      values so the breakdown UI stays readable (newshacker's
      `src/lib/analytics.ts` `bucket20` is the precedent).
- [ ] **Never send a place name, an ancestor name, or anything else off a
      GEDCOM** — see AGENTS.md *Privacy*. Counts and buckets only. This is the
      one place analytics could quietly become a PII leak, so assert it in a
      test rather than trusting review.
- [ ] Capture a baseline **before** any community post. Instrumenting after a
      launch says nothing about what changed.

### Cost ceilings and quota exhaustion

- [x] Distinguish "geocoder unavailable" from "place not found" so a 429 stops
      reading as a file full of missing places (`spec.md` §Unmapped Ancestors).
- [ ] **Persist the geocode cache.** It is currently a module-level `Map` in
      `src/utils/geocode.ts` — in-memory, per page load, gone on refresh. Every
      visitor re-geocodes every place from scratch, so repeat sessions cost
      full price. HERE's free tier is 250k requests/month; at a few hundred
      distinct places per file that is roughly 500 sessions before the ceiling.
      A post that does well brings that in an afternoon. Persisting to
      localStorage/IndexedDB takes repeat visits to ~zero API calls and is the
      single highest-value cost fix here.
      - Cache successes and confirmed no-matches; **never** cache an
        unavailable — a 429 must not poison a place for later sessions.
      - Bound the entry count and version the key so a shape change can't
        strand a stale cache.
      - Places are GEDCOM data, so this is device-local storage only. It never
        syncs anywhere.
- [ ] **Check Mapbox's exposure too.** The geocoder is not the only metered
      dependency — Mapbox GL JS bills per map load beyond its free allowance,
      and a traffic spike hits it on the same day. Confirm the current
      threshold and what happens when it is crossed (does the map fail
      visibly, or silently render nothing?).
- [ ] **Set billing alerts on both HERE and Mapbox** at a fraction of the free
      tier, so the first warning is an email rather than a broken app or a
      bill. There is no server here to notice on your behalf.
- [ ] Consider **BYOK for the HERE key** (clothescast does this for Gemini). No
      revenue, but it removes gedmap from the cost line entirely and makes
      one-off pricing safe — see `readmo/MONETIZATION.md`.

### Monitoring and alerting

gedmap is fully client-side, so there is no server to monitor and nothing to
page. What is missing is the ability to know a bad deploy happened at all.

- [ ] Decide whether client-side error reporting is worth it, and be explicit
      that it is a **Data Safety / privacy decision, not an implementation
      detail** — an unfiltered stack trace or breadcrumb can carry a place
      name. If adopted, the same floor as the analytics item applies, plus a
      scrub of any message that could quote a GEDCOM value.
- [ ] Until then, note plainly that a runtime error after deploy is invisible
      unless a user reports it.
