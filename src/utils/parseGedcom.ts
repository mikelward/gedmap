// Custom GEDCOM parser — parse-gedcom crashes on files with pointer-like
// values in CONC/CONT lines, so we roll our own lightweight parser.

import type {
  AncestorEntry,
  CollectedAncestors,
  Individual,
  ParsedGedcom,
  PersonSummary,
  RelativeRef,
} from '../types'

interface GedcomToken {
  level: number
  xref: string | null
  tag: string
  value: string
  pointer: string | null
}

interface GedcomNode {
  tag: string
  xref: string | null
  value: string
  pointer: string | null
  children: GedcomNode[]
}

/** A person mid-collection: an `Individual` plus its generation/relationship. */
interface AncestorPerson extends Individual {
  generation: number
  relationship: string | null
}

function tokenize(text: string): GedcomToken[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  const records: GedcomToken[] = []

  for (const line of lines) {
    // Strip leading whitespace only — some producers indent lines, but
    // trailing whitespace can be significant in CONC/CONT values.
    const match = line.replace(/^\s+/, '').match(/^(\d+)\s+(@[^@]+@\s+)?(\S+)\s?(.*)$/)
    if (!match) continue

    const level = parseInt(match[1], 10)
    const xref = match[2]?.trim() || null
    const tag = match[3]
    let value = match[4] || ''

    // Value might be a pointer reference like @I1@
    const pointer = value.match(/^@[^@]+@$/)?.[0] || null
    if (pointer) value = ''

    records.push({ level, xref, tag, value, pointer })
  }

  return records
}

function buildTree(tokens: GedcomToken[]): GedcomNode {
  const root: GedcomNode = { tag: 'ROOT', xref: null, value: '', pointer: null, children: [] }
  const stack: (GedcomNode | undefined)[] = [root]

  for (const token of tokens) {
    const node: GedcomNode = {
      tag: token.tag,
      xref: token.xref,
      value: token.value,
      pointer: token.pointer,
      children: [],
    }

    // Pop stack until we find the parent level
    while (stack.length > token.level + 1) {
      stack.pop()
    }

    const parent = stack[stack.length - 1]
    // A line that skips levels leaves holes in the stack; drop lines whose
    // parent slot is one of those holes rather than crashing on the file.
    if (!parent) continue

    // Handle CONC (concatenation) and CONT (continuation)
    // These append to the parent node's value, not a sibling
    if (token.tag === 'CONC' || token.tag === 'CONT') {
      if (token.tag === 'CONT') {
        parent.value = (parent.value || '') + '\n' + (token.value || '')
      } else {
        parent.value = (parent.value || '') + (token.value || '')
      }
      continue
    }

    parent.children.push(node)
    stack[token.level + 1] = node
    // Truncate stack
    stack.length = token.level + 2
  }

  return root
}

// GEDCOM dates are uppercase ("10 JUL 1882"). Normalize to title case ("10 Jul 1882").
function normalizeDate(date: string | null): string | null {
  if (!date) return null
  return date.replace(/\b([A-Z]{3,})\b/g, (m) =>
    m.charAt(0) + m.slice(1).toLowerCase()
  )
}

function findChild(node: GedcomNode, tag: string): GedcomNode | null {
  return node.children.find((c) => c.tag === tag) || null
}

function findChildValue(node: GedcomNode, tag: string): string | null {
  return findChild(node, tag)?.value || null
}

function findAllChildren(node: GedcomNode, tag: string): GedcomNode[] {
  return node.children.filter((c) => c.tag === tag)
}

function extractIndividuals(tree: GedcomNode): Map<string, Individual> {
  const individuals = new Map<string, Individual>()

  for (const node of tree.children) {
    if (node.tag !== 'INDI') continue
    const id = node.xref
    if (!id) continue

    const name = findChildValue(node, 'NAME')?.replace(/\//g, '').trim() || 'Unknown'

    const birthNode = findChild(node, 'BIRT')
    const birthDate = birthNode ? normalizeDate(findChildValue(birthNode, 'DATE')) : null
    const birthPlace = birthNode ? findChildValue(birthNode, 'PLAC') : null

    const deathNode = findChild(node, 'DEAT')
    const deathDate = deathNode ? normalizeDate(findChildValue(deathNode, 'DATE')) : null
    const deathPlace = deathNode ? findChildValue(deathNode, 'PLAC') : null

    const famcRefs = findAllChildren(node, 'FAMC').map((c) => c.pointer || c.value)
    const famsRefs = findAllChildren(node, 'FAMS').map((c) => c.pointer || c.value)

    const sex = findChildValue(node, 'SEX') || null

    const objeNode = findChild(node, 'OBJE')
    const photo = objeNode ? findChildValue(objeNode, 'FILE') : null

    individuals.set(id, {
      id,
      name,
      birthDate,
      birthPlace,
      deathDate,
      deathPlace,
      famcRefs,
      famsRefs,
      photo,
      sex,
      parentIds: [],
      childIds: [],
    })
  }

  return individuals
}

function buildFamilyLinks(tree: GedcomNode, individuals: Map<string, Individual>): void {
  for (const node of tree.children) {
    if (node.tag !== 'FAM') continue

    const husbNode = findChild(node, 'HUSB')
    const wifeNode = findChild(node, 'WIFE')
    const husbId = husbNode?.pointer || husbNode?.value || null
    const wifeId = wifeNode?.pointer || wifeNode?.value || null
    const childIds = findAllChildren(node, 'CHIL').map(
      (c) => c.pointer || c.value
    )

    // Link children to parents
    for (const childId of childIds) {
      const child = individuals.get(childId)
      if (!child) continue
      for (const pid of [husbId, wifeId]) {
        if (pid && individuals.has(pid) && !child.parentIds.includes(pid)) {
          child.parentIds.push(pid)
        }
      }
    }

    // Link parents to children
    for (const pid of [husbId, wifeId].filter((id): id is string => Boolean(id))) {
      const parent = individuals.get(pid)
      if (!parent) continue
      for (const cid of childIds) {
        if (individuals.has(cid) && !parent.childIds.includes(cid)) {
          parent.childIds.push(cid)
        }
      }
    }
  }
}

function findRootPerson(individuals: Map<string, Individual>): string | undefined {
  // Ancestry and most genealogy apps export the home person as the first INDI
  return individuals.keys().next().value
}

type Side = 'Paternal' | 'Maternal' | null

function getRelationshipLabel(generation: number, sex: string | null, side: Side): string | null {
  if (generation === 0) return null

  const isMale = sex === 'M'
  const isFemale = sex === 'F'
  const prefix = side && generation >= 2 ? `${side} ` : ''

  if (generation === 1) return isMale ? 'Father' : isFemale ? 'Mother' : 'Parent'
  if (generation === 2) {
    const noun = isMale ? 'Grandfather' : isFemale ? 'Grandmother' : 'Grandparent'
    return prefix + noun
  }

  const greats = generation - 2
  const greatStr = greats === 1 ? 'Great-' : greats === 2 ? 'Great-great-' : `${greats}× Great-`
  const base = isMale ? 'grandfather' : isFemale ? 'grandmother' : 'grandparent'
  return prefix + greatStr + base
}

interface QueueEntry {
  id: string | undefined
  generation: number
  side: Side
}

function collectDirectAncestors(
  individuals: Map<string, Individual>,
  rootId: string | undefined,
  maxGenerations = 4
): Map<string, AncestorPerson> {
  const result = new Map<string, AncestorPerson>()
  const queue: QueueEntry[] = [{ id: rootId, generation: 0, side: null }]

  while (queue.length > 0) {
    const { id, generation, side } = queue.shift()!
    if (!id || result.has(id) || !individuals.has(id)) continue
    if (generation > maxGenerations) continue

    const person = individuals.get(id)!
    // For gen 1, determine side from the person's sex
    const personSide: Side =
      generation === 0 ? null :
      generation === 1 ? (person.sex === 'M' ? 'Paternal' : person.sex === 'F' ? 'Maternal' : null) :
      side
    const relationship = getRelationshipLabel(generation, person.sex, personSide)
    result.set(id, { ...person, generation, relationship })

    for (const parentId of person.parentIds) {
      if (!result.has(parentId)) {
        queue.push({ id: parentId, generation: generation + 1, side: personSide })
      }
    }
  }

  return result
}

/**
 * Parse a GEDCOM file and return all individuals with family links.
 * This is the first step — call collectAncestorsForRoot() next with a chosen root.
 */
export function parseGedcomFile(gedcomText: string): ParsedGedcom {
  const tokens = tokenize(gedcomText)
  const tree = buildTree(tokens)
  const individuals = extractIndividuals(tree)
  buildFamilyLinks(tree, individuals)

  const defaultRootId = findRootPerson(individuals)

  // Build a lightweight list for the person picker
  const allPeople: PersonSummary[] = []
  for (const [id, person] of individuals) {
    allPeople.push({
      id,
      name: person.name,
      birthDate: person.birthDate,
      birthPlace: person.birthPlace,
    })
  }

  return { individuals, defaultRootId, allPeople }
}

function relativeRefs(ids: string[], pool: Map<string, Individual>): RelativeRef[] {
  return ids
    .filter((id) => pool.has(id))
    .map((id) => ({ id, name: pool.get(id)!.name }))
}

/**
 * Collect direct ancestors for a given root person and split into withPlace/noPlace.
 */
export function collectAncestorsForRoot(
  individuals: Map<string, Individual>,
  rootId: string | undefined,
  maxGenerations = 4
): CollectedAncestors {
  const ancestors = collectDirectAncestors(individuals, rootId, maxGenerations)

  const withPlace: AncestorEntry[] = []
  const noPlace: AncestorEntry[] = []

  for (const [id, person] of ancestors) {
    const entry: AncestorEntry = {
      id,
      name: person.name,
      birthDate: person.birthDate,
      birthPlace: person.birthPlace,
      deathDate: person.deathDate,
      deathPlace: person.deathPlace,
      photo: person.photo,
      generation: person.generation,
      relationship: person.relationship,
      parents: relativeRefs(person.parentIds, ancestors),
      children: relativeRefs(person.childIds, ancestors),
    }

    if (person.birthPlace) {
      withPlace.push(entry)
    } else {
      noPlace.push(entry)
    }
  }

  return { withPlace, noPlace }
}

/**
 * Collect ALL people in the file, split into withPlace/noPlace.
 */
export function collectAll(individuals: Map<string, Individual>): CollectedAncestors {
  const withPlace: AncestorEntry[] = []
  const noPlace: AncestorEntry[] = []

  for (const [id, person] of individuals) {
    const entry: AncestorEntry = {
      id,
      name: person.name,
      birthDate: person.birthDate,
      birthPlace: person.birthPlace,
      deathDate: person.deathDate,
      deathPlace: person.deathPlace,
      photo: person.photo,
      generation: null,
      relationship: null,
      parents: relativeRefs(person.parentIds, individuals),
      children: relativeRefs(person.childIds, individuals),
    }

    if (person.birthPlace) {
      withPlace.push(entry)
    } else {
      noPlace.push(entry)
    }
  }

  return { withPlace, noPlace }
}
