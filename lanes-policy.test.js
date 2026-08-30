import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { matchesGlob } from 'node:path';

// Tests for this repository's lane policy, .github/lanes.conf.
//
// The engine (mikelward/lanes) is tested in its own repository; what it
// cannot test is THIS repo's policy, and the policy's failure mode is the
// quiet one: a broadened rule makes classify and gate derive the same wrong
// docs verdict, so the heavy job skips under a green required check. So the
// rules are exercised here, both directions, with `path.matchesGlob` — the
// same standard primitive the engine matches with, so this suite cannot
// drift from the engine on glob semantics. The tiny reader below follows the
// policy format the lanes README documents (ordered rules, full-line and
// trailing comments, first match wins, no rule means code); if the engine
// ever refuses a shape this reader accepts, the gate goes red rather than
// green, which is the safe direction for a disagreement.

// Vitest runs from the repo root, same as the other root-level tests here.
const text = readFileSync('.github/lanes.conf', 'utf8');

const lines = text
  .split('\n')
  .map((line) => {
    const comment = line.search(/\s#/);
    return (comment === -1 ? line : line.slice(0, comment)).trim();
  })
  .filter((line) => line && !line.startsWith('#'));

const rules = [];
const directives = {};
for (const line of lines) {
  const [word, ...rest] = line.split(/\s+/);
  if (word === 'docs' || word === 'code') rules.push({ verdict: word, pattern: rest.join(' ') });
  else directives[word] = rest;
}

const classify = (path) => {
  for (const { verdict, pattern } of rules) {
    if (matchesGlob(path, pattern)) return verdict;
  }
  return 'code';
};

describe('the lane policy', () => {
  it('parses to the intended shape, nothing wider', () => {
    // A rule this suite has not vetted is a rule nothing here exercises.
    expect(rules).toEqual([
      { verdict: 'code', pattern: 'src/**' },
      { verdict: 'code', pattern: 'public/**' },
      { verdict: 'docs', pattern: '*.md' },
      { verdict: 'docs', pattern: 'docs/**/*.md' },
    ]);
    // The WHOLE directives object, not per-key reads: a newly added directive
    // changes classify/gate behavior, so an unexpected key fails here rather
    // than passing unexamined.
    expect(directives).toEqual({
      prefixes: ['docs', 'todo'],
      'dispatch-without-pr': ['refuse'],
      'lint-title': ['no'],
    });
  });

  it('classifies root markdown and the docs/ tree as docs', () => {
    for (const path of [
      'README.md',
      'spec.md',
      'TODO.md',
      'docs/notes.md',
      // `docs/**/*.md` crosses `/`, so the tree rule reaches every depth.
      // Writing it `docs/*.md` would strand this one on the code lane.
      'docs/a/b/deep.md',
    ]) {
      expect(classify(path), path).toBe('docs');
    }
  });

  it('does not treat markdown as docs merely for its extension', () => {
    // The narrowed rules replaced a bare `**/*.md`, which made a markdown
    // file documentation at ANY depth. Being documentation is now a matter
    // of where a file lives: the root, or the docs/ tree. Markdown anywhere
    // else can be a build input, so it stays code. None of these paths
    // exists today -- that is the point, since the rule has to hold for a
    // tree nobody has added yet.
    for (const path of ['scripts/README.md', 'a/b/notes.md', 'notdocs/README.md']) {
      expect(classify(path), path).toBe('code');
    }
  });

  it('classifies the shipped trees as code, markdown included', () => {
    // src/ and public/ are build inputs whatever the extension: Vite can
    // import any file, and public/ ships verbatim.
    for (const path of ['src/App.jsx', 'src/notes.md', 'public/favicon.ico']) {
      expect(classify(path), path).toBe('code');
    }
  });

  it('classifies everything else that can change a build as code', () => {
    for (const path of [
      'package.json',
      'vite.config.js',
      '.github/workflows/ci.yml',
      '.github/lanes.conf',
      '.gitignore',
    ]) {
      expect(classify(path), path).toBe('code');
    }
  });
});
