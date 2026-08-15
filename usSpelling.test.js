// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import nspell from 'nspell';
import en from 'dictionary-en';
import gb from 'dictionary-en-gb';

// The guide asks for US English in everything people read. A British spelling
// reads as correct to whoever wrote it, so nothing catches it until a reader
// notices — this does the catching, by dictionary difference rather than by
// denylist: a word is an offense only when the en-GB dictionary accepts it
// AND the en-US dictionary rejects it.
//
// That one predicate is the whole design, because of what it refuses to flag.
// A proper name, an identifier, a jargon word are invalid in BOTH
// dictionaries, so they can never be offenses — the class of false positive
// that killed the denylist version of this check (`Grey` is a surname, and
// this is a genealogy app whose fixtures are full of names) is impossible by
// construction rather than patched entry by entry. A US-accepted variant
// (`analyses`, `greyhound`) is valid en-US and equally unreachable.
//
// It also out-recalls any list: on its first run it found four British forms
// the denylist and ten rounds of review had all missed — `acknowledgement`,
// `modelled`, `signalling`, `travelled` — two of them written the same day
// the denylist test was green.
//
// Cost, measured: the two dictionaries are ~1MB of static files loaded once,
// and the whole repo — 49k words — scans in about a tenth of a second. No
// network.
const us = nspell(en);
const uk = nspell(gb);

// Words the GB dictionary accepts that are not British spellings of anything.
// Keep this list short and each entry explained; it is the only place a
// false positive can hide.
const ALLOW = new Set([
  'prev', // the identifier abbreviation; dictionary-en-gb lists it as a word
]);

const SKIP = new Set([
  'usSpelling.test.js', // its own fixtures and catch-list are mentions, not offenses
  'package-lock.json', // generated, and every word in it is a package name
]);

// A NUL in the first few KB is what `git diff` uses to call a file binary.
const isBinary = (buf) => buf.subarray(0, 8000).includes(0);

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
  .filter((f) => !SKIP.has(f));

/** True when `word` is valid British and invalid US — the offense predicate. */
function british(word) {
  const lower = word.toLowerCase();
  if (ALLOW.has(lower)) return false;
  if (us.correct(word) || us.correct(lower)) return false;
  return uk.correct(word) || uk.correct(lower);
}

function scan(paths) {
  const read = [];
  const offenses = [];
  for (const file of paths) {
    // A tracked file deleted from the worktree but not yet staged is still
    // named by `git ls-files`; reading it unconditionally would fail the
    // suite at module load with zero tests run.
    if (!existsSync(file)) continue;
    const buf = readFileSync(file);
    if (isBinary(buf)) continue;
    read.push(file);
    const text = buf.toString('utf8');
    let line = 1;
    for (const chunk of text.split('\n')) {
      // Split camelCase and snake_case, so `getColour` is judged word by
      // word — identifiers are held to the same spelling as prose. Two
      // passes: lower-to-upper, then acronym-to-word (`URLColour` is
      // `URL Colour`, not one unknown token that neither dictionary has).
      for (const token of chunk.split(/[^A-Za-z]+/)) {
        const words = token
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
          .split(' ');
        for (const w of words) {
          if (w.length >= 4 && british(w)) offenses.push(`${file}:${line} "${w}"`);
        }
      }
      line += 1;
    }
  }
  return { read, offenses };
}

const { read: files, offenses } = scan(tracked);

const temps = [];
/** A file on disk holding `text`, so `scan` can be driven without the repo. */
function writeTemp(text) {
  const dir = mkdtempSync(join(tmpdir(), 'spell-'));
  temps.push(dir);
  const file = join(dir, 'sample.md');
  writeFileSync(file, text);
  return file;
}

afterEach(() => {
  for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('US spelling', () => {
  it('finds no British-only spellings in tracked text', () => {
    expect(offenses).toEqual([]);
  });

  it('actually looks at the repository', () => {
    // A filter that matches nothing would make the check above pass forever,
    // reporting success over a repository it never opened.
    expect(files.length).toBeGreaterThan(20);
    expect(files).toContain('AGENTS.md');
  });

  it('flags British spellings, in prose and inside identifiers', () => {
    const { offenses: bad } = scan([writeTemp('The colour was set by getColour().')]);
    expect(bad.map((o) => o.replace(/^.*?:/, ''))).toEqual(['1 "colour"', '1 "Colour"']);
  });

  it('flags a British word hiding behind an acronym boundary', () => {
    // Lower-to-upper splitting alone turns `getURLColourMap` into
    // `URLColourMap`, which neither dictionary knows — an identifier shape
    // common enough to be a standing hole rather than an edge case.
    const { offenses: bad } = scan([writeTemp('return getURLColourMap(URLColour);')]);
    expect(bad.map((o) => o.replace(/^.*?:/, ''))).toEqual(['1 "Colour"', '1 "Colour"']);
  });

  it('never flags names, jargon, or US-accepted variants', () => {
    // The predicate's whole value: invalid-in-both and valid-in-both words
    // are structurally unreachable, so no per-name exception list can rot.
    const { offenses: clean } = scan([
      writeTemp('Lady Jane Grey ran analyses of the greyhound for Mikel using vitest and GEDCOM.'),
    ]);
    expect(clean).toEqual([]);
  });

  it('skips a tracked path that is not on disk', () => {
    expect(() => scan(['no/such/file.md'])).not.toThrow();
    expect(scan(['no/such/file.md', 'AGENTS.md']).read).toEqual(['AGENTS.md']);
  });
});
