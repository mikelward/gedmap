// Contract tests for this repository's SIDE of the npm-update extraction
// (mikelward/npm-update). The reusable workflow's own behavior is tested
// there — this file only covers what only THIS repository can verify: that
// ci.yml and codex-review-check.yml still carry what the reusable workflow's
// dispatch calls depend on, and that this repo's own caller wires the
// permissions those calls need. A silent removal of any of these would leave
// the weekly PR without CI or the codex check, with nothing here — or in the
// hub, which cannot see this repo's ci.yml — red to say so.
//
// Read with regexes, not a YAML parser, matching every other suite in this
// repository.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (relative) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const caller = read("./npm-update.yml");
const ci = read("./ci.yml");
const consumerCheck = read("./codex-review-check.yml");

// The `dispatch-workflows` input, as a list of file names. Accepts the
// inline form the caller uses today and a block scalar, since either is
// valid YAML for it and the contract is about the names, not the spelling.
const dispatchedWorkflows = () => {
  const inline = caller.match(/^ *dispatch-workflows: *(?![|>])(\S.*)$/m);
  if (inline) return [inline[1].trim()];
  const block = caller.match(/^ *dispatch-workflows: *[|>][-+]?\n((?: +\S.*\n)+)/m);
  return block ? block[1].split("\n").map((l) => l.trim()).filter(Boolean) : [];
};

describe("npm-update caller", () => {
  it("calls the reusable workflow and grants it what its jobs need", () => {
    expect(caller).toContain(
      "uses: mikelward/npm-update/.github/workflows/npm-update.yml@",
    );
    expect(caller).toContain("contents: write");
    expect(caller).toContain("pull-requests: write");
    expect(caller).toContain("actions: write");
  });

  it("names zizmor.yml among the workflows the hub must dispatch", () => {
    // The batch's PR is opened by GITHUB_TOKEN, which starts no
    // `on: pull_request` workflow. ci.yml and codex-review-check.yml the hub
    // dispatches unconditionally; anything else this repository's ruleset
    // requires -- zizmor, once it is required here -- only runs because it
    // is named in this input. Dropping the line would leave the weekly PR
    // pending forever on a check nothing produces, which is not a failure
    // anyone sees.
    expect(dispatchedWorkflows()).toContain("zizmor.yml");
  });

  it("names only workflows that are actually dispatchable", () => {
    // The other half of the same contract, and the half that fails
    // silently: `gh workflow run` on a file with no `workflow_dispatch:`
    // trigger errors, the hub reports it in the PR body and carries on, and
    // the check still never reports. Derived from the caller rather than
    // hard-coded, so a workflow added to the input later is covered by this
    // the day it is added.
    const named = dispatchedWorkflows();
    expect(named.length).toBeGreaterThan(0);
    for (const file of named) {
      expect(read(`./${file}`)).toMatch(/^\s*workflow_dispatch:/m);
    }
  });

  it("opens the batch PR as a real collaborator, not as GITHUB_TOKEN", () => {
    // The dispatch input above closes one required check at a time, by
    // name; this closes the class. A PR opened by GITHUB_TOKEN starts no
    // `on: pull_request` workflow at all, so a required check nobody
    // thought to name holds the weekly PR open forever on a status nothing
    // produces -- no red tick, no explanation, which reads as verified.
    // With this secret the ordinary round runs for the batch PR like any
    // other, covering checks added after this line was written. Losing the
    // line is silent in the worst way: the batch keeps opening PRs, they
    // just stop being checked.
    //
    //
    // The credential travels as `secrets: inherit`, not as a `secrets:`
    // block naming NPM_UPDATE_PAT: the hub's publish job reads it from this
    // repository's `npm-update` environment, and an environment secret
    // reaches a called workflow no other way -- a secret passed by name
    // reaches the runner of every job in the called workflow, the untrusted
    // update job included. Matched as the job-level key, so a block that
    // quietly went back to naming the secret fails here rather than
    // downgrading the isolation.
    expect(caller).toMatch(/^ {4}secrets: inherit$/m);
    expect(caller).not.toContain("NPM_UPDATE_PAT }}");
  });

  it("owns the schedule and the manual trigger", () => {
    // The reusable workflow is workflow_call only -- it cannot schedule
    // itself, so this repo's caller has to.
    expect(caller).toMatch(/^\s*- cron: '17 6 \* \* 6'/m);
    expect(caller).toMatch(/^\s*workflow_dispatch:/m);
  });
});

describe("ci.yml, as the npm-update dispatch target", () => {
  it("stays dispatchable, with the pr input the reusable workflow sends", () => {
    // The reusable workflow calls `gh workflow run ci.yml --ref "$branch"
    // -f pr="$pr"` -- gh rejects an -f for an input the target workflow
    // never declared, so removing this trigger or its `pr` input breaks the
    // dispatch (non-fatally on the hub side, but CI then never starts here).
    expect(ci).toMatch(/^\s*workflow_dispatch:/m);
    const dispatchBlock = ci.slice(ci.indexOf("workflow_dispatch:"));
    expect(dispatchBlock).toMatch(/^\s*inputs:/m);
    expect(dispatchBlock).toMatch(/^\s*pr:/m);
  });

  it("stays read-only, since a dispatched run executes unreviewed dependency code", () => {
    // The dispatched run installs the batch's own updated dependencies and
    // runs their lifecycle scripts -- a write-capable token here would undo
    // the whole no-write-token boundary the reusable workflow's update job
    // is built around, by a route neither repository's own tests can see
    // without checking THIS file.
    expect(ci).toContain("\npermissions:\n  contents: read\n");
    const checkouts = (ci.match(/actions\/checkout@/g) ?? []).length;
    expect(checkouts).toBeGreaterThan(0);
    expect((ci.match(/persist-credentials: false/g) ?? []).length).toBe(
      checkouts,
    );
  });
});

describe("codex-review-check.yml, as the npm-update dispatch target", () => {
  it("stays dispatchable", () => {
    // codex-review-check.yml's own triggers (push, pull_request_target) are
    // both suppressed for a GITHUB_TOKEN-authored PR, and it has no schedule
    // to fall back on -- so once the ruleset requires this check, a batch
    // without a working dispatch here would block the weekly PR forever.
    // Sends no -f, unlike the ci.yml dispatch, so no input to check for.
    expect(consumerCheck).toMatch(/^\s*workflow_dispatch:/m);
  });
});
