# TODO

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
only those two triggers, so the weekly `dependency-update.yml` pull request
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
cannot hide it. `dependency-update.test.js` pins the call, the trigger, the
ordering against body composition, and that separation. Raised by Codex on the
pull request that installed these files.
