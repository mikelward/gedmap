const HERE_API_KEY = import.meta.env.VITE_HERE_API_KEY

const cache = new Map()

// Specificity by feature_type — lower = more specific.
export const SPECIFICITY = {
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
export function hereFeatureType(resultType) {
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
async function hereSearch(query) {
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
    const data = await res.json()
    return (data.items || []).map((item) => ({
      geometry: {
        type: 'Point',
        coordinates: [item.position.lng, item.position.lat],
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

// Pick the best feature from a list — trusts the API's relevance order
// and just reads specificity from the first result.
export function pickBestFeature(features) {
  if (features.length === 0) return null
  const best = features[0]
  const specificity = SPECIFICITY[best.properties?.feature_type] ?? 4
  return { feature: best, specificity }
}

// Split a GEDCOM place string into parts for progressive querying.
export function splitPlace(place) {
  const parts = place.split(',').map((s) => s.trim())
  // Fall back to space-splitting only when it produces a genuinely
  // different query — for a single word it would just repeat parts.
  const spaceTokens = place.trim().split(/\s+/)
  const spaceParts =
    place.includes(',') || spaceTokens.length < 2 ? null : spaceTokens
  return { parts, spaceParts }
}

// Core geocoding logic: progressive query shortening.
// searchFn(query) → features[]
export async function tryGeocode(parts, searchFn) {
  let bestFeature = null
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

async function geocodePlace(place) {
  if (cache.has(place)) return cache.get(place)

  const { parts, spaceParts } = splitPlace(place)

  let result = await tryGeocode(parts, hereSearch)
  if (!result && spaceParts) {
    result = await tryGeocode(spaceParts, hereSearch)
  }

  const cached = result
    ? { lat: result.lat, lng: result.lng, country: result.country }
    : null
  cache.set(place, cached)
  return cached
}

export async function geocodeAncestors(ancestors, onProgress, { concurrency = 5 } = {}) {
  const geocoded = []
  const geocodeFailed = []
  let completed = 0

  async function processOne(ancestor) {
    try {
      const coords = await geocodePlace(ancestor.birthPlace)
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
  const executing = new Set()
  for (const ancestor of ancestors) {
    const p = processOne(ancestor).then(() => executing.delete(p))
    executing.add(p)
    if (executing.size >= concurrency) {
      await Promise.race(executing)
    }
  }
  await Promise.all(executing)

  return { geocoded, geocodeFailed }
}
