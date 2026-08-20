// Shared builders for domain-object test fixtures. Component tests only care
// about a handful of fields per case; these fill in the rest of the strict
// AncestorEntry/GeocodedAncestor/PersonSummary shape with harmless defaults
// so fixtures stay short without resorting to `as any`.
import type { AncestorEntry, GeocodedAncestor, PersonSummary } from './types'

export function makeAncestorEntry(overrides: Partial<AncestorEntry> & Pick<AncestorEntry, 'id' | 'name'>): AncestorEntry {
  return {
    birthDate: null,
    birthPlace: null,
    deathDate: null,
    deathPlace: null,
    photo: null,
    generation: null,
    relationship: null,
    parents: [],
    children: [],
    ...overrides,
  }
}

export function makeGeocodedAncestor(
  overrides: Partial<GeocodedAncestor> & Pick<GeocodedAncestor, 'id' | 'name' | 'lat' | 'lng' | 'country'>
): GeocodedAncestor {
  return {
    ...makeAncestorEntry(overrides),
    ...overrides,
  }
}

export function makePersonSummary(overrides: Partial<PersonSummary> & Pick<PersonSummary, 'id' | 'name'>): PersonSummary {
  return {
    birthDate: null,
    birthPlace: null,
    ...overrides,
  }
}
