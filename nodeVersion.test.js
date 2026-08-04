// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Two files independently name the Node major, and each is read by a different
// consumer:
//
//  - `.nvmrc` — CI (`actions/setup-node@v6` with node-version-file), `nvm use`
//    on a contributor's machine, and the web sandbox's session-start hook;
//  - `engines.node` in package.json — the host's build image, plus npm's
//    EBADENGINE warning.
//
// Nothing cross-checks them, and a mismatch is quiet in the worst way: the
// suite goes green on one runtime while the deployed build runs another. If a
// third consumer ever appears (`@types/node`, deciding which stdlib tsc
// believes in), add it here and move all of them together or none.

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const pkg = JSON.parse(read('./package.json'));
const nvmrc = read('./.nvmrc').trim();

// Confine a range to the pinned major rather than reading its first numeral:
// `>=24` and `^24 || >=26` both start with the right number while still
// resolving to a different major, which is the drift this file exists to
// catch.
//
// Accepts `24`, `^24`, `^24.13.0`; rejects a bare `24.13.0`. That last one
// looks harmless but isn't: the session-start hook reads engines.node as a
// *floor*, which is what the caret and bare-major forms mean — an exact pin
// means only that version, so treating it as a floor would accept 24.14.0 for
// a `24.13.0` pin that npm rejects. Keeping the declared forms to the ones
// that genuinely are floors is what lets the hook stay a string comparison
// instead of a semver evaluator.
const pinnedToMajor = new RegExp(`^(${nvmrc}|\\^${nvmrc}(\\.\\d+){0,2})$`);

describe('Node version pinning', () => {
  it('pins .nvmrc to the active LTS major', () => {
    expect(nvmrc).toBe('24');
  });

  it('agrees between .nvmrc and engines.node', () => {
    expect(pkg.engines.node).toMatch(pinnedToMajor);
  });
  it('mirrors engines into the lockfile', () => {
    // npm copies the manifest's `engines` into the lockfile's root entry, so
    // adding a key to package.json alone leaves the two out of step until the
    // next install rewrites it. That shows up as an unrelated dirty lockfile
    // at the start of every fresh session — and the next lock-maintenance PR
    // quietly absorbs it. Assert them equal so the drift fails here instead.
    const lock = JSON.parse(read('./package-lock.json'));
    expect(lock.packages[''].engines).toEqual(pkg.engines);
  });
});
