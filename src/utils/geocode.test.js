import { describe, it, expect } from 'vitest'
import {
  countryCode,
  multiCountryCodes,
  pickBestFeature,
  splitPlace,
  tryGeocode,
  COUNTRY_CODES,
  MULTI_COUNTRY_CODES,
} from './geocode.js'

// --- Helper to build Mapbox v6 feature fixtures ---

function feature(name, type, coords, countryName) {
  return {
    geometry: { type: 'Point', coordinates: coords },
    properties: {
      name,
      feature_type: type,
      context: { country: { name: countryName } },
    },
  }
}

// --- Fake Mapbox API responses keyed by (query, country?) ---
// These simulate what Mapbox v6 returns for various queries.

const FIXTURES = {
  // Malmesbury, Westport St Mary, Wiltshire, England
  'Malmesbury, Westport St Mary, Wiltshire, England|GB': [
    feature('Malmesbury', 'place', [-2.0988, 51.5841], 'United Kingdom'),
  ],
  'Westport St Mary, Wiltshire, England|GB': [],
  'Wiltshire, England|GB': [
    feature('Wiltshire', 'region', [-1.9, 51.25], 'United Kingdom'),
  ],
  'England|GB': [
    feature('England', 'country', [-1.17, 52.35], 'United Kingdom'),
  ],

  // Zagreb, Croatia
  'Zagreb, Croatia|HR': [
    feature('Zagreb', 'place', [15.9819, 45.815], 'Croatia'),
  ],
  'Croatia|HR': [
    feature('Croatia', 'country', [15.5, 45.1], 'Croatia'),
  ],

  // Sydney, New South Wales, Australia
  'Sydney, New South Wales, Australia|AU': [
    feature('Sydney', 'place', [151.2093, -33.8688], 'Australia'),
  ],
  'New South Wales, Australia|AU': [
    feature('New South Wales', 'region', [146.9211, -31.8406], 'Australia'),
  ],
  'Australia|AU': [
    feature('Australia', 'country', [133.7751, -25.2744], 'Australia'),
  ],

  // Lessen, Elchniederung, Prussia → should try DE, PL, RU
  'Lessen, Elchniederung, Prussia|DE': [],
  'Lessen, Elchniederung, Prussia|PL': [],
  'Lessen, Elchniederung, Prussia|RU': [],
  'Lessen, Elchniederung, Prussia|': [],
  'Elchniederung, Prussia|DE': [],
  'Elchniederung, Prussia|PL': [],
  'Elchniederung, Prussia|RU': [],
  'Elchniederung, Prussia|': [],
  'Prussia|DE': [
    feature('Prussia', 'region', [13.4, 52.5], 'Germany'),
  ],
  'Prussia|PL': [],
  'Prussia|RU': [],

  // Sisak, Yugoslavia → should try HR, RS, BA, SI, ME, MK
  'Sisak, Yugoslavia|HR': [
    feature('Sisak', 'place', [16.3728, 45.4654], 'Croatia'),
  ],

  // Sarajevo, Yugoslavia → not in HR, found in BA
  'Sarajevo, Yugoslavia|HR': [],
  'Sarajevo, Yugoslavia|RS': [],
  'Sarajevo, Yugoslavia|BA': [
    feature('Sarajevo', 'place', [18.4131, 43.8563], 'Bosnia and Herzegovina'),
  ],

  // Brno, Moravia → should try CZ
  'Brno, Moravia|CZ': [
    feature('Brno', 'place', [16.6078, 49.1951], 'Czechia'),
  ],

  // Krakow, Austria-Hungary → should try AT, HU, CZ, HR, SK, BA
  'Krakow, Austria-Hungary|AT': [],
  'Krakow, Austria-Hungary|HU': [],
  'Krakow, Austria-Hungary|CZ': [],
  'Krakow, Austria-Hungary|HR': [],
  'Krakow, Austria-Hungary|SK': [],
  'Krakow, Austria-Hungary|BA': [],
  'Krakow, Austria-Hungary|': [
    feature('Kraków', 'place', [19.9445, 50.0647], 'Poland'),
  ],
  'Austria-Hungary|AT': [
    feature('Austria', 'country', [14.5501, 47.5162], 'Austria'),
  ],

  // Ambiguous: "Portland" with no country — should NOT end up in wrong country
  'Portland|': [
    feature('Portland', 'place', [-122.6765, 45.5231], 'United States'),
    feature('Portland', 'place', [-2.4476, 50.5455], 'United Kingdom'),
  ],
}

// Mock search function that returns fixtures based on query + country
function mockSearch(query, { country } = {}) {
  const key = `${query}|${country || ''}`
  return Promise.resolve(FIXTURES[key] || [])
}

// --- countryCode ---

describe('countryCode', () => {
  it('returns ISO code for modern country names', () => {
    expect(countryCode('Australia')).toBe('AU')
    expect(countryCode('England')).toBe('GB')
    expect(countryCode('United States')).toBe('US')
    expect(countryCode('Croatia')).toBe('HR')
    expect(countryCode('Germany')).toBe('DE')
  })

  it('is case-insensitive', () => {
    expect(countryCode('australia')).toBe('AU')
    expect(countryCode('ENGLAND')).toBe('GB')
    expect(countryCode('germany')).toBe('DE')
  })

  it('trims whitespace', () => {
    expect(countryCode(' Australia ')).toBe('AU')
    expect(countryCode('  England')).toBe('GB')
  })

  it('returns ISO code for historical country names', () => {
    expect(countryCode('Prussia')).toBe('DE')
    expect(countryCode('Bohemia')).toBe('CZ')
    expect(countryCode('Moravia')).toBe('CZ')
    expect(countryCode('Bavaria')).toBe('DE')
    expect(countryCode('Saxony')).toBe('DE')
    expect(countryCode('Austria-Hungary')).toBe('AT')
    expect(countryCode('Holland')).toBe('NL')
  })

  it('handles Yugoslavia → HR', () => {
    expect(countryCode('Yugoslavia')).toBe('HR')
  })

  it('handles former Yugoslav republics', () => {
    expect(countryCode('Croatia')).toBe('HR')
    expect(countryCode('Serbia')).toBe('RS')
    expect(countryCode('Slovenia')).toBe('SI')
    expect(countryCode('Bosnia and Herzegovina')).toBe('BA')
    expect(countryCode('Bosnia')).toBe('BA')
    expect(countryCode('Montenegro')).toBe('ME')
    expect(countryCode('Macedonia')).toBe('MK')
    expect(countryCode('North Macedonia')).toBe('MK')
    expect(countryCode('Kosovo')).toBe('XK')
  })

  it('returns null for unknown names', () => {
    expect(countryCode('Narnia')).toBeNull()
    expect(countryCode('')).toBeNull()
    expect(countryCode(null)).toBeNull()
    expect(countryCode(undefined)).toBeNull()
  })
})

// --- multiCountryCodes ---

describe('multiCountryCodes', () => {
  it('returns multiple codes for Yugoslavia', () => {
    const codes = multiCountryCodes('Yugoslavia')
    expect(codes).toContain('HR')
    expect(codes).toContain('RS')
    expect(codes).toContain('BA')
    expect(codes).toContain('SI')
    expect(codes).toContain('ME')
    expect(codes).toContain('MK')
    expect(codes.length).toBe(6)
  })

  it('returns multiple codes for Austria-Hungary', () => {
    const codes = multiCountryCodes('Austria-Hungary')
    expect(codes).toContain('AT')
    expect(codes).toContain('HU')
    expect(codes).toContain('CZ')
    expect(codes).toContain('HR')
  })

  it('returns multiple codes for Prussia', () => {
    const codes = multiCountryCodes('Prussia')
    expect(codes).toContain('DE')
    expect(codes).toContain('PL')
    expect(codes).toContain('RU')
  })

  it('returns null for non-multi-country names', () => {
    expect(multiCountryCodes('Australia')).toBeNull()
    expect(multiCountryCodes('England')).toBeNull()
    expect(multiCountryCodes(null)).toBeNull()
  })

  it('is case-insensitive', () => {
    expect(multiCountryCodes('YUGOSLAVIA')).toEqual(
      multiCountryCodes('yugoslavia')
    )
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

  it('returns the only feature when given one', () => {
    const f = feature('X', 'place', [0, 0], 'Z')
    const result = pickBestFeature([f])
    expect(result.feature).toBe(f)
    expect(result.specificity).toBe(4)
  })

  it('prefers more specific feature types', () => {
    const locality = feature('A', 'locality', [0, 0], 'Z')
    const region = feature('B', 'region', [0, 0], 'Z')
    const country = feature('C', 'country', [0, 0], 'Z')
    const result = pickBestFeature([region, country, locality])
    expect(result.feature).toBe(locality)
    expect(result.specificity).toBe(3)
  })

  it('prefers address over place', () => {
    const address = feature('A', 'address', [0, 0], 'Z')
    const place = feature('B', 'place', [0, 0], 'Z')
    const result = pickBestFeature([place, address])
    expect(result.feature).toBe(address)
    expect(result.specificity).toBe(0)
  })

  it('handles unknown feature types with default specificity', () => {
    const unknown = feature('A', 'something_new', [0, 0], 'Z')
    const region = feature('B', 'region', [0, 0], 'Z')
    const result = pickBestFeature([unknown, region])
    expect(result.feature).toBe(unknown)
    expect(result.specificity).toBe(4)
  })
})

// --- COUNTRY_CODES coverage ---

describe('COUNTRY_CODES', () => {
  it('all values are valid 2-letter ISO codes', () => {
    for (const [, code] of Object.entries(COUNTRY_CODES)) {
      expect(code).toMatch(/^[A-Z]{2}$/)
    }
  })

  it('all keys are lowercase', () => {
    for (const key of Object.keys(COUNTRY_CODES)) {
      expect(key).toBe(key.toLowerCase())
    }
  })

  it('covers the UK constituent countries', () => {
    expect(COUNTRY_CODES['england']).toBe('GB')
    expect(COUNTRY_CODES['scotland']).toBe('GB')
    expect(COUNTRY_CODES['wales']).toBe('GB')
    expect(COUNTRY_CODES['northern ireland']).toBe('GB')
  })
})

// --- MULTI_COUNTRY_CODES coverage ---

describe('MULTI_COUNTRY_CODES', () => {
  it('all keys also exist in COUNTRY_CODES', () => {
    for (const key of Object.keys(MULTI_COUNTRY_CODES)) {
      expect(COUNTRY_CODES).toHaveProperty(key)
    }
  })

  it('the primary code from COUNTRY_CODES is in the multi-code list', () => {
    for (const [name, codes] of Object.entries(MULTI_COUNTRY_CODES)) {
      const primary = COUNTRY_CODES[name]
      expect(codes).toContain(primary)
    }
  })
})

// --- tryGeocode with mock search (end-to-end geocoding logic) ---

describe('tryGeocode', () => {
  it('geocodes "Malmesbury, Westport St Mary, Wiltshire, England" to Wiltshire, UK', async () => {
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
    // Fully historical: city and district unknown to modern APIs.
    // Should still return something (Prussia as region in Germany).
    const parts = ['Lessen', 'Elchniederung', 'Prussia']
    const result = await tryGeocode(parts, mockSearch)
    expect(result).not.toBeNull()
    // Gets Prussia region — not ideal but better than Cuba
    expect(result.lat).toBeCloseTo(52.5, 0)
    expect(result.lng).toBeCloseTo(13.4, 0)
  })

  it('geocodes "Sisak, Yugoslavia" — tries HR first, finds it', async () => {
    const parts = ['Sisak', 'Yugoslavia']
    const result = await tryGeocode(parts, mockSearch)
    expect(result).not.toBeNull()
    expect(result.lat).toBeCloseTo(45.47, 0)
    expect(result.lng).toBeCloseTo(16.37, 0)
    expect(result.country).toBe('Croatia')
  })

  it('geocodes "Sarajevo, Yugoslavia" — tries HR, RS, then finds BA', async () => {
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

  it('geocodes "Krakow, Austria-Hungary" — falls back to unfiltered', async () => {
    // Krakow doesn't match with any A-H country code, but unfiltered finds Poland
    const parts = ['Krakow', 'Austria-Hungary']
    const result = await tryGeocode(parts, mockSearch)
    expect(result).not.toBeNull()
    expect(result.lat).toBeCloseTo(50.06, 0)
    expect(result.lng).toBeCloseTo(19.94, 0)
    expect(result.country).toBe('Poland')
  })

  it('uses country filter — England query hits GB not some random country', async () => {
    // Track which country codes the mock was called with
    const calls = []
    const trackingSearch = (query, opts = {}) => {
      calls.push({ query, country: opts.country })
      return mockSearch(query, opts)
    }
    const parts = ['Malmesbury', 'Westport St Mary', 'Wiltshire', 'England']
    await tryGeocode(parts, trackingSearch)
    // First call should use country=GB (from "England")
    expect(calls[0].country).toBe('GB')
  })

  it('Yugoslavia queries try multiple country codes in order', async () => {
    const calls = []
    const trackingSearch = (query, opts = {}) => {
      calls.push({ query, country: opts.country })
      return mockSearch(query, opts)
    }
    const parts = ['Sarajevo', 'Yugoslavia']
    await tryGeocode(parts, trackingSearch)
    // Should try HR first, then RS, then BA (where it finds a result)
    const countriesTriedForSarajevo = calls
      .filter((c) => c.query === 'Sarajevo, Yugoslavia')
      .map((c) => c.country)
    expect(countriesTriedForSarajevo).toEqual(['HR', 'RS', 'BA'])
  })

  it('returns null when nothing matches', async () => {
    const parts = ['Nonexistent Place', 'Nowhere']
    const result = await tryGeocode(parts, () => Promise.resolve([]))
    expect(result).toBeNull()
  })
})
