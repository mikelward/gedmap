// Domain types shared between the GEDCOM parser, the geocoder, and the UI.
// Centralized here rather than inferred per-module so a shape change (e.g.
// adding a field to an ancestor entry) is a one-file edit.

/** A person as extracted from the GEDCOM file, before ancestor collection. */
export interface Individual {
  id: string
  name: string
  birthDate: string | null
  birthPlace: string | null
  deathDate: string | null
  deathPlace: string | null
  famcRefs: string[]
  famsRefs: string[]
  photo: string | null
  sex: string | null
  parentIds: string[]
  childIds: string[]
}

/** Lightweight entry for the initial person picker list. */
export interface PersonSummary {
  id: string
  name: string
  birthDate: string | null
  birthPlace: string | null
}

/** Result of parsing a GEDCOM file, before a root person is chosen. */
export interface ParsedGedcom {
  individuals: Map<string, Individual>
  defaultRootId: string | undefined
  allPeople: PersonSummary[]
}

/** A parent/child cross-reference within the collected ancestor set. */
export interface RelativeRef {
  id: string
  name: string
}

/**
 * A person as shown in the UI: parsed fields plus (for direct-ancestor
 * views) generation/relationship, plus in-set parent/child links.
 */
export interface AncestorEntry {
  id: string
  name: string
  birthDate: string | null
  birthPlace: string | null
  deathDate: string | null
  deathPlace: string | null
  photo: string | null
  generation: number | null
  relationship: string | null
  parents: RelativeRef[]
  children: RelativeRef[]
}

/** `collectAncestorsForRoot` / `collectAll` split people by whether they geocode-eligible. */
export interface CollectedAncestors {
  withPlace: AncestorEntry[]
  noPlace: AncestorEntry[]
}

/** An `AncestorEntry` after a successful geocode. */
export interface GeocodedAncestor extends AncestorEntry {
  lat: number
  lng: number
  country: string
}

/** What's left un-plotted after geocoding: no place in the file, or lookup failed. */
export interface UnmappedAncestors {
  noPlace: AncestorEntry[]
  geocodeFailed: AncestorEntry[]
}

/**
 * An ancestor that may or may not have a resolved map position — the shape
 * of "whichever entry the user just clicked" (the map, the sidebar, or the
 * unmapped list in StatsOverlay). `GeocodedAncestor`, `AncestorEntry`, and
 * the sidebar's own tagged union are all assignable to this.
 */
export type MaybeGeocoded = AncestorEntry & Partial<Pick<GeocodedAncestor, 'lat' | 'lng' | 'country'>>
