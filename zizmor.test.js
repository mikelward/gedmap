// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Tests for the advisory zizmor scan: the workflow that runs it and the
// policy it loads.
//
// The scan's failure modes are all silent: a dropped version pin floats the
// audit set, so a verdict can change with no change in this repository; a
// dropped --offline puts the GitHub API inside the scan; a widened policy
// exempts refs nobody decided to exempt; a narrowed path filter stops
// re-running the scan on the files it audits. Every one of those leaves the
// rest of the suite green, because zizmor only runs inside its own
// workflow — so the contract is pinned here. Read with regexes like the
// engine repositories' own suites: no YAML parser, on purpose. Ported from
// mikelward/codex-review's own zizmor.test.js.

const workflow = readFileSync('.github/workflows/zizmor.yml', 'utf8');
const policy = readFileSync('.github/zizmor.yml', 'utf8');

const stripComments = (text) =>
  text
    .split('\n')
    .map((line) => line.replace(/\s+#.*$/, ''))
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');

const policyEntries = (text) =>
  [...text.matchAll(/^ {8}"?([^":\n]+?)"?: *(\S+)$/gm)].map((m) => `${m[1]}: ${m[2]}`);

describe('zizmor workflow', () => {
  it('pins the zizmor version exactly and scans offline', () => {
    // An unpinned run takes whatever release is newest, and a new release
    // adds audits — bumping the pin is a deliberate edit that re-reads the
    // findings, never a side effect. --offline means the audits that need
    // the GitHub API are skipped deterministically.
    expect(workflow).toMatch(/pipx run --spec zizmor==\d+\.\d+\.\d+ zizmor /);
    const runs = [...workflow.matchAll(/pipx run [^\n]+/g)];
    expect(runs).toHaveLength(1);
    expect(runs[0][0]).toMatch(/ --offline /);
  });

  it('holds read-only permissions, once', () => {
    // Pins the whole grant, so the scan can never grow a scope quietly. The
    // top-level block must also be the ONLY one — a second block anywhere
    // is a widening no matter how it is scoped.
    expect(workflow).toMatch(/\npermissions:\n {2}contents: read\njobs:/);
    expect([...workflow.matchAll(/^ *permissions:/gm)]).toHaveLength(1);
  });

  it('re-runs when anything it scans changes', () => {
    const filters = [...workflow.matchAll(/paths: \[(.+)\]/g)].map((m) => m[1]);
    expect(filters).toHaveLength(2);
    for (const f of filters) {
      expect(f.split(',').map((p) => p.trim())).toEqual(["'.github/**'"]);
    }
  });
});

describe('zizmor policy', () => {
  it('holds the pin-policy table exact', () => {
    // `@main` is the release for the enumerated sibling actions, official
    // actions may pin tags, and the blanket hash-pin rule has to be
    // restated because supplying policies replaces zizmor's defaults.
    // Compared whole: an entry added, dropped, or widened (say,
    // mikelward/*) fails here, whichever shape it takes.
    expect(policyEntries(stripComments(policy))).toEqual([
      'mikelward/codex-review: ref-pin',
      'mikelward/codex-review/.github/workflows/check-consumer.yml: ref-pin',
      'mikelward/lanes: ref-pin',
      'mikelward/npm-update/.github/workflows/npm-update.yml: ref-pin',
      'actions/*: ref-pin',
      '*: hash-pin',
    ]);
  });

  it("excuses this repository's own privileged triggers, nothing else", () => {
    // codex-review.yml and codex-review-check.yml both carry
    // pull_request_target deliberately and neither checks out or executes
    // pull request code with the elevated token. Compared whole, so a new
    // workflow reaching for pull_request_target is still flagged.
    const ignored = [...policy.matchAll(/^ +- (\S+)$/gm)].map((m) => m[1]);
    expect(ignored).toEqual(['codex-review.yml', 'codex-review-check.yml']);
  });
});
