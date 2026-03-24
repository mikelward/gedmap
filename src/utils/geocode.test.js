import { describe, it, expect } from 'vitest'
import {
  countryCode,
  multiCountryCodes,
  pickBestFeature,
  splitPlace,
  COUNTRY_CODES,
  MULTI_COUNTRY_CODES,
} from './geocode.js'

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
      'Zagreb, Zagreb County, Croatia'
    )
    expect(parts).toEqual(['Zagreb', 'Zagreb County', 'Croatia'])
  })
})

// --- pickBestFeature ---

describe('pickBestFeature', () => {
  function makeFeature(type, coords = [0, 0]) {
    return {
      geometry: { coordinates: coords },
      properties: { feature_type: type, context: {} },
    }
  }

  it('returns null for empty array', () => {
    expect(pickBestFeature([])).toBeNull()
  })

  it('returns the only feature when given one', () => {
    const f = makeFeature('place')
    const result = pickBestFeature([f])
    expect(result.feature).toBe(f)
    expect(result.specificity).toBe(4)
  })

  it('prefers more specific feature types', () => {
    const locality = makeFeature('locality')
    const region = makeFeature('region')
    const country = makeFeature('country')
    const result = pickBestFeature([region, country, locality])
    expect(result.feature).toBe(locality)
    expect(result.specificity).toBe(3)
  })

  it('prefers address over place', () => {
    const address = makeFeature('address')
    const place = makeFeature('place')
    const result = pickBestFeature([place, address])
    expect(result.feature).toBe(address)
    expect(result.specificity).toBe(0)
  })

  it('handles unknown feature types with default specificity', () => {
    const unknown = makeFeature('something_new')
    const region = makeFeature('region')
    const result = pickBestFeature([unknown, region])
    // unknown defaults to 4, region is 7 → unknown wins
    expect(result.feature).toBe(unknown)
    expect(result.specificity).toBe(4)
  })
})

// --- COUNTRY_CODES coverage ---

describe('COUNTRY_CODES', () => {
  it('all values are valid 2-letter ISO codes (or XK for Kosovo)', () => {
    for (const [name, code] of Object.entries(COUNTRY_CODES)) {
      expect(code).toMatch(
        /^[A-Z]{2}$/,
      )
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
