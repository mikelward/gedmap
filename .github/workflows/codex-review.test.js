// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Tests for the codex-review workflow pair.
//
// The sweep's logic and its tests live in mikelward/codex-review; what stays
// in THIS repo is the workflow that grants it a token and decides when it
// runs — and every one of these pins guards a value whose wrong setting
// produces no error, just a gate that silently stops doing its job. The
// design rationale is in the workflow's own header and, at full length, in
// the shared repo.
//
// Two rules hold this file together, both learned by review finding a YAML
// notation the checks did not see:
//
// 1. NO NEGATIVE ASSERTIONS. Absence is unbounded, so a `not.toContain` only
//    rejects the spellings someone anticipated; `write-all`, a `.yaml`
//    filename, `statuses: "write"` and `"pull_request":` each sailed past
//    one. Compare whole sets and whole blocks instead.
// 2. THE WORKFLOWS THEMSELVES ARE PINNED AS TEXT. Rule 1 still leaves the
//    extractors — trigger keys, permissions blocks, step counts — as regexes
//    over YAML. The first two tests compare each file's directive lines
//    against an expected list, so nothing under test is extracted or
//    approximated. The checks after them can be fooled; the pins cannot, so a
//    mutation that slips past one still fails the other. Keep it that way.

const dir = fileURLToPath(new URL('.', import.meta.url));
const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');

const WORKFLOW = 'codex-review.yml';
const LISTENER = 'codex-review-listener.yml';

/**
 * Both extensions GitHub accepts for a workflow.
 *
 * Filtering to `.yml` alone would let a `.yaml` file request `statuses:
 * write` while the sole-writer check below still passed — the invariant
 * bypassed by a filename, with the test reporting green.
 */
const isWorkflow = (file) => /\.ya?ml$/.test(file);

/**
 * A workflow's YAML with its comment lines removed.
 *
 * These files carry more prose than YAML, and every phrase this suite looks
 * for — `statuses: write`, `workflow_dispatch` — is also something the
 * comments have to be able to *discuss*. Matching the raw text conflates the
 * two in the direction that hurts. Reading only the directives keeps the
 * prose free to say anything.
 */
const directives = (name) =>
  read(`./${name}`)
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');

/** Directive lines, blanks dropped — what the line-for-line pins compare. */
const directiveLines = (name) =>
  directives(name)
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => line.trimEnd());

const yml = directives(WORKFLOW);

/**
 * Every `permissions:` block in a workflow, top-level or per-job, as trimmed
 * lines.
 *
 * Deliberately finds per-job blocks too, so a job-level grant cannot hide
 * under a top-level block that disclaims it. A block runs until a line
 * indented no deeper than its own key, so a one-line flow mapping
 * (`permissions: {statuses: write}`) comes back as itself and fails the
 * comparison rather than parsing to nothing.
 */
const permissionBlocks = (text) => {
  const lines = text.split('\n');
  const blocks = [];
  lines.forEach((line, i) => {
    const opener = /^(\s*)permissions:/.exec(line);
    if (!opener) return;
    const depth = opener[1].length;
    const block = [line.trimEnd()];
    for (let j = i + 1; j < lines.length; j += 1) {
      const indent = lines[j].search(/\S/);
      if (indent === -1 || indent <= depth) break;
      block.push(lines[j].trimEnd());
    }
    blocks.push(block);
  });
  return blocks;
};

/**
 * Every `permissions:` block each *other* workflow may declare, in order.
 *
 * Pinned by ALLOWLIST rather than by forbidden spellings, and that is the
 * whole design. YAML has unboundedly many notations for one mapping —
 * `write-all`, `statuses: "write"`, `"statuses": write`, a flow mapping — and
 * a denylist has to know them all while an honest refactor needs only one.
 * Comparing each workflow's blocks against the exact ones it is known to need
 * inverts that: any change, in any notation, fails here and has to be
 * re-approved. Declaring NO block is rejected too, since that inherits the
 * repository's default GITHUB_TOKEN permission — a setting no file here can
 * read.
 */
const ALLOWED_PERMISSIONS = {
  'ci.yml': [['permissions:', '  contents: read', '  pull-requests: read']],
  [LISTENER]: [['permissions: {}']],
  'dependency-update.yml': [
    ['permissions: {}'],
    ['    permissions:', '      contents: read'],
    [
      '    permissions:',
      '      contents: write',
      '      pull-requests: write',
      '      actions: write',
    ],
  ],
};

/**
 * The top-level keys of the `on:` mapping, unquoted.
 *
 * Compared as a SET below rather than probed for forbidden names.
 * `"pull_request":` is valid YAML naming the same trigger, and a
 * `not.toContain('pull_request:')` sails past it. A set comparison has
 * nothing to spell: anything added, removed or renamed fails, in whatever
 * notation.
 */
const triggerKeys = () => {
  const lines = yml.split('\n');
  const start = lines.findIndex((line) => /^on:/.test(line));
  const keys = [];
  let depth = null;
  for (let i = start + 1; i < lines.length; i += 1) {
    const indent = lines[i].search(/\S/);
    if (indent === -1) continue;
    if (indent === 0) break;
    if (depth === null) depth = indent;
    if (indent !== depth) continue;
    const key = /^\s*["']?([A-Za-z_][\w-]*)["']?\s*:/.exec(lines[i]);
    if (key) keys.push(key[1]);
  }
  return keys.sort();
};

/** The trigger block, for the `types:` completeness checks below. */
const triggers = yml.slice(yml.indexOf('\non:'), yml.indexOf('permissions:'));

describe('codex-review workflow', () => {
  it('is exactly this, line for line', () => {
    // The gate the rest of this file only describes. Every check below
    // extracts something with a regex, and a regex over YAML is an
    // approximation of YAML; patching the notation that slipped past buys
    // the next one. So the security-critical file is pinned as text: any
    // edit in any notation changes these lines and has to be re-approved by
    // editing this list. Comments and blanks are excluded, so the prose
    // above each stanza stays free to change.
    expect(directiveLines(WORKFLOW)).toEqual([
      'name: codex-review',
      'on:',
      "  schedule:",
      "    - cron: '23 * * * *'",
      '  pull_request_target:',
      '    types: [opened, reopened, ready_for_review, synchronize, edited, closed]',
      '  issue_comment:',
      '    types: [created, edited]',
      '  pull_request_review_comment:',
      '    types: [created, edited]',
      '  workflow_run:',
      '    workflows: [codex-review-listener]',
      '    types: [completed]',
      'permissions:',
      '  contents: read',
      '  pull-requests: read',
      '  checks: read',
      '  statuses: write',
      'concurrency:',
      '  group: codex-review',
      '  cancel-in-progress: false',
      'jobs:',
      '  sweep:',
      '    runs-on: ubuntu-latest',
      '    timeout-minutes: 65',
      '    steps:',
      '      - uses: mikelward/codex-review@main',
    ]);
  });

  it('has a listener that is exactly this, line for line', () => {
    // Pinned for the same reason, and it matters more than its four
    // directives suggest: this file is what makes it safe for the sweep to
    // hear `pull_request_review` at all. Grant it any permissions and the
    // relay stops being a relay.
    expect(directiveLines(LISTENER)).toEqual([
      'name: codex-review-listener',
      'on:',
      '  pull_request_review:',
      '    types: [submitted, edited, dismissed]',
      'permissions: {}',
      'jobs:',
      '  heard:',
      '    runs-on: ubuntu-latest',
      '    timeout-minutes: 5',
      '    steps:',
      "      - run: 'true'",
    ]);
  });

  it('starts on exactly these events and no others', () => {
    // The security-critical one. `workflow_dispatch` takes a ref and GitHub
    // runs the workflow file from it, so a branch could supply its own steps
    // and keep the write token; a bare `pull_request` has the same hole via
    // the merge ref. Pinning the action version does not help when the branch
    // supplies the job around it.
    //
    // Asserted as the whole set rather than as forbidden names: a denylist
    // has to know every spelling in advance, and YAML has more than one for
    // everything.
    expect(triggerKeys()).toEqual([
      'issue_comment',
      'pull_request_review_comment',
      'pull_request_target',
      'schedule',
      'workflow_run',
    ]);
  });

  it('starts the loop on pull request events, so a fresh head never waits on the schedule', () => {
    // `pull_request_target` takes the definition from the BASE ref, so unlike
    // dispatch a PR cannot bring its own sweep — and it is the only
    // event-driven start available, since reactions emit no webhook at all.
    expect(triggers).toMatch(/pull_request_target:/);
    expect(triggers).toMatch(/types:.*\bsynchronize\b/);
    expect(triggers).toMatch(/types:.*\bopened\b/);
    // `reopened` reuses an unchanged SHA, which may still carry an earlier
    // `codex: success`.
    expect(triggers).toMatch(/types:.*\breopened\b/);
    expect(triggers).toMatch(/types:.*\bready_for_review\b/);
    // `closed` clears a shared-head failure the moment the duplicate PR goes
    // away — a webhook-capable, merge-enabling transition.
    expect(triggers).toMatch(/types:.*\bclosed\b/);
    // `edited` on THIS stream is the retarget: pointing a pull request at a
    // different base changes the reviewed diff, sometimes completely, while
    // the head SHA and its `codex: success` stand still. GitHub emits
    // `edited` for that rather than `synchronize`.
    expect(triggers).toMatch(/pull_request_target:\s*\n\s*types:.*\bedited\b/);
  });

  it('starts the loop on comment events, for the round that has no push', () => {
    // A rebuttal plus an "@codex review" nudge changes the verdict with no
    // pull_request event anywhere, and the reactions that follow emit
    // nothing. Both streams also fire on `edited`, since a nudge edited into
    // an existing comment is dated by its edit.
    expect(triggers).toMatch(/issue_comment:/);
    expect(triggers).toMatch(/pull_request_review_comment:/);
    expect(triggers.match(/types: \[created, edited\]/g)).toHaveLength(2);
  });

  it('relays bare-review verdicts through the unprivileged listener', () => {
    // A verdict submitted as a review with NO inline comments emits neither
    // comment event and no reaction, so without this relay nothing hears it
    // until the hourly schedule. It cannot be heard directly: GitHub resolves
    // a `pull_request_review` workflow against the pull request's merge ref,
    // so on a file holding `statuses: write` a same-repository branch could
    // substitute its own steps and publish `codex: success` for itself.
    // `workflow_run` always runs the default branch's definition.
    //
    // Both ends are pinned together because the relay is a name match, so
    // renaming one alone severs it in silence.
    expect(triggers).toMatch(/workflows: \[codex-review-listener\]/);
    expect(directives(LISTENER)).toMatch(/^name: codex-review-listener$/m);
  });

  it('keeps the backstop schedule hourly, off the hour', () => {
    // The schedule only has to keep a run alive; the run is the clock.
    // Everything it alone catches fails closed, and any comment on the PR
    // clears those on demand. Off the hour, dodging the :00 stampede.
    expect(yml).toMatch(/cron:\s*'23 \* \* \* \*'/);
  });

  it('holds the loop envelope: one queued successor, bounded runner', () => {
    // A canceled loop is a gate that stopped sweeping mid-review. Without a
    // timeout a wedged API call keeps the runner for the 6-hour default, and
    // the queued successor waits behind it, stalling the gate. Above the
    // action's own 55-minute loop, or a healthy run gets killed.
    expect(yml).toMatch(/cancel-in-progress:\s*false/);
    const minutes = Number(yml.match(/timeout-minutes:\s*(\d+)/)?.[1]);
    expect(minutes > 55).toBe(true);
  });

  it('runs the shared action, as its only step', () => {
    // One step, and it is the action. Counted rather than asserted absent: a
    // checkout would put this repo's code in the same job as the write token
    // for no reason, and "no checkout" is a denylist of one where "one step"
    // is the property actually wanted.
    const steps = yml.slice(yml.indexOf('steps:')).match(/^\s+-\s\S/gm) ?? [];
    expect(steps).toHaveLength(1);
    expect(yml).toMatch(/uses:\s*mikelward\/codex-review@main\b/);
  });

  it('is the only workflow that can write commit statuses', () => {
    // The sweep's correctness leans on being the sole writer: a second writer
    // is an unordered write, and one delayed past the loop's exit overwrites
    // a just-published success with nothing left to notice. A regression here
    // is silent, so it is pinned by allowlist — see ALLOWED_PERMISSIONS.
    const all = readdirSync(dir).filter(isWorkflow);
    const others = all.filter((f) => f !== WORKFLOW);
    // Two guards on the guard. An empty listing would make the loop below
    // vacuous, and a `WORKFLOW` that no longer names a real file would
    // quietly move the workflow under test into `others`, where it fails on
    // its own `statuses: write`.
    expect(others.length > 0).toBe(true);
    expect(all.includes(WORKFLOW)).toBe(true);

    for (const file of others) {
      const allowed = ALLOWED_PERMISSIONS[file];
      // A workflow nobody has vetted is not a workflow that grants nothing.
      expect(
        Boolean(allowed),
        `${file} has no entry in ALLOWED_PERMISSIONS — add one deliberately, ` +
          'after checking it cannot write commit statuses',
      ).toBe(true);
      expect(
        permissionBlocks(directives(file)),
        `${file}'s permissions changed — re-approve them`,
      ).toEqual(allowed);
    }
  });
});
