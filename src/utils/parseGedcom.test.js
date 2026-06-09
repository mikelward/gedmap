import { describe, it, expect } from 'vitest'
import {
  parseGedcomFile,
  collectAncestorsForRoot,
  collectAll,
} from './parseGedcom.js'

// --- Minimal GEDCOM fixtures ---

const MINIMAL_GEDCOM = `
0 HEAD
1 SOUR Test
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
1 BIRT
2 DATE 10 JUL 1882
2 PLAC London, England
1 DEAT
2 DATE 5 MAR 1950
2 PLAC Manchester, England
1 FAMS @F1@
0 @I2@ INDI
1 NAME Jane /Doe/
1 SEX F
1 BIRT
2 DATE 15 DEC 1885
2 PLAC Bristol, England
1 FAMS @F1@
0 @I3@ INDI
1 NAME James /Smith/
1 SEX M
1 BIRT
2 DATE 1 JAN 1910
2 PLAC London, England
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
0 TRLR
`

const THREE_GEN_GEDCOM = `
0 HEAD
0 @I1@ INDI
1 NAME Child /Test/
1 SEX M
1 BIRT
2 DATE 1 JAN 2000
2 PLAC Sydney, Australia
1 FAMC @F1@
0 @I2@ INDI
1 NAME Father /Test/
1 SEX M
1 BIRT
2 DATE 1 JAN 1970
2 PLAC Melbourne, Australia
1 FAMS @F1@
1 FAMC @F2@
0 @I3@ INDI
1 NAME Mother /Test/
1 SEX F
1 BIRT
2 DATE 1 JAN 1972
2 PLAC Brisbane, Australia
1 FAMS @F1@
1 FAMC @F3@
0 @I4@ INDI
1 NAME Paternal Grandfather /Test/
1 SEX M
1 BIRT
2 DATE 1 JAN 1940
2 PLAC Perth, Australia
1 FAMS @F2@
0 @I5@ INDI
1 NAME Paternal Grandmother /Test/
1 SEX F
1 BIRT
2 DATE 1 JAN 1942
1 FAMS @F2@
0 @I6@ INDI
1 NAME Maternal Grandfather /Jones/
1 SEX M
1 BIRT
2 PLAC Adelaide, Australia
1 FAMS @F3@
0 @I7@ INDI
1 NAME Maternal Grandmother /Jones/
1 SEX F
1 FAMS @F3@
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I3@
1 CHIL @I1@
0 @F2@ FAM
1 HUSB @I4@
1 WIFE @I5@
1 CHIL @I2@
0 @F3@ FAM
1 HUSB @I6@
1 WIFE @I7@
1 CHIL @I3@
0 TRLR
`

// --- parseGedcomFile ---

describe('parseGedcomFile', () => {
  it('parses a minimal GEDCOM file', () => {
    const { individuals, defaultRootId, allPeople } =
      parseGedcomFile(MINIMAL_GEDCOM)
    expect(individuals.size).toBe(3)
    expect(defaultRootId).toBe('@I1@')
    expect(allPeople).toHaveLength(3)
  })

  it('extracts individual names with slashes removed', () => {
    const { individuals } = parseGedcomFile(MINIMAL_GEDCOM)
    expect(individuals.get('@I1@').name).toBe('John Smith')
    expect(individuals.get('@I2@').name).toBe('Jane Doe')
  })

  it('extracts birth date and place', () => {
    const { individuals } = parseGedcomFile(MINIMAL_GEDCOM)
    const john = individuals.get('@I1@')
    expect(john.birthDate).toBe('10 Jul 1882')
    expect(john.birthPlace).toBe('London, England')
  })

  it('extracts death date and place', () => {
    const { individuals } = parseGedcomFile(MINIMAL_GEDCOM)
    const john = individuals.get('@I1@')
    expect(john.deathDate).toBe('5 Mar 1950')
    expect(john.deathPlace).toBe('Manchester, England')
  })

  it('extracts sex', () => {
    const { individuals } = parseGedcomFile(MINIMAL_GEDCOM)
    expect(individuals.get('@I1@').sex).toBe('M')
    expect(individuals.get('@I2@').sex).toBe('F')
  })

  it('builds family links between parents and children', () => {
    const { individuals } = parseGedcomFile(MINIMAL_GEDCOM)
    const child = individuals.get('@I3@')
    expect(child.parentIds).toContain('@I1@')
    expect(child.parentIds).toContain('@I2@')

    const father = individuals.get('@I1@')
    expect(father.childIds).toContain('@I3@')

    const mother = individuals.get('@I2@')
    expect(mother.childIds).toContain('@I3@')
  })

  it('returns allPeople with id, name, birthDate, birthPlace', () => {
    const { allPeople } = parseGedcomFile(MINIMAL_GEDCOM)
    const john = allPeople.find((p) => p.id === '@I1@')
    expect(john).toEqual({
      id: '@I1@',
      name: 'John Smith',
      birthDate: '10 Jul 1882',
      birthPlace: 'London, England',
    })
  })

  it('returns the first individual as defaultRootId', () => {
    const { defaultRootId } = parseGedcomFile(MINIMAL_GEDCOM)
    expect(defaultRootId).toBe('@I1@')
  })

  it('handles empty input', () => {
    const { individuals, allPeople } = parseGedcomFile('')
    expect(individuals.size).toBe(0)
    expect(allPeople).toHaveLength(0)
  })

  it('handles GEDCOM with no INDI records', () => {
    const gedcom = '0 HEAD\n1 SOUR Test\n0 TRLR\n'
    const { individuals, allPeople } = parseGedcomFile(gedcom)
    expect(individuals.size).toBe(0)
    expect(allPeople).toHaveLength(0)
  })
})

// --- Tokenizer edge cases (tested via parseGedcomFile) ---

describe('tokenizer and tree builder', () => {
  it('handles CONC lines (concatenation without newline)', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
1 NOTE This is a long
2 CONC  note that continues
0 TRLR
`
    const { individuals } = parseGedcomFile(gedcom)
    // CONC should not break individual extraction
    expect(individuals.get('@I1@').name).toBe('John Smith')
  })

  it('handles CONT lines (continuation with newline)', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
1 NOTE First line
2 CONT Second line
0 TRLR
`
    const { individuals } = parseGedcomFile(gedcom)
    expect(individuals.get('@I1@').name).toBe('John Smith')
  })

  it('handles lines with pointer values', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
1 FAMC @F1@
0 @I2@ INDI
1 NAME Jane /Smith/
1 SEX F
1 FAMS @F1@
0 @F1@ FAM
1 WIFE @I2@
1 CHIL @I1@
0 TRLR
`
    const { individuals } = parseGedcomFile(gedcom)
    const child = individuals.get('@I1@')
    expect(child.famcRefs).toContain('@F1@')
    const mother = individuals.get('@I2@')
    expect(mother.famsRefs).toContain('@F1@')
  })

  it('handles Windows-style line endings (\\r\\n)', () => {
    const gedcom =
      '0 @I1@ INDI\r\n1 NAME John /Smith/\r\n1 SEX M\r\n1 BIRT\r\n2 DATE 1 JAN 1900\r\n2 PLAC London\r\n0 TRLR\r\n'
    const { individuals } = parseGedcomFile(gedcom)
    expect(individuals.get('@I1@').name).toBe('John Smith')
    expect(individuals.get('@I1@').birthPlace).toBe('London')
  })

  it('skips malformed lines', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME John /Smith/
this is not a valid GEDCOM line
1 SEX M
0 TRLR
`
    const { individuals } = parseGedcomFile(gedcom)
    expect(individuals.get('@I1@').name).toBe('John Smith')
    expect(individuals.get('@I1@').sex).toBe('M')
  })

  it('does not crash on level-skipping lines', () => {
    // "2 FOO" directly under a level-0 record skips level 1, leaving a hole
    // in the parser stack; the following sibling lines used to crash the
    // whole parse with "Cannot read properties of undefined".
    const gedcom = `
0 @I1@ INDI
1 NAME John /Smith/
0 OBJ
2 FOO a
2 CONC x
2 BAR b
0 TRLR
`
    const { individuals } = parseGedcomFile(gedcom)
    expect(individuals.get('@I1@').name).toBe('John Smith')
  })

  it('handles individuals with missing optional fields', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Unknown /Person/
0 TRLR
`
    const { individuals } = parseGedcomFile(gedcom)
    const person = individuals.get('@I1@')
    expect(person.name).toBe('Unknown Person')
    expect(person.birthDate).toBeNull()
    expect(person.birthPlace).toBeNull()
    expect(person.deathDate).toBeNull()
    expect(person.deathPlace).toBeNull()
    expect(person.sex).toBeNull()
    expect(person.photo).toBeNull()
    expect(person.parentIds).toEqual([])
    expect(person.childIds).toEqual([])
  })

  it('handles individual with no NAME tag', () => {
    const gedcom = `
0 @I1@ INDI
1 SEX M
0 TRLR
`
    const { individuals } = parseGedcomFile(gedcom)
    expect(individuals.get('@I1@').name).toBe('Unknown')
  })

  it('extracts photo from OBJE/FILE', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
1 OBJE
2 FILE photo.jpg
0 TRLR
`
    const { individuals } = parseGedcomFile(gedcom)
    expect(individuals.get('@I1@').photo).toBe('photo.jpg')
  })
})

// --- Date normalization (tested via parseGedcomFile) ---

describe('normalizeDate', () => {
  it('normalizes uppercase month to title case', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Test /Person/
1 BIRT
2 DATE 10 JUL 1882
0 TRLR
`
    const { individuals } = parseGedcomFile(gedcom)
    expect(individuals.get('@I1@').birthDate).toBe('10 Jul 1882')
  })

  it('normalizes approximate dates', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Test /Person/
1 BIRT
2 DATE ABT 1900
0 TRLR
`
    const { individuals } = parseGedcomFile(gedcom)
    expect(individuals.get('@I1@').birthDate).toBe('Abt 1900')
  })

  it('handles year-only dates', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Test /Person/
1 BIRT
2 DATE 1900
0 TRLR
`
    const { individuals } = parseGedcomFile(gedcom)
    expect(individuals.get('@I1@').birthDate).toBe('1900')
  })

  it('returns null for missing dates', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Test /Person/
1 BIRT
2 PLAC London
0 TRLR
`
    const { individuals } = parseGedcomFile(gedcom)
    expect(individuals.get('@I1@').birthDate).toBeNull()
  })
})

// --- Family link building ---

describe('buildFamilyLinks', () => {
  it('handles multiple children in a family', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Father /Test/
1 SEX M
1 FAMS @F1@
0 @I2@ INDI
1 NAME Mother /Test/
1 SEX F
1 FAMS @F1@
0 @I3@ INDI
1 NAME Child One /Test/
1 SEX M
1 FAMC @F1@
0 @I4@ INDI
1 NAME Child Two /Test/
1 SEX F
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
1 CHIL @I4@
0 TRLR
`
    const { individuals } = parseGedcomFile(gedcom)
    const father = individuals.get('@I1@')
    expect(father.childIds).toContain('@I3@')
    expect(father.childIds).toContain('@I4@')
    expect(father.childIds).toHaveLength(2)

    const child1 = individuals.get('@I3@')
    expect(child1.parentIds).toContain('@I1@')
    expect(child1.parentIds).toContain('@I2@')
  })

  it('handles family with missing spouse', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Single Parent /Test/
1 SEX F
1 FAMS @F1@
0 @I2@ INDI
1 NAME Child /Test/
1 SEX M
1 FAMC @F1@
0 @F1@ FAM
1 WIFE @I1@
1 CHIL @I2@
0 TRLR
`
    const { individuals } = parseGedcomFile(gedcom)
    const child = individuals.get('@I2@')
    expect(child.parentIds).toEqual(['@I1@'])
  })

  it('handles references to non-existent individuals gracefully', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Test /Person/
1 SEX M
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I999@
1 CHIL @I1@
0 TRLR
`
    // Should not throw
    const { individuals } = parseGedcomFile(gedcom)
    const person = individuals.get('@I1@')
    // @I999@ doesn't exist, so it shouldn't appear in parentIds
    expect(person.parentIds).toEqual([])
  })

  it('does not create duplicate childIds', () => {
    // A child referenced twice in the same family shouldn't create duplicates
    const gedcom = `
0 @I1@ INDI
1 NAME Parent /Test/
1 SEX M
1 FAMS @F1@
0 @I2@ INDI
1 NAME Child /Test/
1 SEX M
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I1@
1 CHIL @I2@
1 CHIL @I2@
0 TRLR
`
    const { individuals } = parseGedcomFile(gedcom)
    const parent = individuals.get('@I1@')
    expect(parent.childIds).toEqual(['@I2@'])
  })

  it('does not create duplicate parentIds', () => {
    // A child referenced twice in the same family shouldn't get its
    // parents linked twice
    const gedcom = `
0 @I1@ INDI
1 NAME Father /Test/
1 SEX M
1 FAMS @F1@
0 @I2@ INDI
1 NAME Mother /Test/
1 SEX F
1 FAMS @F1@
0 @I3@ INDI
1 NAME Child /Test/
1 SEX M
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
1 CHIL @I3@
0 TRLR
`
    const { individuals } = parseGedcomFile(gedcom)
    const child = individuals.get('@I3@')
    expect(child.parentIds).toEqual(['@I1@', '@I2@'])
  })
})

// --- getRelationshipLabel (tested via collectAncestorsForRoot) ---

describe('relationship labels', () => {
  it('labels generation 1 as Father/Mother', () => {
    const { individuals } = parseGedcomFile(THREE_GEN_GEDCOM)
    const { withPlace } = collectAncestorsForRoot(individuals, '@I1@', 4)
    const father = withPlace.find((a) => a.id === '@I2@')
    const mother = withPlace.find((a) => a.id === '@I3@')
    expect(father.relationship).toBe('Father')
    expect(mother.relationship).toBe('Mother')
  })

  it('labels generation 2 with Paternal/Maternal prefix', () => {
    const { individuals } = parseGedcomFile(THREE_GEN_GEDCOM)
    const { withPlace, noPlace } = collectAncestorsForRoot(
      individuals,
      '@I1@',
      4
    )
    const all = [...withPlace, ...noPlace]
    const patGrandfather = all.find((a) => a.id === '@I4@')
    expect(patGrandfather.relationship).toBe('Paternal Grandfather')

    const matGrandfather = all.find((a) => a.id === '@I6@')
    expect(matGrandfather.relationship).toBe('Maternal Grandfather')
  })

  it('labels generation 0 (root) with no relationship', () => {
    const { individuals } = parseGedcomFile(THREE_GEN_GEDCOM)
    const { withPlace } = collectAncestorsForRoot(individuals, '@I1@', 4)
    const root = withPlace.find((a) => a.id === '@I1@')
    expect(root.relationship).toBeNull()
  })

  it('labels great-grandparents correctly', () => {
    // Build a 4-generation GEDCOM
    const gedcom = `
0 @I1@ INDI
1 NAME Child /Test/
1 SEX M
1 BIRT
2 PLAC Place
1 FAMC @F1@
0 @I2@ INDI
1 NAME Father /Test/
1 SEX M
1 BIRT
2 PLAC Place
1 FAMS @F1@
1 FAMC @F2@
0 @I3@ INDI
1 NAME Grandfather /Test/
1 SEX M
1 BIRT
2 PLAC Place
1 FAMS @F2@
1 FAMC @F3@
0 @I4@ INDI
1 NAME Great-grandfather /Test/
1 SEX M
1 BIRT
2 PLAC Place
1 FAMS @F3@
0 @F1@ FAM
1 HUSB @I2@
1 CHIL @I1@
0 @F2@ FAM
1 HUSB @I3@
1 CHIL @I2@
0 @F3@ FAM
1 HUSB @I4@
1 CHIL @I3@
0 TRLR
`
    const { individuals } = parseGedcomFile(gedcom)
    const { withPlace } = collectAncestorsForRoot(individuals, '@I1@', 4)
    const greatGrandfather = withPlace.find((a) => a.id === '@I4@')
    expect(greatGrandfather.relationship).toBe('Paternal Great-grandfather')
    expect(greatGrandfather.generation).toBe(3)
  })
})

// --- collectAncestorsForRoot ---

describe('collectAncestorsForRoot', () => {
  it('collects ancestors up to maxGenerations', () => {
    const { individuals } = parseGedcomFile(THREE_GEN_GEDCOM)
    const { withPlace, noPlace } = collectAncestorsForRoot(
      individuals,
      '@I1@',
      2
    )
    const all = [...withPlace, ...noPlace]
    // Generation 0 (root) + generation 1 (2 parents) + generation 2 (4 grandparents)
    expect(all.length).toBe(7)
  })

  it('splits into withPlace and noPlace correctly', () => {
    const { individuals } = parseGedcomFile(THREE_GEN_GEDCOM)
    const { withPlace, noPlace } = collectAncestorsForRoot(
      individuals,
      '@I1@',
      2
    )
    // All ancestors have birthPlace except @I5@ (no PLAC) and @I7@ (no BIRT at all)
    expect(noPlace.map((a) => a.id).sort()).toEqual(['@I5@', '@I7@'].sort())
    expect(withPlace.every((a) => a.birthPlace)).toBe(true)
    expect(noPlace.every((a) => !a.birthPlace)).toBe(true)
  })

  it('includes parent and children links in output', () => {
    const { individuals } = parseGedcomFile(THREE_GEN_GEDCOM)
    const { withPlace } = collectAncestorsForRoot(individuals, '@I1@', 2)
    const root = withPlace.find((a) => a.id === '@I1@')
    expect(root.parents).toHaveLength(2)
    expect(root.parents.map((p) => p.id).sort()).toEqual(['@I2@', '@I3@'].sort())
    expect(root.children).toHaveLength(0) // root has no children in ancestors

    const father = withPlace.find((a) => a.id === '@I2@')
    expect(father.children).toEqual([{ id: '@I1@', name: 'Child Test' }])
  })

  it('respects maxGenerations=0 (root only)', () => {
    const { individuals } = parseGedcomFile(THREE_GEN_GEDCOM)
    const { withPlace, noPlace } = collectAncestorsForRoot(
      individuals,
      '@I1@',
      0
    )
    expect([...withPlace, ...noPlace]).toHaveLength(1)
    expect(withPlace[0].id).toBe('@I1@')
  })

  it('handles non-existent rootId gracefully', () => {
    const { individuals } = parseGedcomFile(THREE_GEN_GEDCOM)
    const { withPlace, noPlace } = collectAncestorsForRoot(
      individuals,
      '@NONEXISTENT@',
      4
    )
    expect(withPlace).toHaveLength(0)
    expect(noPlace).toHaveLength(0)
  })

  it('tracks generation numbers correctly', () => {
    const { individuals } = parseGedcomFile(THREE_GEN_GEDCOM)
    const { withPlace, noPlace } = collectAncestorsForRoot(
      individuals,
      '@I1@',
      2
    )
    const all = [...withPlace, ...noPlace]
    expect(all.find((a) => a.id === '@I1@').generation).toBe(0)
    expect(all.find((a) => a.id === '@I2@').generation).toBe(1)
    expect(all.find((a) => a.id === '@I3@').generation).toBe(1)
    expect(all.find((a) => a.id === '@I4@').generation).toBe(2)
  })
})

// --- collectAll ---

describe('collectAll', () => {
  it('collects all individuals regardless of family structure', () => {
    const { individuals } = parseGedcomFile(THREE_GEN_GEDCOM)
    const { withPlace, noPlace } = collectAll(individuals)
    expect(withPlace.length + noPlace.length).toBe(7)
  })

  it('sets generation and relationship to null for all', () => {
    const { individuals } = parseGedcomFile(THREE_GEN_GEDCOM)
    const { withPlace, noPlace } = collectAll(individuals)
    const all = [...withPlace, ...noPlace]
    for (const person of all) {
      expect(person.generation).toBeNull()
      expect(person.relationship).toBeNull()
    }
  })

  it('splits withPlace and noPlace correctly', () => {
    const { individuals } = parseGedcomFile(THREE_GEN_GEDCOM)
    const { withPlace, noPlace } = collectAll(individuals)
    expect(withPlace.every((a) => a.birthPlace)).toBe(true)
    expect(noPlace.every((a) => !a.birthPlace)).toBe(true)
  })

  it('includes parent and children links', () => {
    const { individuals } = parseGedcomFile(THREE_GEN_GEDCOM)
    const { withPlace } = collectAll(individuals)
    const father = withPlace.find((a) => a.id === '@I2@')
    expect(father.parents).toHaveLength(2)
    expect(father.children).toHaveLength(1)
  })

  it('handles empty individuals map', () => {
    const { individuals } = parseGedcomFile('')
    const { withPlace, noPlace } = collectAll(individuals)
    expect(withPlace).toHaveLength(0)
    expect(noPlace).toHaveLength(0)
  })
})
