const HERE_API_KEY = import.meta.env.VITE_HERE_API_KEY

const cache = new Map<string, Promise<GeocodeResult | null>>()

export type FeatureType =
  | 'address'
  | 'street'
  | 'neighborhood'
  | 'locality'
  | 'place'
  | 'postcode'
  | 'district'
  | 'region'
  | 'country'

export interface GeoFeature {
  geometry: {
    type: 'Point'
    coordinates: [number, number]
  }
  properties: {
    name?: string
    full_address?: string
    feature_type: FeatureType
    context: {
      country: {
        name?: string
        country_code?: string
      }
    }
  }
}

type SearchFn = (query: string) => Promise<GeoFeature[]>

export interface GeocodeResult {
  lat: number
  lng: number
  country: string
}

interface HereResultItem {
  title: string
  position: { lat: number; lng: number }
  resultType?: string
  address?: {
    label?: string
    countryName?: string
    countryCode?: string
  }
}

// Specificity by feature_type — lower = more specific.
export const SPECIFICITY: Record<FeatureType, number> = {
  address: 0,
  street: 1,
  neighborhood: 2,
  locality: 3,
  place: 4,
  postcode: 5,
  district: 6,
  region: 7,
  country: 8,
}

// Map HERE resultType to a specificity feature_type.
export function hereFeatureType(resultType: string | undefined): FeatureType {
  switch (resultType) {
    case 'houseNumber':
      return 'address'
    case 'street':
      return 'street'
    case 'locality':
      return 'place'
    case 'administrativeArea':
      return 'region'
    default:
      return 'place'
  }
}

// Query HERE Geocoding API. Returns features in a common format.
async function hereSearch(query: string): Promise<GeoFeature[]> {
  if (!HERE_API_KEY) return []
  const params = new URLSearchParams({
    q: query,
    limit: '5',
    apiKey: HERE_API_KEY,
  })
  const url = `https://geocode.search.hereapi.com/v1/geocode?${params}`
  try {
    const res = await fetch(url)
    if (!res.ok) return []
    const data = (await res.json()) as { items?: HereResultItem[] }
    return (data.items || []).map((item) => ({
      geometry: {
        type: 'Point' as const,
        coordinates: [item.position.lng, item.position.lat] as [number, number],
      },
      properties: {
        name: item.title,
        full_address: item.address?.label,
        feature_type: hereFeatureType(item.resultType),
        context: {
          country: {
            name: item.address?.countryName,
            country_code: item.address?.countryCode,
          },
        },
      },
    }))
  } catch {
    return []
  }
}

interface BestFeature {
  feature: GeoFeature
  specificity: number
}

// Pick the best feature from a list — trusts the API's relevance order
// and just reads specificity from the first result.
export function pickBestFeature(features: GeoFeature[]): BestFeature | null {
  if (features.length === 0) return null
  const best = features[0]
  const specificity = SPECIFICITY[best.properties?.feature_type] ?? 4
  return { feature: best, specificity }
}

export interface SplitPlace {
  parts: string[]
  spaceParts: string[] | null
}

// Split a GEDCOM place string into parts for progressive querying.
export function splitPlace(place: string): SplitPlace {
  // Drop empty segments — exports often leave blank jurisdiction slots
  // ("Brooklyn, , New York, USA,") that would produce garbage queries.
  const parts = place.split(',').map((s) => s.trim()).filter(Boolean)
  // Fall back to space-splitting only when it produces a genuinely
  // different query — for a single word it would just repeat parts.
  const spaceTokens = place.trim().split(/\s+/)
  const spaceParts =
    place.includes(',') || spaceTokens.length < 2 ? null : spaceTokens
  return { parts, spaceParts }
}

// Core geocoding logic: progressive query shortening.
// searchFn(query) → features[]
export async function tryGeocode(parts: string[], searchFn: SearchFn): Promise<GeocodeResult | null> {
  let bestFeature: GeoFeature | null = null
  let bestSpecificity = Infinity

  for (let i = 0; i < parts.length; i++) {
    const query = parts.slice(i).join(', ')
    const features = await searchFn(query)
    const pick = pickBestFeature(features)
    if (!pick) continue

    if (!bestFeature || pick.specificity < bestSpecificity) {
      bestFeature = pick.feature
      bestSpecificity = pick.specificity
    }

    // Stop once we have a city-level (or better) hit — the remaining
    // queries are strictly broader and can't improve on it. HERE maps
    // city results to 'place', so the threshold must include it.
    if (pick.specificity <= SPECIFICITY.place) break
  }

  if (!bestFeature) return null

  const [lng, lat] = bestFeature.geometry.coordinates
  const country =
    bestFeature.properties?.context?.country?.name ||
    parts[parts.length - 1] ||
    'Unknown'

  console.debug(
    '[geocode]',
    parts.join(', '),
    '→',
    { lat, lng, country },
    'type:',
    bestFeature.properties?.feature_type,
    'name:',
    bestFeature.properties?.full_address || bestFeature.properties?.name
  )

  return { lat, lng, country }
}

// Cache the in-flight promise, not just the settled result — ancestors
// sharing a birth place run concurrently, and each would otherwise miss
// the cache and issue its own duplicate API requests.
function geocodePlace(place: string): Promise<GeocodeResult | null> {
  const cached = cache.get(place)
  if (cached) return cached

  const promise = (async () => {
    const { parts, spaceParts } = splitPlace(place)

    let result = await tryGeocode(parts, hereSearch)
    if (!result && spaceParts) {
      result = await tryGeocode(spaceParts, hereSearch)
    }

    return result
      ? { lat: result.lat, lng: result.lng, country: result.country }
      : null
  })()
  promise.catch(() => cache.delete(place))
  cache.set(place, promise)
  return promise
}

export interface GeocodeAncestorsOptions {
  concurrency?: number
}

export interface GeocodeAncestorsResult<T> {
  geocoded: (T & GeocodeResult)[]
  geocodeFailed: T[]
}

export async function geocodeAncestors<T extends { birthPlace: string | null }>(
  ancestors: T[],
  onProgress: (completed: number) => void,
  { concurrency = 5 }: GeocodeAncestorsOptions = {}
): Promise<GeocodeAncestorsResult<T>> {
  const geocoded: (T & GeocodeResult)[] = []
  const geocodeFailed: T[] = []
  let completed = 0

  async function processOne(ancestor: T) {
    try {
      const coords = ancestor.birthPlace ? await geocodePlace(ancestor.birthPlace) : null
      if (coords) {
        geocoded.push({
          ...ancestor,
          lat: coords.lat,
          lng: coords.lng,
          country: coords.country,
        })
      } else {
        geocodeFailed.push(ancestor)
      }
    } catch {
      geocodeFailed.push(ancestor)
    }
    completed++
    onProgress(completed)
  }

  // Process ancestors with bounded concurrency
  const executing = new Set<Promise<void>>()
  for (const ancestor of ancestors) {
    const p: Promise<void> = processOne(ancestor).then(() => {
      executing.delete(p)
    })
    executing.add(p)
    if (executing.size >= concurrency) {
      await Promise.race(executing)
    }
  }
  await Promise.all(executing)

  return { geocoded, geocodeFailed }
}
