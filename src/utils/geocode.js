const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

const cache = new Map()

// Mapbox specificity by feature_type — lower = more specific.
const MAPBOX_SPECIFICITY = {
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

// Query Mapbox geocoding v6. Returns a single feature or null.
async function mapboxSearch(query) {
  const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(query)}&access_token=${MAPBOX_TOKEN}&limit=1`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    return data.features?.[0] || null
  } catch {
    return null
  }
}

// Try progressively broader queries against Mapbox.
// "Lessen, Elchniederung, Prussia" → try full string, then drop the leftmost
// part each time until we get a match.
async function tryMapbox(parts) {
  let bestFeature = null
  let bestSpecificity = Infinity

  for (let i = 0; i < parts.length; i++) {
    const query = parts.slice(i).join(', ')
    const feature = await mapboxSearch(query)
    if (!feature) continue

    const featureType = feature.properties?.feature_type
    const specificity = MAPBOX_SPECIFICITY[featureType] ?? 4

    if (!bestFeature || specificity < bestSpecificity) {
      bestFeature = feature
      bestSpecificity = specificity
    }

    if (specificity <= 3) break
  }

  if (!bestFeature) return null

  const [lng, lat] = bestFeature.geometry.coordinates
  const country =
    bestFeature.properties?.context?.country?.name ||
    parts[parts.length - 1] ||
    'Unknown'

  return { lat, lng, country }
}

async function geocodePlace(place) {
  if (cache.has(place)) return cache.get(place)

  // GEDCOM places are hierarchical: "Lessen, Elchniederung, Prussia"
  // Split into parts and try progressively broader queries.
  const parts = place.split(',').map((s) => s.trim())

  // Also try without commas — some GEDCOM files use spaces instead:
  // "Malmesbury Wiltshire" should still work.
  const spaceParts = place.includes(',') ? null : place.split(/\s+/)

  let result = await tryMapbox(parts)
  if (!result && spaceParts) {
    result = await tryMapbox(spaceParts)
  }

  if (!result) {
    cache.set(place, null)
    return null
  }

  const cached = { lat: result.lat, lng: result.lng, country: result.country }
  cache.set(place, cached)
  return cached
}

export async function geocodeAncestors(ancestors, onProgress) {
  const geocoded = []
  const geocodeFailed = []

  for (let i = 0; i < ancestors.length; i++) {
    const ancestor = ancestors[i]

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

    onProgress(i + 1)
  }

  return { geocoded, geocodeFailed }
}
