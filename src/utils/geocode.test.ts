import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Set the HERE API key before geocode.ts is imported so hereSearch doesn't short-circuit.
vi.hoisted(() => {
  import.meta.env.VITE_HERE_API_KEY = 'test-key'
})

import {
  pickBestFeature,
  splitPlace,
  tryGeocode,
  hereFeatureType,
  SPECIFICITY,
  geocodeAncestors,
  reasonForStatus,
  GeocoderUnavailableError,
  _setRateLimitRetryDelayForTests,
  type FeatureType,
  type GeoFeature,
} from './geocode'

// --- Helper to build feature fixtures (common format for HERE + Mapbox) ---

function feature(
  name: string,
  type: FeatureType,
  coords: [number, number],
  countryName?: string,
  countryCodeVal?: string
): GeoFeature {
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

const FIXTURES: Record<string, GeoFeature[]> = {
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
function mockSearch(query: string): Promise<GeoFeature[]> {
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

  it('drops empty segments from doubled or trailing commas', () => {
    // Ancestry-style exports leave empty jurisdiction slots: "Town, , State, USA,"
    const { parts } = splitPlace('Brooklyn, , New York, USA,')
    expect(parts).toEqual(['Brooklyn', 'New York', 'USA'])
  })

  it('returns no spaceParts for single-word places (would duplicate parts)', () => {
    const { parts, spaceParts } = splitPlace('Australia')
    expect(parts).toEqual(['Australia'])
    expect(spaceParts).toBeNull()
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
    const result = pickBestFeature([place, locality])!
    expect(result.feature).toBe(place)
    expect(result.specificity).toBe(4)
  })

  it('reads specificity from the first feature', () => {
    const locality = feature('A', 'locality', [0, 0], 'Z')
    const result = pickBestFeature([locality])!
    expect(result.specificity).toBe(3)
  })

  it('handles unknown feature types with default specificity', () => {
    const unknown = feature('A', 'something_new' as FeatureType, [0, 0], 'Z')
    const result = pickBestFeature([unknown])!
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
    const result = (await tryGeocode(parts, mockSearch))!
    expect(result).not.toBeNull()
    expect(result.lat).toBeCloseTo(51.58, 0)
    expect(result.lng).toBeCloseTo(-2.10, 0)
    expect(result.country).toBe('United Kingdom')
  })

  it('geocodes "Zagreb, Croatia" to Zagreb', async () => {
    const parts = ['Zagreb', 'Croatia']
    const result = (await tryGeocode(parts, mockSearch))!
    expect(result).not.toBeNull()
    expect(result.lat).toBeCloseTo(45.82, 0)
    expect(result.lng).toBeCloseTo(15.98, 0)
    expect(result.country).toBe('Croatia')
  })

  it('geocodes "Sydney, New South Wales, Australia" to Sydney', async () => {
    const parts = ['Sydney', 'New South Wales', 'Australia']
    const result = (await tryGeocode(parts, mockSearch))!
    expect(result).not.toBeNull()
    expect(result.lat).toBeCloseTo(-33.87, 0)
    expect(result.lng).toBeCloseTo(151.21, 0)
    expect(result.country).toBe('Australia')
  })

  it('geocodes "Lessen, Elchniederung, Prussia" — falls back to region', async () => {
    const parts = ['Lessen', 'Elchniederung', 'Prussia']
    const result = (await tryGeocode(parts, mockSearch))!
    expect(result).not.toBeNull()
    expect(result.lat).toBeCloseTo(52.5, 0)
    expect(result.lng).toBeCloseTo(13.4, 0)
  })

  it('geocodes "Sisak, Yugoslavia" to Sisak, Croatia', async () => {
    const parts = ['Sisak', 'Yugoslavia']
    const result = (await tryGeocode(parts, mockSearch))!
    expect(result).not.toBeNull()
    expect(result.lat).toBeCloseTo(45.47, 0)
    expect(result.lng).toBeCloseTo(16.37, 0)
    expect(result.country).toBe('Croatia')
  })

  it('geocodes "Sarajevo, Yugoslavia" to Sarajevo, Bosnia', async () => {
    const parts = ['Sarajevo', 'Yugoslavia']
    const result = (await tryGeocode(parts, mockSearch))!
    expect(result).not.toBeNull()
    expect(result.lat).toBeCloseTo(43.86, 0)
    expect(result.lng).toBeCloseTo(18.41, 0)
    expect(result.country).toBe('Bosnia and Herzegovina')
  })

  it('geocodes "Brno, Moravia" to Brno, Czechia', async () => {
    const parts = ['Brno', 'Moravia']
    const result = (await tryGeocode(parts, mockSearch))!
    expect(result).not.toBeNull()
    expect(result.lat).toBeCloseTo(49.20, 0)
    expect(result.lng).toBeCloseTo(16.61, 0)
    expect(result.country).toBe('Czechia')
  })

  it('geocodes "Krakow, Austria-Hungary" to Kraków, Poland', async () => {
    const parts = ['Krakow', 'Austria-Hungary']
    const result = (await tryGeocode(parts, mockSearch))!
    expect(result).not.toBeNull()
    expect(result.lat).toBeCloseTo(50.06, 0)
    expect(result.lng).toBeCloseTo(19.94, 0)
    expect(result.country).toBe('Poland')
  })

  it('geocodes "Ganth, Fejer, Austria-Hungary" to Gánt, Hungary', async () => {
    const parts = ['Ganth', 'Fejer', 'Austria-Hungary']
    const result = (await tryGeocode(parts, mockSearch))!
    expect(result).not.toBeNull()
    expect(result.lat).toBeCloseTo(47.39, 0)
    expect(result.lng).toBeCloseTo(18.39, 0)
  })

  it('geocodes "Gant, Fejer, Hungary" to Gánt, Hungary', async () => {
    const parts = ['Gant', 'Fejer', 'Hungary']
    const result = (await tryGeocode(parts, mockSearch))!
    expect(result).not.toBeNull()
    expect(result.lat).toBeCloseTo(47.39, 0)
    expect(result.lng).toBeCloseTo(18.39, 0)
  })

  it('geocodes "Naracoorte, South Australia, Australia" to Australia', async () => {
    const parts = ['Naracoorte', 'South Australia', 'Australia']
    const result = (await tryGeocode(parts, mockSearch))!
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
    const result = (await tryGeocode(parts, mockSearch))!
    // Sydney (place, specificity 4) is better than New South Wales (region, 7)
    // so it should return Sydney
    expect(result.lat).toBeCloseTo(-33.87, 0)
  })

  it('stops early on a city-level (place) result without querying broader parts', async () => {
    // HERE maps city results to 'place' (specificity 4); a broader query
    // can never beat an already-found city match, so no further API
    // calls should be made.
    const calls: string[] = []
    const trackingSearch = (query: string): Promise<GeoFeature[]> => {
      calls.push(query)
      if (calls.length === 1) {
        return Promise.resolve([
          feature('Zagreb', 'place', [15.98, 45.81], 'Croatia'),
        ])
      }
      return Promise.resolve([])
    }
    const result = (await tryGeocode(['Zagreb', 'Croatia'], trackingSearch))!
    expect(result).not.toBeNull()
    expect(result.country).toBe('Croatia')
    expect(calls).toEqual(['Zagreb, Croatia'])
  })

  it('stops early when specificity <= 3', async () => {
    const calls: string[] = []
    const trackingSearch = (query: string): Promise<GeoFeature[]> => {
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

  it('returns country from last part when feature has no country context', async () => {
    const searchFn = (): Promise<GeoFeature[]> =>
      Promise.resolve([
        {
          geometry: { type: 'Point', coordinates: [10, 50] },
          properties: { name: 'Test', feature_type: 'place', context: { country: {} } },
        },
      ])
    const result = (await tryGeocode(['Town', 'MyCountry'], searchFn))!
    expect(result.country).toBe('MyCountry')
  })

  it('handles empty parts array', async () => {
    const result = await tryGeocode([], mockSearch)
    expect(result).toBeNull()
  })

  it('handles single-part array', async () => {
    const result = (await tryGeocode(['Portland'], mockSearch))!
    expect(result).not.toBeNull()
    expect(result.lat).toBeCloseTo(45.52, 0)
  })
})

// --- geocodeAncestors ---

describe('geocodeAncestors', () => {
  // Mock the HERE API by intercepting fetch
  function setupFetchMock(responseMap: Record<string, ReturnType<typeof hereItem>[]>) {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = new URL(url.toString())
      const query = u.searchParams.get('q') ?? ''
      const items = responseMap[query] || []
      return {
        ok: true,
        json: async () => ({ items }),
      } as Response
    })
    return () => {
      globalThis.fetch = originalFetch
    }
  }

  function hereItem(
    name: string,
    lat: number,
    lng: number,
    countryName: string,
    resultType = 'locality'
  ) {
    return {
      title: name,
      position: { lat, lng },
      resultType,
      address: { label: name, countryName, countryCode: 'XX' },
    }
  }

  it('geocodes ancestors and splits into geocoded/geocodeFailed', async () => {
    const cleanup = setupFetchMock({
      'London, England': [hereItem('London', 51.5, -0.12, 'United Kingdom')],
      'England': [hereItem('England', 52.0, -1.0, 'United Kingdom')],
      'Nowhere, Nowhereland': [],
      'Nowhereland': [],
    })

    try {
      const ancestors = [
        { id: '1', name: 'John', birthPlace: 'London, England' },
        { id: '2', name: 'Jane', birthPlace: 'Nowhere, Nowhereland' },
      ]
      const progress = vi.fn()
      const { geocoded, geocodeFailed } = await geocodeAncestors(
        ancestors,
        progress
      )

      expect(geocoded).toHaveLength(1)
      expect(geocoded[0].id).toBe('1')
      expect(geocoded[0].lat).toBeCloseTo(51.5, 0)
      expect(geocoded[0].country).toBe('United Kingdom')

      expect(geocodeFailed).toHaveLength(1)
      expect(geocodeFailed[0].id).toBe('2')
    } finally {
      cleanup()
    }
  })

  it('calls onProgress for each ancestor processed', async () => {
    const cleanup = setupFetchMock({
      'A': [hereItem('A', 1, 1, 'X')],
      'B': [hereItem('B', 2, 2, 'Y')],
      'C': [hereItem('C', 3, 3, 'Z')],
    })

    try {
      const ancestors = [
        { id: '1', name: 'A', birthPlace: 'A' },
        { id: '2', name: 'B', birthPlace: 'B' },
        { id: '3', name: 'C', birthPlace: 'C' },
      ]
      const progress = vi.fn()
      await geocodeAncestors(ancestors, progress)

      expect(progress).toHaveBeenCalledTimes(3)
      expect(progress).toHaveBeenCalledWith(1)
      expect(progress).toHaveBeenCalledWith(2)
      expect(progress).toHaveBeenCalledWith(3)
    } finally {
      cleanup()
    }
  })

  it('geocodes a birth place shared by concurrent ancestors with a single API request', async () => {
    const cleanup = setupFetchMock({
      'Dupville, Dupland': [hereItem('Dupville', 10, 20, 'Dupland')],
    })

    try {
      const ancestors = [
        { id: '1', name: 'A', birthPlace: 'Dupville, Dupland' },
        { id: '2', name: 'B', birthPlace: 'Dupville, Dupland' },
        { id: '3', name: 'C', birthPlace: 'Dupville, Dupland' },
      ]
      const { geocoded } = await geocodeAncestors(ancestors, () => {})

      expect(geocoded).toHaveLength(3)
      expect(geocoded.every((a) => a.lat === 10 && a.country === 'Dupland')).toBe(true)
      // All three run concurrently; the in-flight lookup must be shared.
      expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    } finally {
      cleanup()
    }
  })

  it('handles empty ancestors array', async () => {
    const progress = vi.fn()
    const { geocoded, geocodeFailed } = await geocodeAncestors([], progress)
    expect(geocoded).toHaveLength(0)
    expect(geocodeFailed).toHaveLength(0)
    expect(progress).not.toHaveBeenCalled()
  })

  it('respects concurrency option', async () => {
    let inFlight = 0
    let maxInFlight = 0

    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      // Simulate async delay
      await new Promise((r) => setTimeout(r, 10))
      inFlight--
      const u = new URL(url.toString())
      const query = u.searchParams.get('q') ?? ''
      return {
        ok: true,
        json: async () => ({
          items: [hereItem(query, 1, 1, 'X')],
        }),
      } as Response
    })

    try {
      const ancestors = Array.from({ length: 10 }, (_, i) => ({
        id: String(i),
        name: `Person ${i}`,
        birthPlace: `Place${i}`,
      }))
      const progress = vi.fn()
      await geocodeAncestors(ancestors, progress, { concurrency: 2 })

      expect(maxInFlight).toBeLessThanOrEqual(2)
      expect(progress).toHaveBeenCalledTimes(10)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('handles fetch errors gracefully', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => {
      throw new Error('Network error')
    })

    try {
      const ancestors = [
        { id: '1', name: 'Test', birthPlace: 'ErrorPlace' },
      ]
      const progress = vi.fn()
      const { geocoded, geocodeFailed, geocodeUnavailable } = await geocodeAncestors(
        ancestors,
        progress
      )

      expect(geocoded).toHaveLength(0)
      // This assertion used to read `geocodeFailed` — the run still completes
      // gracefully, but a fetch that never reached HERE tells us nothing about
      // the place, so it is no longer reported as one we looked up and missed.
      expect(geocodeFailed).toHaveLength(0)
      expect(geocodeUnavailable).toHaveLength(1)
      expect(progress).toHaveBeenCalledWith(1)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

// --- Geocoder unavailable vs. place not found ---
//
// These two were indistinguishable before: a 429 (HERE's free tier is 250k
// requests/month) returned [] exactly like a real no-match, so an exhausted
// quota rendered every ancestor into the "not mapped" list and the app looked
// broken instead of rate-limited. Regression guard for that.
describe('geocoder unavailability', () => {
  function withFetch(impl: () => Promise<Response> | never, run: () => Promise<void>) {
    return async () => {
      const originalFetch = globalThis.fetch
      globalThis.fetch = vi.fn(impl) as unknown as typeof fetch
      try {
        await run()
      } finally {
        globalThis.fetch = originalFetch
      }
    }
  }

  const res = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
    ({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (k: string) => headers[k] ?? null },
      json: async () => body,
    }) as unknown as Response

  const person = (id: string, birthPlace: string) => ({ id, name: `P${id}`, birthPlace })

  const feature = (name: string) => ({
    items: [
      {
        title: name,
        position: { lat: 1, lng: 2 },
        resultType: 'locality',
        address: { label: name, countryName: 'Testland', countryCode: 'TST' },
      },
    ],
  })

  // The 429 path now retries, so leave no real delay in it.
  beforeEach(() => _setRateLimitRetryDelayForTests(0))
  afterEach(() => _setRateLimitRetryDelayForTests(null))

  it('maps HTTP status onto the reason a caller acts on', () => {
    // 429 is transient, NOT quota: HERE answers it both for an exhausted
    // allowance and for out-running its short-term request rate, and one
    // burst must not latch a whole tree.
    expect(reasonForStatus(429)).toBe('rate-limited')
    expect(reasonForStatus(401)).toBe('auth')
    expect(reasonForStatus(403)).toBe('auth')
    expect(reasonForStatus(500)).toBe('network')
  })

  it(
    'routes a 429 to geocodeUnavailable, not geocodeFailed',
    withFetch(
      async () => res(429),
      async () => {
        const { geocoded, geocodeFailed, geocodeUnavailable, unavailableReason } =
          await geocodeAncestors([person('1', 'Anywhere')], () => {})

        expect(geocoded).toHaveLength(0)
        // The distinction this whole change exists for: we never looked, so
        // this is NOT evidence the place is unmappable.
        expect(geocodeFailed).toHaveLength(0)
        expect(geocodeUnavailable).toHaveLength(1)
        // One 429, retried and still 429: transient as far as we can tell,
        // so it is reported as rate limiting rather than a spent allowance.
        expect(unavailableReason).toBe('rate-limited')
      }
    )
  )

  it(
    'stops spending requests once the quota is gone',
    withFetch(
      async () => res(429),
      async () => {
        const people = Array.from({ length: 20 }, (_, i) => person(String(i), `Place ${i}`))
        const { geocodeUnavailable, unavailableReason } = await geocodeAncestors(
          people,
          () => {},
          { concurrency: 1 }
        )

        expect(geocodeUnavailable).toHaveLength(20)
        // Three ancestors' worth of retried 429s is the evidence that earns
        // the latch — then it stops, rather than proving it 17 more times.
        // Two requests each (the attempt and its retry), and no more.
        expect(globalThis.fetch).toHaveBeenCalledTimes(6)
        expect(unavailableReason).toBe('quota')
      }
    )
  )

  // HERE answers 429 for its short-term request rate as well as for a spent
  // allowance. Mapping every 429 to a terminal `quota` meant one burst — five
  // lookups in flight by default — latched the whole tree and told the user
  // their monthly allowance was gone.
  it(
    'recovers from a burst 429 by retrying',
    withFetch(
      (() => {
        let n = 0
        return async () => {
          n++
          return n === 1 ? res(429, {}, { 'Retry-After': '0' }) : res(200, feature('Somewhere'))
        }
      })(),
      async () => {
        const { geocoded, geocodeUnavailable } = await geocodeAncestors(
          [person('1', 'Somewhere')],
          () => {}
        )

        expect(geocodeUnavailable).toHaveLength(0)
        expect(geocoded).toHaveLength(1)
        expect(globalThis.fetch).toHaveBeenCalledTimes(2)
      }
    )
  )

  it(
    'does not latch the batch on a burst that one ancestor cannot survive',
    withFetch(
      (() => {
        let burst = 0
        return async (...args: unknown[]) => {
          const url = String(args[0])
          // Only the first place is rate limited, through its retry too.
          // (No space in the name: URLSearchParams encodes one as `+`.)
          if (url.includes('Burstplace') && burst < 2) {
            burst++
            return res(429)
          }
          return res(200, feature('Elsewhere'))
        }
      })() as () => Promise<Response>,
      async () => {
        const people = [
          person('0', 'Burstplace'),
          ...Array.from({ length: 5 }, (_, i) => person(String(i + 1), `Calmplace${i}`)),
        ]
        const { geocoded, geocodeUnavailable, unavailableReason } = await geocodeAncestors(
          people,
          () => {},
          { concurrency: 1 }
        )

        // The five after it still get looked up — the latch would have taken
        // every one of them.
        expect(geocoded).toHaveLength(5)
        expect(geocodeUnavailable).toHaveLength(1)
        expect(unavailableReason).toBe('rate-limited')
      }
    )
  )

  // A confirmed no-match is evidence the geocoder is reachable, which is the
  // only thing the streak measures — so it has to count, or three 429s spread
  // across a tree of unresolvable places latch as an exhausted allowance.
  it(
    'resets the run on a confirmed no-match, not just on a hit',
    withFetch(
      (() => {
        let n = 0
        return async () => {
          n++
          // 429, retry 429 (one ancestor), then a 2xx with no items.
          return n % 3 === 0 ? res(200, { items: [] }) : res(429)
        }
      })(),
      async () => {
        const people = Array.from({ length: 8 }, (_, i) => person(String(i), `Nowhere${i}`))
        const { geocodeUnavailable, geocodeFailed, unavailableReason } =
          await geocodeAncestors(people, () => {}, { concurrency: 1 })

        expect(unavailableReason).toBe('rate-limited')
        // Never latched, so every ancestor was still attempted.
        expect(geocodeUnavailable.length + geocodeFailed.length).toBe(8)
        expect(geocodeFailed.length).toBeGreaterThan(0)
      }
    )
  )

  // Retrying per-request isn't enough on its own: concurrent lookups all take
  // the burst, all sleep the same interval, and all retry together — remaking
  // the burst and manufacturing the failures the batch reads as quota. The
  // gate is what makes one lookup's 429 hold the *queued* ones back too.
  it('holds queued lookups back once one of them is rate limited', async () => {
    const DELAY = 60
    _setRateLimitRetryDelayForTests(DELAY)
    const originalFetch = globalThis.fetch
    const times: number[] = []
    let n = 0
    globalThis.fetch = vi.fn(async () => {
      times.push(Date.now())
      n++
      // Only the very first request is rate limited.
      return n === 1 ? res(429) : res(200, feature('Elsewhere'))
    }) as unknown as typeof fetch

    try {
      const people = Array.from({ length: 8 }, (_, i) => person(String(i), `Gatedplace${i}`))
      const { geocoded } = await geocodeAncestors(people, () => {}, { concurrency: 2 })

      // The geocode cache is module-level and outlives a test, so a name any
      // other test also uses would make this pass without reaching the stub
      // at all. Assert it ran before asserting what it did.
      expect(times).toHaveLength(9)
      // The gate is a hold, not a drop — everyone still gets looked up.
      expect(geocoded).toHaveLength(8)

      // Only the requests already in flight when the 429 landed may predate
      // the pause. Without the gate the six queued ancestors fire immediately
      // while the rate-limited one is still sleeping.
      const deadline = times[0] + DELAY
      const beforeDeadline = times.filter((t) => t < deadline).length
      expect(beforeDeadline).toBeLessThanOrEqual(2)
    } finally {
      globalThis.fetch = originalFetch
      _setRateLimitRetryDelayForTests(0)
    }
  })

  // Concurrency means the streak can complete while a lookup from the same
  // in-flight group is still out. If that one comes back 2xx, the allowance
  // cannot be spent — and by then the whole remaining queue has already
  // drained past the latch, so lifting it is only worth anything if those
  // ancestors were held rather than filed.
  it('lifts an inferred quota latch when an in-flight lookup succeeds', async () => {
    _setRateLimitRetryDelayForTests(0)
    const originalFetch = globalThis.fetch
    // Keyed on the place with explicit delays, not on a call counter: the
    // lookups interleave, so a counter decides *which* ancestor 429s by
    // scheduling accident, and a success slipping in between two 429s resets
    // the streak — which is correct behavior, and not the scenario under test.
    const delayed = async (ms: number, r: Response) => {
      await new Promise((k) => setTimeout(k, ms))
      return r
    }
    globalThis.fetch = vi.fn(async (input: unknown) => {
      const url = String(input)
      // Three ancestors 429 through their retries and finish together, which
      // is what closes the latch.
      if (/Rlplace[012](&|$)/.test(url)) return delayed(10, res(429))
      // Still in flight when that happens, and then succeeds — the evidence
      // that disproves it.
      if (url.includes('Slowplace')) return delayed(60, res(200, feature('Elsewhere')))
      // Slow enough that a tail lookup can't succeed *before* the streak
      // completes and reset it, which would dismantle the setup.
      return delayed(30, res(200, feature('Elsewhere')))
    }) as unknown as typeof fetch

    try {
      const people = [
        ...Array.from({ length: 3 }, (_, i) => person(`r${i}`, `Rlplace${i}`)),
        person('slow', 'Slowplace'),
        ...Array.from({ length: 4 }, (_, i) => person(`t${i}`, `Tailplace${i}`)),
      ]
      const { geocoded, geocodeUnavailable, unavailableReason } = await geocodeAncestors(
        people,
        () => {},
        { concurrency: 4 }
      )

      // The success disproves the inferred latch, so the reason falls back to
      // the rate limiting that did happen rather than a spent allowance.
      expect(unavailableReason).not.toBe('quota')
      // Only the three that actually 429ed. The four-ancestor tail the latch
      // skipped was retried once it was lifted, not written off — which only
      // works because those ancestors were held rather than filed: the whole
      // queue drains past a closed latch in a microtask, long before a real
      // request resolves.
      expect(geocodeUnavailable.map((a) => a.id).sort()).toEqual(['r0', 'r1', 'r2'])
      expect(geocoded.map((a) => a.id).sort()).toEqual(
        ['slow', 't0', 't1', 't2', 't3'].sort()
      )
    } finally {
      globalThis.fetch = originalFetch
      _setRateLimitRetryDelayForTests(0)
    }
  })

  it(
    'resets the run toward a latch when a live lookup gets through',
    withFetch(
      (() => {
        let n = 0
        return async () => {
          n++
          // 429, 429 (one ancestor retried), then a success, then the same
          // again — never three retried failures without one getting through.
          return n % 3 === 0 ? res(200, feature('Elsewhere')) : res(429)
        }
      })(),
      async () => {
        const people = Array.from({ length: 8 }, (_, i) => person(String(i), `Place ${i}`))
        const { unavailableReason } = await geocodeAncestors(people, () => {}, {
          concurrency: 1,
        })

        // Never latches, so it is never reported as an exhausted allowance.
        expect(unavailableReason).toBe('rate-limited')
      }
    )
  )

  it(
    'does not latch on a one-off network failure',
    withFetch(
      (() => {
        let n = 0
        return async () => {
          n++
          if (n === 1) throw new Error('boom')
          return res(200, {
            items: [
              {
                title: 'Somewhere',
                position: { lat: 1, lng: 2 },
                resultType: 'locality',
                address: { countryName: 'Testland' },
              },
            ],
          })
        }
      })(),
      async () => {
        const { geocoded, geocodeUnavailable } = await geocodeAncestors(
          [person('1', 'First'), person('2', 'Second')],
          () => {},
          { concurrency: 1 }
        )

        // A single blip must not abandon the rest of the tree.
        expect(geocodeUnavailable).toHaveLength(1)
        expect(geocoded).toHaveLength(1)
      }
    )
  )

  it(
    'still reports a genuine no-match as geocodeFailed',
    withFetch(
      async () => res(200, { items: [] }),
      async () => {
        const { geocodeFailed, geocodeUnavailable } = await geocodeAncestors(
          [person('1', 'Nowhere At All')],
          () => {}
        )

        expect(geocodeFailed).toHaveLength(1)
        expect(geocodeUnavailable).toHaveLength(0)
      }
    )
  )

  it('carries a status but never the query text', () => {
    const e = new GeocoderUnavailableError('quota', 429)
    expect(e.reason).toBe('quota')
    expect(e.status).toBe(429)
    // A birth place is GEDCOM record detail — it must not ride the error.
    expect(e.message).toBe('geocoder unavailable: quota (HTTP 429)')
  })

  // --- Regressions found in review of the original split (PR #164) ---

  it(
    'still serves a cached place after the latch closes',
    withFetch(
      (() => {
        let n = 0
        return async () => {
          n++
          // 1st: Alpha resolves. 2nd: Beta 429s and latches. Alpha is now
          // cached, so the 3rd ancestor must still map — serving it costs no
          // request, and duplicate birth places are the norm in a family tree.
          if (n === 1)
            return res(200, {
              items: [
                {
                  title: 'Alpha',
                  position: { lat: 1, lng: 2 },
                  resultType: 'locality',
                  address: { countryName: 'Testland' },
                },
              ],
            })
          return res(401)
        }
      })(),
      async () => {
        const { geocoded, geocodeUnavailable } = await geocodeAncestors(
          [person('1', 'CachedAlpha'), person('2', 'UncachedBeta'), person('3', 'CachedAlpha')],
          () => {},
          { concurrency: 1 }
        )

        expect(geocoded.map((a) => a.id)).toEqual(['1', '3'])
        expect(geocodeUnavailable.map((a) => a.id)).toEqual(['2'])
        // Exactly two requests: Alpha once, Beta once. The third was cached.
        expect(globalThis.fetch).toHaveBeenCalledTimes(2)
      }
    )
  )

  it(
    'lets a terminal reason supersede an earlier transient one',
    withFetch(
      (() => {
        let n = 0
        return async () => {
          n++
          if (n === 1) throw new Error('blip')
          return res(401)
        }
      })(),
      async () => {
        const { unavailableReason } = await geocodeAncestors(
          [person('1', 'TransientFirst'), person('2', 'AuthSecond')],
          () => {},
          { concurrency: 1 }
        )

        // A one-off blip landing before the 429 must not leave the overlay
        // telling the user to retry when the month's quota is what stopped it.
        expect(unavailableReason).toBe('auth')
      }
    )
  )

  it(
    'logs each distinct reason once, sanitized, and never the query',
    withFetch(
      async () => res(401),
      async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        try {
          await geocodeAncestors(
            [person('1', 'SecretVillage'), person('2', 'SecretVillage Two')],
            () => {},
            { concurrency: 1 }
          )

          expect(warn).toHaveBeenCalledTimes(1)
          const logged = warn.mock.calls.flat().join(' ')
          expect(logged).toContain('auth')
          expect(logged).toContain('401')
          // A birth place is GEDCOM record detail — it must never be logged.
          expect(logged).not.toContain('SecretVillage')
        } finally {
          warn.mockRestore()
        }
      }
    )
  )

  it(
    'keeps a broad match already in hand when a refining request fails',
    withFetch(
      (() => {
        let n = 0
        return async () => {
          n++
          // Query 1 (the full string) yields only a region-level hit, which is
          // broader than `place`, so the loop keeps going to refine it. Query 2
          // then 401s. The region is still a plottable answer.
          if (n === 1)
            return res(200, {
              items: [
                {
                  title: 'Broad Region',
                  position: { lat: 10, lng: 20 },
                  resultType: 'administrativeArea',
                  address: { countryName: 'Testland' },
                },
              ],
            })
          return res(401)
        }
      })(),
      async () => {
        const { geocoded, geocodeUnavailable, unavailableReason } = await geocodeAncestors(
          [person('1', 'Refine Town, Refine Region, Refineland'), person('2', 'AfterLatch')],
          () => {},
          { concurrency: 1 }
        )

        // The refining request failing must not throw away the answer we had.
        expect(geocoded).toHaveLength(1)
        expect(geocoded[0].id).toBe('1')
        expect(geocoded[0].lat).toBe(10)
        // ...and the failure still latches, so the next ancestor spends nothing.
        expect(geocodeUnavailable.map((a) => a.id)).toEqual(['2'])
        expect(unavailableReason).toBe('auth')
      }
    )
  )

  it(
    'does not cache a broad match kept after a TRANSIENT failure',
    withFetch(
      (() => {
        let n = 0
        return async () => {
          n++
          // Run 1: query 1 gives a region hit, query 2 blips (network, not
          // terminal) → broad match kept but provisional. Run 2: the refining
          // query now succeeds, so the ancestor should get the precise answer.
          if (n === 1)
            return res(200, {
              items: [
                {
                  title: 'Coarse Region',
                  position: { lat: 10, lng: 20 },
                  resultType: 'administrativeArea',
                  address: { countryName: 'Testland' },
                },
              ],
            })
          if (n === 2) throw new Error('blip')
          return res(200, {
            items: [
              {
                title: 'Precise Town',
                position: { lat: 11, lng: 21 },
                resultType: 'locality',
                address: { countryName: 'Testland' },
              },
            ],
          })
        }
      })(),
      async () => {
        const place = 'Provisional Town, Provisional Region, Provisionalia'
        const first = await geocodeAncestors([person('1', place)], () => {}, { concurrency: 1 })
        expect(first.geocoded[0].lat).toBe(10)

        // A second run must re-query rather than inherit the region centroid.
        const second = await geocodeAncestors([person('2', place)], () => {}, { concurrency: 1 })
        expect(second.geocoded).toHaveLength(1)
        expect(second.geocoded[0].lat).toBe(11)
      }
    )
  )

  it(
    'DOES cache a broad match kept after a TERMINAL failure',
    withFetch(
      (() => {
        let n = 0
        return async () => {
          n++
          if (n === 1)
            return res(200, {
              items: [
                {
                  title: 'Terminal Region',
                  position: { lat: 30, lng: 40 },
                  resultType: 'administrativeArea',
                  address: { countryName: 'Testland' },
                },
              ],
            })
          return res(401)
        }
      })(),
      async () => {
        const place = 'Terminal Town, Terminal Region, Terminalia'
        await geocodeAncestors([person('1', place)], () => {}, { concurrency: 1 })
        const before = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length

        // The quota is gone for the month, so the coarse answer is as good as
        // it gets — a later run must serve it from cache, not re-ask.
        const second = await geocodeAncestors([person('2', place)], () => {}, { concurrency: 1 })
        expect(second.geocoded[0].lat).toBe(30)
        expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(before)
      }
    )
  )

  it(
    'never logs a birth place, even on the broad-match fallback path',
    withFetch(
      (() => {
        let n = 0
        return async () => {
          n++
          if (n === 1)
            return res(200, {
              items: [
                {
                  title: 'Region Hit',
                  position: { lat: 5, lng: 6 },
                  resultType: 'administrativeArea',
                  address: {
                    label: '12 Private Street, Secretville, Confidentia',
                    countryName: 'Confidentia',
                  },
                },
              ],
            })
          return res(401)
        }
      })(),
      async () => {
        const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
        try {
          // The fallback `break` routes this through the resolve logger, which
          // the thrown path used to bypass — so it is the path most at risk.
          await geocodeAncestors(
            [person('1', 'Secretville, Secret Region, Confidentia')],
            () => {},
            { concurrency: 1 }
          )

          const logged = debug.mock.calls.flat().map(String).join(' ')
          expect(logged).not.toContain('Secretville')
          expect(logged).not.toContain('Secret Region')
          expect(logged).not.toContain('Private Street')
          // ...while still saying enough to diagnose a bad resolve.
          expect(logged).toContain('type=region')
        } finally {
          debug.mockRestore()
        }
      }
    )
  )

  it(
    'does not echo the place string when HERE returns no country',
    withFetch(
      async () =>
        res(200, {
          items: [
            {
              title: 'Bare Hit',
              position: { lat: 7, lng: 8 },
              resultType: 'locality',
              address: {}, // no countryName — `country` falls back to the query
            },
          ],
        }),
      async () => {
        const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
        try {
          await geocodeAncestors([person('1', 'Villageofsecrets')], () => {}, {
            concurrency: 1,
          })
          const logged = debug.mock.calls.flat().map(String).join(' ')
          expect(logged).not.toContain('Villageofsecrets')
          expect(logged).toContain('country=<unresolved>')
        } finally {
          debug.mockRestore()
        }
      }
    )
  )
})
