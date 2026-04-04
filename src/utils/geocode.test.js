import { describe, it, expect } from 'vitest'
import {
  pickBestFeature,
  splitPlace,
  tryGeocode,
  hereFeatureType,
  SPECIFICITY,
} from './geocode.js'

// --- Helper to build feature fixtures (common format for HERE + Mapbox) ---

function feature(name, type, coords, countryName, countryCodeVal) {
  return {
    geometry: { type: 'Point', coordinates: coords },
    properties: {
      name,
      feature_type: type,
      context: { country: { name: countryName, country_code: countryCodeVal } },
    },
  }
}

// --- Fake API responses keyed by query string ---
// These simulate what a good geocoder (HERE) returns for various queries.

const FIXTURES = {
  // Malmesbury, Westport St Mary, Wiltshire, England
  'Malmesbury, Westport St Mary, Wiltshire, England': [
    feature('Malmesbury', 'place', [-2.0988, 51.5841], 'United Kingdom', 'GBR'),
  ],
  'Westport St Mary, Wiltshire, England': [],
  'Wiltshire, England': [
    feature('Wiltshire', 'region', [-1.9, 51.25], 'United Kingdom', 'GBR'),
  ],
  'England': [
    feature('England', 'country', [-1.17, 52.35], 'United Kingdom', 'GBR'),
  ],

  // Zagreb, Croatia
  'Zagreb, Croatia': [
    feature('Zagreb', 'place', [15.9819, 45.815], 'Croatia', 'HRV'),
  ],

  // Sydney, New South Wales, Australia
  'Sydney, New South Wales, Australia': [
    feature('Sydney', 'place', [151.2093, -33.8688], 'Australia', 'AUS'),
  ],
  'New South Wales, Australia': [
    feature('New South Wales', 'region', [146.9211, -31.8406], 'Australia', 'AUS'),
  ],
  'Australia': [
    feature('Australia', 'country', [133.7751, -25.2744], 'Australia', 'AUS'),
  ],

  // Lessen, Elchniederung, Prussia → fully historical, falls back to region
  'Lessen, Elchniederung, Prussia': [],
  'Elchniederung, Prussia': [],
  'Prussia': [
    feature('Prussia', 'region', [13.4, 52.5], 'Germany', 'DEU'),
  ],

  // Sisak, Yugoslavia → finds Sisak in Croatia
  'Sisak, Yugoslavia': [
    feature('Sisak', 'place', [16.3728, 45.4654], 'Croatia', 'HRV'),
  ],

  // Sarajevo, Yugoslavia → finds Sarajevo in Bosnia
  'Sarajevo, Yugoslavia': [
    feature('Sarajevo', 'place', [18.4131, 43.8563], 'Bosnia and Herzegovina', 'BIH'),
  ],

  // Brno, Moravia
  'Brno, Moravia': [
    feature('Brno', 'place', [16.6078, 49.1951], 'Czechia', 'CZE'),
  ],

  // Krakow, Austria-Hungary → finds Kraków in Poland directly
  'Krakow, Austria-Hungary': [
    feature('Kraków', 'place', [19.9445, 50.0647], 'Poland', 'POL'),
  ],

  // Ganth, Fejer, Austria-Hungary → HERE finds Gánt in Hungary directly
  'Ganth, Fejer, Austria-Hungary': [
    feature('Gánt', 'place', [18.38761, 47.38995], 'Magyarország', 'HUN'),
  ],

  // Gant, Fejer, Hungary → also finds Gánt
  'Gant, Fejer, Hungary': [
    feature('Gánt', 'place', [18.38761, 47.38995], 'Magyarország', 'HUN'),
  ],

  // Naracoorte, South Australia, Australia → finds it in Australia
  'Naracoorte, South Australia, Australia': [
    feature('Naracoorte', 'place', [140.7, -36.95], 'Australia', 'AUS'),
  ],
  'South Australia, Australia': [
    feature('South Australia', 'region', [135.0, -30.0], 'Australia', 'AUS'),
  ],

  // Ambiguous: "Portland" with no country
  'Portland': [
    feature('Portland', 'place', [-122.6765, 45.5231], 'United States', 'USA'),
    feature('Portland', 'place', [-2.4476, 50.5455], 'United Kingdom', 'GBR'),
  ],
}

// Mock search function: query → features[]
function mockSearch(query) {
  return Promise.resolve(FIXTURES[query] || [])
}

// --- hereFeatureType ---

describe('hereFeatureType', () => {
  it('maps HERE result types to feature types', () => {
    expect(hereFeatureType('houseNumber')).toBe('address')
    expect(hereFeatureType('street')).toBe('street')
    expect(hereFeatureType('locality')).toBe('place')
    expect(hereFeatureType('administrativeArea')).toBe('region')
  })

  it('defaults to place for unknown types', () => {
    expect(hereFeatureType('something_new')).toBe('place')
    expect(hereFeatureType(undefined)).toBe('place')
  })
})

// --- splitPlace ---

describe('splitPlace', () => {
  it('splits comma-separated GEDCOM place strings', () => {
    const { parts, spaceParts } = splitPlace('Lessen, Elchniederung, Prussia')
    expect(parts).toEqual(['Lessen', 'Elchniederung', 'Prussia'])
    expect(spaceParts).toBeNull()
  })

  it('returns spaceParts for non-comma strings', () => {
    const { parts, spaceParts } = splitPlace('Malmesbury Wiltshire')
    expect(parts).toEqual(['Malmesbury Wiltshire'])
    expect(spaceParts).toEqual(['Malmesbury', 'Wiltshire'])
  })

  it('trims whitespace from parts', () => {
    const { parts } = splitPlace(' London ,  England ')
    expect(parts).toEqual(['London', 'England'])
  })

  it('handles single-part place strings', () => {
    const { parts, spaceParts } = splitPlace('Australia')
    expect(parts).toEqual(['Australia'])
    expect(spaceParts).toEqual(['Australia'])
  })

  it('handles multi-level GEDCOM hierarchies', () => {
    const { parts } = splitPlace(
      'Malmesbury, Westport St Mary, Wiltshire, England'
    )
    expect(parts).toEqual([
      'Malmesbury',
      'Westport St Mary',
      'Wiltshire',
      'England',
    ])
  })
})

// --- pickBestFeature ---

describe('pickBestFeature', () => {
  it('returns null for empty array', () => {
    expect(pickBestFeature([])).toBeNull()
  })

  it('returns the first feature (trusts API relevance order)', () => {
    const place = feature('A', 'place', [0, 0], 'Z')
    const locality = feature('B', 'locality', [0, 0], 'Z')
    const result = pickBestFeature([place, locality])
    expect(result.feature).toBe(place)
    expect(result.specificity).toBe(4)
  })

  it('reads specificity from the first feature', () => {
    const locality = feature('A', 'locality', [0, 0], 'Z')
    const result = pickBestFeature([locality])
    expect(result.specificity).toBe(3)
  })

  it('handles unknown feature types with default specificity', () => {
    const unknown = feature('A', 'something_new', [0, 0], 'Z')
    const result = pickBestFeature([unknown])
    expect(result.specificity).toBe(4)
  })
})

// --- SPECIFICITY ---

describe('SPECIFICITY', () => {
  it('has address as most specific', () => {
    expect(SPECIFICITY.address).toBe(0)
  })

  it('has country as least specific', () => {
    expect(SPECIFICITY.country).toBe(8)
  })

  it('locality is more specific than place', () => {
    expect(SPECIFICITY.locality).toBeLessThan(SPECIFICITY.place)
  })
})

// --- tryGeocode with mock search ---

describe('tryGeocode', () => {
  it('geocodes "Malmesbury, Westport St Mary, Wiltshire, England" to Malmesbury, UK', async () => {
    const parts = ['Malmesbury', 'Westport St Mary', 'Wiltshire', 'England']
    const result = await tryGeocode(parts, mockSearch)
    expect(result).not.toBeNull()
    expect(result.lat).toBeCloseTo(51.58, 0)
    expect(result.lng).toBeCloseTo(-2.10, 0)
    expect(result.country).toBe('United Kingdom')
  })

  it('geocodes "Zagreb, Croatia" to Zagreb', async () => {
    const parts = ['Zagreb', 'Croatia']
    const result = await tryGeocode(parts, mockSearch)
    expect(result).not.toBeNull()
    expect(result.lat).toBeCloseTo(45.82, 0)
    expect(result.lng).toBeCloseTo(15.98, 0)
    expect(result.country).toBe('Croatia')
  })

  it('geocodes "Sydney, New South Wales, Australia" to Sydney', async () => {
    const parts = ['Sydney', 'New South Wales', 'Australia']
    const result = await tryGeocode(parts, mockSearch)
    expect(result).not.toBeNull()
    expect(result.lat).toBeCloseTo(-33.87, 0)
    expect(result.lng).toBeCloseTo(151.21, 0)
    expect(result.country).toBe('Australia')
  })

  it('geocodes "Lessen, Elchniederung, Prussia" — falls back to region', async () => {
    const parts = ['Lessen', 'Elchniederung', 'Prussia']
    const result = await tryGeocode(parts, mockSearch)
    expect(result).not.toBeNull()
    expect(result.lat).toBeCloseTo(52.5, 0)
    expect(result.lng).toBeCloseTo(13.4, 0)
  })

  it('geocodes "Sisak, Yugoslavia" to Sisak, Croatia', async () => {
    const parts = ['Sisak', 'Yugoslavia']
    const result = await tryGeocode(parts, mockSearch)
    expect(result).not.toBeNull()
    expect(result.lat).toBeCloseTo(45.47, 0)
    expect(result.lng).toBeCloseTo(16.37, 0)
    expect(result.country).toBe('Croatia')
  })

  it('geocodes "Sarajevo, Yugoslavia" to Sarajevo, Bosnia', async () => {
    const parts = ['Sarajevo', 'Yugoslavia']
    const result = await tryGeocode(parts, mockSearch)
    expect(result).not.toBeNull()
    expect(result.lat).toBeCloseTo(43.86, 0)
    expect(result.lng).toBeCloseTo(18.41, 0)
    expect(result.country).toBe('Bosnia and Herzegovina')
  })

  it('geocodes "Brno, Moravia" to Brno, Czechia', async () => {
    const parts = ['Brno', 'Moravia']
    const result = await tryGeocode(parts, mockSearch)
    expect(result).not.toBeNull()
    expect(result.lat).toBeCloseTo(49.20, 0)
    expect(result.lng).toBeCloseTo(16.61, 0)
    expect(result.country).toBe('Czechia')
  })

  it('geocodes "Krakow, Austria-Hungary" to Kraków, Poland', async () => {
    const parts = ['Krakow', 'Austria-Hungary']
    const result = await tryGeocode(parts, mockSearch)
    expect(result).not.toBeNull()
    expect(result.lat).toBeCloseTo(50.06, 0)
    expect(result.lng).toBeCloseTo(19.94, 0)
    expect(result.country).toBe('Poland')
  })

  it('geocodes "Ganth, Fejer, Austria-Hungary" to Gánt, Hungary', async () => {
    const parts = ['Ganth', 'Fejer', 'Austria-Hungary']
    const result = await tryGeocode(parts, mockSearch)
    expect(result).not.toBeNull()
    expect(result.lat).toBeCloseTo(47.39, 0)
    expect(result.lng).toBeCloseTo(18.39, 0)
  })

  it('geocodes "Gant, Fejer, Hungary" to Gánt, Hungary', async () => {
    const parts = ['Gant', 'Fejer', 'Hungary']
    const result = await tryGeocode(parts, mockSearch)
    expect(result).not.toBeNull()
    expect(result.lat).toBeCloseTo(47.39, 0)
    expect(result.lng).toBeCloseTo(18.39, 0)
  })

  it('geocodes "Naracoorte, South Australia, Australia" to Australia', async () => {
    const parts = ['Naracoorte', 'South Australia', 'Australia']
    const result = await tryGeocode(parts, mockSearch)
    expect(result).not.toBeNull()
    expect(result.country).toBe('Australia')
    expect(result.lat).toBeCloseTo(-36.95, 0)
    expect(result.lng).toBeCloseTo(140.7, 0)
  })

  it('returns null when nothing matches', async () => {
    const parts = ['Nonexistent Place', 'Nowhere']
    const result = await tryGeocode(parts, () => Promise.resolve([]))
    expect(result).toBeNull()
  })

  it('picks the most specific result across progressive queries', async () => {
    const parts = ['Sydney', 'New South Wales', 'Australia']
    const result = await tryGeocode(parts, mockSearch)
    // Sydney (place, specificity 4) is better than New South Wales (region, 7)
    // so it should return Sydney
    expect(result.lat).toBeCloseTo(-33.87, 0)
  })

  it('stops early when specificity <= 3', async () => {
    const calls = []
    const trackingSearch = (query) => {
      calls.push(query)
      // Return a locality (specificity 3) for the first query
      if (calls.length === 1) {
        return Promise.resolve([
          feature('TestPlace', 'locality', [10, 50], 'TestCountry'),
        ])
      }
      return Promise.resolve([])
    }
    const parts = ['TestPlace', 'TestRegion', 'TestCountry']
    const result = await tryGeocode(parts, trackingSearch)
    expect(result).not.toBeNull()
    // Should stop after first query since specificity (3) <= 3
    expect(calls.length).toBe(1)
  })
})
