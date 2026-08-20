import { describe, it, expect } from 'vitest'

// Test the Mercator projection math directly by extracting the formulas.
// The actual MiniMap component depends on canvas + mapbox refs, so we test
// the pure projection functions rather than the full component.

// These are copied from MiniMap.tsx — if they change there, update here.
function lngToX(lng: number, w: number): number {
  return ((lng + 180) / 360) * w
}
function latToY(lat: number, w: number, h: number): number {
  const latRad = (lat * Math.PI) / 180
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2))
  return h / 2 - (w * mercN) / (2 * Math.PI)
}
function xToLng(x: number, w: number): number {
  return (x / w) * 360 - 180
}
function yToLat(y: number, w: number, h: number): number {
  const mercN = ((h / 2 - y) * 2 * Math.PI) / w
  return (Math.atan(Math.sinh(mercN)) * 180) / Math.PI
}

describe('MiniMap Mercator projection', () => {
  const W = 160
  const H = 100

  it('maps lng=0 to center x', () => {
    expect(lngToX(0, W)).toBeCloseTo(W / 2, 5)
  })

  it('maps lng=-180 to x=0', () => {
    expect(lngToX(-180, W)).toBeCloseTo(0, 5)
  })

  it('maps lng=180 to x=W', () => {
    expect(lngToX(180, W)).toBeCloseTo(W, 5)
  })

  it('maps lat=0 to center y', () => {
    expect(latToY(0, W, H)).toBeCloseTo(H / 2, 5)
  })

  it('positive latitude maps to upper half (y < H/2)', () => {
    expect(latToY(45, W, H)).toBeLessThan(H / 2)
  })

  it('negative latitude maps to lower half (y > H/2)', () => {
    expect(latToY(-45, W, H)).toBeGreaterThan(H / 2)
  })

  it('lngToX and xToLng are inverse', () => {
    for (const lng of [-180, -90, 0, 45, 90, 180]) {
      expect(xToLng(lngToX(lng, W), W)).toBeCloseTo(lng, 5)
    }
  })

  it('latToY and yToLat are inverse', () => {
    for (const lat of [-60, -30, 0, 30, 60]) {
      expect(yToLat(latToY(lat, W, H), W, H)).toBeCloseTo(lat, 5)
    }
  })

  it('works with different canvas sizes', () => {
    const w2 = 320
    const h2 = 200
    expect(lngToX(0, w2)).toBeCloseTo(w2 / 2, 5)
    expect(latToY(0, w2, h2)).toBeCloseTo(h2 / 2, 5)
    expect(xToLng(lngToX(90, w2), w2)).toBeCloseTo(90, 5)
    expect(yToLat(latToY(45, w2, h2), w2, h2)).toBeCloseTo(45, 5)
  })

  it('known locations project to reasonable pixel coordinates', () => {
    // London: ~51.5N, ~-0.1W
    const londonX = lngToX(-0.1, W)
    const londonY = latToY(51.5, W, H)
    expect(londonX).toBeCloseTo(W / 2, 0) // near center horizontally
    expect(londonY).toBeLessThan(H / 2) // in upper half

    // Sydney: ~-33.9S, ~151.2E
    const sydneyX = lngToX(151.2, W)
    const sydneyY = latToY(-33.9, W, H)
    expect(sydneyX).toBeGreaterThan(W * 0.8) // far right
    expect(sydneyY).toBeGreaterThan(H / 2) // in lower half
  })
})
