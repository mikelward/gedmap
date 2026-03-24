import { useRef, useEffect, useCallback, useState } from 'react'

const MINIMAP_W = 160
const MINIMAP_H = 100
const DOT_R = 2.5
const BG = '#1a1a2e'
const DOT_COLOR = '#f59e0b'
const VIEWPORT_COLOR = 'rgba(255,255,255,0.5)'

// Mercator projection helpers
function lngToX(lng) {
  return ((lng + 180) / 360) * MINIMAP_W
}
function latToY(lat) {
  const latRad = (lat * Math.PI) / 180
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2))
  return (MINIMAP_H / 2) - (MINIMAP_W * mercN) / (2 * Math.PI)
}
function xToLng(x) {
  return (x / MINIMAP_W) * 360 - 180
}
function yToLat(y) {
  const mercN = ((MINIMAP_H / 2 - y) * 2 * Math.PI) / MINIMAP_W
  return (Math.atan(Math.sinh(mercN)) * 180) / Math.PI
}

export default function MiniMap({ ancestors, mapRef }) {
  const canvasRef = useRef(null)
  const [viewport, setViewport] = useState(null)

  // Update viewport rectangle when main map moves
  useEffect(() => {
    const wrapper = mapRef.current
    if (!wrapper) return
    const map = wrapper.getMap ? wrapper.getMap() : wrapper

    const update = () => {
      const bounds = map.getBounds()
      if (!bounds) return
      setViewport({
        x1: lngToX(bounds.getWest()),
        y1: latToY(bounds.getNorth()),
        x2: lngToX(bounds.getEast()),
        y2: latToY(bounds.getSouth()),
      })
    }

    map.on('moveend', update)
    map.on('load', update)
    // Initial update in case map is already loaded
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
    canvas.width = MINIMAP_W * dpr
    canvas.height = MINIMAP_H * dpr
    ctx.scale(dpr, dpr)

    // Background
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, MINIMAP_W, MINIMAP_H)

    // Dots
    ctx.fillStyle = DOT_COLOR
    for (const a of ancestors) {
      const x = lngToX(a.lng)
      const y = latToY(a.lat)
      ctx.beginPath()
      ctx.arc(x, y, DOT_R, 0, Math.PI * 2)
      ctx.fill()
    }

    // Viewport rectangle
    if (viewport) {
      ctx.strokeStyle = VIEWPORT_COLOR
      ctx.lineWidth = 1.5
      const x = Math.min(viewport.x1, viewport.x2)
      const y = Math.min(viewport.y1, viewport.y2)
      const w = Math.abs(viewport.x2 - viewport.x1)
      const h = Math.abs(viewport.y2 - viewport.y1)
      ctx.strokeRect(x, y, w, h)
    }
  }, [ancestors, viewport])

  // Click to navigate
  const handleClick = useCallback(
    (e) => {
      const wrapper = mapRef.current
      if (!wrapper) return
      const map = wrapper.getMap ? wrapper.getMap() : wrapper
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const lng = xToLng(x)
      const lat = yToLat(y)
      map.flyTo({ center: [lng, lat], zoom: 5, duration: 1200 })
    },
    [mapRef]
  )

  if (ancestors.length === 0) return null

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      style={{
        position: 'absolute',
        bottom: 24,
        right: 12,
        width: MINIMAP_W,
        height: MINIMAP_H,
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.2)',
        cursor: 'crosshair',
        zIndex: 10,
      }}
    />
  )
}
