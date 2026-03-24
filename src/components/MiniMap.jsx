import { useRef, useEffect, useCallback, useState } from 'react'

const DESKTOP_W = 160
const DESKTOP_H = 100
const MOBILE_COLLAPSED_W = 64
const MOBILE_COLLAPSED_H = 40
const MOBILE_EXPANDED_W = 200
const MOBILE_EXPANDED_H = 125
const DOT_R = 2.5
const DOT_R_SMALL = 1.5
const BG = '#1a1a2e'
const DOT_COLOR = '#f59e0b'
const VIEWPORT_COLOR = 'rgba(255,255,255,0.5)'

// Mercator projection helpers (parameterized by canvas size)
function lngToX(lng, w) {
  return ((lng + 180) / 360) * w
}
function latToY(lat, w, h) {
  const latRad = (lat * Math.PI) / 180
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2))
  return h / 2 - (w * mercN) / (2 * Math.PI)
}
function xToLng(x, w) {
  return (x / w) * 360 - 180
}
function yToLat(y, w, h) {
  const mercN = ((h / 2 - y) * 2 * Math.PI) / w
  return (Math.atan(Math.sinh(mercN)) * 180) / Math.PI
}

export default function MiniMap({ ancestors, mapRef, isMobile }) {
  const canvasRef = useRef(null)
  const [viewport, setViewport] = useState(null)
  const [expanded, setExpanded] = useState(false)

  const w = isMobile ? (expanded ? MOBILE_EXPANDED_W : MOBILE_COLLAPSED_W) : DESKTOP_W
  const h = isMobile ? (expanded ? MOBILE_EXPANDED_H : MOBILE_COLLAPSED_H) : DESKTOP_H
  const dotR = isMobile && !expanded ? DOT_R_SMALL : DOT_R

  // Update viewport rectangle when main map moves
  useEffect(() => {
    const wrapper = mapRef.current
    if (!wrapper) return
    const map = wrapper.getMap ? wrapper.getMap() : wrapper

    const update = () => {
      const bounds = map.getBounds()
      if (!bounds) return
      setViewport({
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast(),
        south: bounds.getSouth(),
      })
    }

    map.on('moveend', update)
    map.on('load', update)
    if (map.loaded()) update()

    return () => {
      map.off('moveend', update)
      map.off('load', update)
    }
  }, [mapRef])

  // Draw on canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)

    // Background
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, w, h)

    // Dots
    ctx.fillStyle = DOT_COLOR
    for (const a of ancestors) {
      const x = lngToX(a.lng, w)
      const y = latToY(a.lat, w, h)
      ctx.beginPath()
      ctx.arc(x, y, dotR, 0, Math.PI * 2)
      ctx.fill()
    }

    // Viewport rectangle
    if (viewport) {
      ctx.strokeStyle = VIEWPORT_COLOR
      ctx.lineWidth = isMobile && !expanded ? 1 : 1.5
      const x1 = lngToX(viewport.west, w)
      const y1 = latToY(viewport.north, w, h)
      const x2 = lngToX(viewport.east, w)
      const y2 = latToY(viewport.south, w, h)
      const rx = Math.min(x1, x2)
      const ry = Math.min(y1, y2)
      ctx.strokeRect(rx, ry, Math.abs(x2 - x1), Math.abs(y2 - y1))
    }
  }, [ancestors, viewport, w, h, dotR, isMobile, expanded])

  const handleClick = useCallback(
    (e) => {
      // On mobile collapsed, just expand
      if (isMobile && !expanded) {
        setExpanded(true)
        return
      }

      const wrapper = mapRef.current
      if (!wrapper) return
      const map = wrapper.getMap ? wrapper.getMap() : wrapper
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const lng = xToLng(x, w)
      const lat = yToLat(y, w, h)
      map.flyTo({ center: [lng, lat], zoom: 5, duration: 1200 })

      // Collapse after navigating on mobile
      if (isMobile) setExpanded(false)
    },
    [mapRef, isMobile, expanded, w, h]
  )

  // Collapse when tapping outside (mobile expanded)
  useEffect(() => {
    if (!isMobile || !expanded) return
    const handleOutside = (e) => {
      if (canvasRef.current && !canvasRef.current.contains(e.target)) {
        setExpanded(false)
      }
    }
    document.addEventListener('pointerdown', handleOutside)
    return () => document.removeEventListener('pointerdown', handleOutside)
  }, [isMobile, expanded])

  if (ancestors.length === 0) return null

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      style={{
        position: 'absolute',
        bottom: isMobile ? 16 : 24,
        right: 12,
        width: w,
        height: h,
        borderRadius: isMobile && !expanded ? 6 : 8,
        border: '1px solid rgba(255,255,255,0.2)',
        cursor: isMobile && !expanded ? 'pointer' : 'crosshair',
        zIndex: 10,
        transition: 'width 0.2s ease, height 0.2s ease',
      }}
    />
  )
}
