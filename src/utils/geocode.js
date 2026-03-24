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

// Common country name → ISO 3166-1 alpha-2 code mapping for Mapbox filtering.
// Includes historical names that appear in GEDCOM files.
const COUNTRY_CODES = {
  'australia': 'AU',
  'united states': 'US',
  'usa': 'US',
  'united states of america': 'US',
  'united kingdom': 'GB',
  'england': 'GB',
  'scotland': 'GB',
  'wales': 'GB',
  'northern ireland': 'GB',
  'ireland': 'IE',
  'canada': 'CA',
  'new zealand': 'NZ',
  'south africa': 'ZA',
  'germany': 'DE',
  'deutschland': 'DE',
  'prussia': 'DE',
  'bavaria': 'DE',
  'saxony': 'DE',
  'france': 'FR',
  'italy': 'IT',
  'spain': 'ES',
  'netherlands': 'NL',
  'holland': 'NL',
  'belgium': 'BE',
  'switzerland': 'CH',
  'austria': 'AT',
  'austria-hungary': 'AT',
  'poland': 'PL',
  'czech republic': 'CZ',
  'czechia': 'CZ',
  'bohemia': 'CZ',
  'moravia': 'CZ',
  'slovakia': 'SK',
  'hungary': 'HU',
  'romania': 'RO',
  'russia': 'RU',
  'ukraine': 'UA',
  'sweden': 'SE',
  'norway': 'NO',
  'denmark': 'DK',
  'finland': 'FI',
  'india': 'IN',
  'china': 'CN',
  'japan': 'JP',
  'mexico': 'MX',
  'brazil': 'BR',
  'argentina': 'AR',
  'chile': 'CL',
  'colombia': 'CO',
  'peru': 'PE',
  'portugal': 'PT',
  'greece': 'GR',
  'turkey': 'TR',
  'egypt': 'EG',
  'nigeria': 'NG',
  'kenya': 'KE',
  'ghana': 'GH',
  'philippines': 'PH',
  'indonesia': 'ID',
  'malaysia': 'MY',
  'singapore': 'SG',
  'vietnam': 'VN',
  'thailand': 'TH',
  'korea': 'KR',
  'south korea': 'KR',
  'taiwan': 'TW',
  'israel': 'IL',
  'palestine': 'PS',
  'lebanon': 'LB',
  'syria': 'SY',
  'iraq': 'IQ',
  'iran': 'IR',
  'pakistan': 'PK',
  'bangladesh': 'BD',
  'sri lanka': 'LK',
  'nepal': 'NP',
  'jamaica': 'JM',
  'trinidad and tobago': 'TT',
  'barbados': 'BB',
  'cuba': 'CU',
  'croatia': 'HR',
  'serbia': 'RS',
  'slovenia': 'SI',
  'bulgaria': 'BG',
  'lithuania': 'LT',
  'latvia': 'LV',
  'estonia': 'EE',
  'iceland': 'IS',
  'luxembourg': 'LU',
  'malta': 'MT',
  'cyprus': 'CY',
}

function countryCode(name) {
  if (!name) return null
  return COUNTRY_CODES[name.toLowerCase().trim()] || null
}

// Query Mapbox geocoding v6. Returns array of features.
async function mapboxSearch(query, { country } = {}) {
  const params = new URLSearchParams({
    q: query,
    access_token: MAPBOX_TOKEN,
    limit: '5',
  })
  if (country) params.set('country', country)
  const url = `https://api.mapbox.com/search/geocode/v6/forward?${params}`
  try {
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    return data.features || []
  } catch {
    return []
  }
}

// Pick the best feature from a list, preferring more specific types.
function pickBestFeature(features) {
  if (features.length === 0) return null
  let best = features[0]
  let bestScore = MAPBOX_SPECIFICITY[best.properties?.feature_type] ?? 4
  for (let i = 1; i < features.length; i++) {
    const score = MAPBOX_SPECIFICITY[features[i].properties?.feature_type] ?? 4
    if (score < bestScore) {
      best = features[i]
      bestScore = score
    }
  }
  return { feature: best, specificity: bestScore }
}

// Try progressively broader queries against Mapbox.
// "Lessen, Elchniederung, Prussia" → try full string, then drop the leftmost
// part each time until we get a match.
async function tryMapbox(parts) {
  // Use the last part as a country hint (GEDCOM places end with country)
  const countryHint = countryCode(parts[parts.length - 1])

  let bestFeature = null
  let bestSpecificity = Infinity

  for (let i = 0; i < parts.length; i++) {
    const query = parts.slice(i).join(', ')

    // Try with country filter first, then without if no results
    let features = countryHint
      ? await mapboxSearch(query, { country: countryHint })
      : []
    if (features.length === 0) {
      features = await mapboxSearch(query)
    }

    const pick = pickBestFeature(features)
    if (!pick) continue

    if (!bestFeature || pick.specificity < bestSpecificity) {
      bestFeature = pick.feature
      bestSpecificity = pick.specificity
    }

    if (pick.specificity <= 3) break
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
