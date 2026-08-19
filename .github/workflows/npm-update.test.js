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

describe("npm-update caller", () => {
  it("calls the reusable workflow and grants it what its jobs need", () => {
    expect(caller).toContain(
      "uses: mikelward/npm-update/.github/workflows/npm-update.yml@",
    );
    expect(caller).toContain("contents: write");
    expect(caller).toContain("pull-requests: write");
    expect(caller).toContain("actions: write");
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
