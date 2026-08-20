import { useRef, useState, useCallback, useMemo, useEffect } from 'react'
import MapGL, { Source, Layer, type MapRef, type LayerProps } from 'react-map-gl/mapbox'
import type { MapLayerMouseEvent } from 'mapbox-gl'
import StatsOverlay from './StatsOverlay'
import MiniMap from './MiniMap'
import AncestorSidebar from './AncestorSidebar'
import { MobileSheet, DesktopPopup } from './AncestorSheet'
import { useTheme } from '../ThemeContext'
import type { GeocodedAncestor, MaybeGeocoded, UnmappedAncestors } from '../types'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

function makeLayers(isDark: boolean) {
  const clusterLayer: LayerProps = {
    id: 'clusters',
    type: 'circle',
    source: 'ancestors',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': '#f59e0b',
      'circle-radius': ['step', ['get', 'point_count'], 20, 5, 30, 10, 40],
      'circle-opacity': 0.8,
    },
  }

  const clusterCountLayer: LayerProps = {
    id: 'cluster-count',
    type: 'symbol',
    source: 'ancestors',
    filter: ['has', 'point_count'],
    layout: {
      'text-field': '{point_count_abbreviated}',
      'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
      'text-size': 14,
    },
    paint: {
      'text-color': isDark ? '#1f2937' : '#1f2937',
    },
  }

  const unclusteredPointLayer: LayerProps = {
    id: 'unclustered-point',
    type: 'circle',
    source: 'ancestors',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': '#f59e0b',
      'circle-radius': 8,
      'circle-stroke-width': 2,
      'circle-stroke-color': isDark ? '#fff' : '#fff',
    },
  }

  const unclusteredLabelLayer: LayerProps = {
    id: 'unclustered-label',
    type: 'symbol',
    source: 'ancestors',
    filter: ['!', ['has', 'point_count']],
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Regular'],
      'text-size': 12,
      'text-anchor': 'left',
      'text-offset': [1.2, 0],
      'text-allow-overlap': true,
      'text-optional': true,
      'text-max-width': 12,
    },
    paint: {
      'text-color': isDark ? '#e5e7eb' : '#1f2937',
      'text-halo-color': isDark ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.8)',
      'text-halo-width': 1.5,
    },
  }

  return { clusterLayer, clusterCountLayer, unclusteredPointLayer, unclusteredLabelLayer }
}

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.innerWidth < 768
  )

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return isMobile
}

interface AncestorFeature {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: { id: string; name: string }
}

interface AncestorFeatureCollection {
  type: 'FeatureCollection'
  features: AncestorFeature[]
}

interface InitialView {
  center?: { longitude: number; latitude: number; zoom: number }
  bounds?: [[number, number], [number, number]]
}

interface PopupPosition {
  x: number
  y: number
}

interface MapViewProps {
  ancestors: GeocodedAncestor[]
  unmapped: UnmappedAncestors
  onViewAs: () => void
  onViewAll: () => void
}

export default function MapView({ ancestors, unmapped, onViewAs, onViewAll }: MapViewProps) {
  const mapRef = useRef<MapRef | null>(null)
  const [selected, setSelected] = useState<MaybeGeocoded | null>(null)
  const [popupPos, setPopupPos] = useState<PopupPosition | null>(null)
  const isMobile = useIsMobile()
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile)
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  const mapStyle = isDark
    ? 'mapbox://styles/mapbox/dark-v11'
    : 'mapbox://styles/mapbox/light-v11'

  const layers = useMemo(() => makeLayers(isDark), [isDark])

  const ancestorLookup = useMemo(() => {
    const lookup = new Map<string, MaybeGeocoded>()
    ancestors.forEach((a) => lookup.set(a.id, a))
    const { noPlace = [], geocodeFailed = [] } = unmapped
    for (const a of [...noPlace, ...geocodeFailed]) {
      lookup.set(a.id, a)
    }
    return lookup
  }, [ancestors, unmapped])

  const geojson = useMemo<AncestorFeatureCollection>(() => {
    const STEP_LAT = 0.03
    const coordKey = (a: GeocodedAncestor) => `${a.lng.toFixed(2)},${a.lat.toFixed(2)}`
    const groups = new Map<string, GeocodedAncestor[]>()
    for (const a of ancestors) {
      const key = coordKey(a)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(a)
    }

    const features: AncestorFeature[] = []
    for (const group of groups.values()) {
      const offsetStart = -((group.length - 1) / 2) * STEP_LAT
      group.forEach((a, i) => {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [a.lng, a.lat + offsetStart + i * STEP_LAT],
          },
          properties: { id: a.id, name: a.name },
        })
      })
    }

    return { type: 'FeatureCollection', features }
  }, [ancestors])

  const initialView = useMemo<InitialView | undefined>(() => {
    if (ancestors.length === 0) return undefined
    const root = ancestors.find((a) => a.generation === 0)
    if (root) {
      return { center: { longitude: root.lng, latitude: root.lat, zoom: 5 } }
    }
    const lngs = ancestors.map((a) => a.lng)
    const lats = ancestors.map((a) => a.lat)
    return {
      bounds: [
        [Math.min(...lngs) - 2, Math.min(...lats) - 2],
        [Math.max(...lngs) + 2, Math.max(...lats) + 2],
      ],
    }
  }, [ancestors])

  const flyTo = useCallback((lng: number, lat: number) => {
    const ref = mapRef.current
    if (!ref) return
    const map = ref.getMap ? ref.getMap() : ref
    map.flyTo({ center: [lng, lat], zoom: 8, duration: 1500 })
  }, [])

  const handleNavigate = useCallback(
    (id: string) => {
      const ancestor = ancestorLookup.get(id)
      if (!ancestor) return
      setSelected(ancestor)
      if (ancestor.lat != null && ancestor.lng != null) {
        flyTo(ancestor.lng, ancestor.lat)
      }
    },
    [ancestorLookup, flyTo]
  )

  const handleClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const mapWrapper = mapRef.current
      if (!mapWrapper) return

      const map = mapWrapper.getMap ? mapWrapper.getMap() : mapWrapper

      const clusterFeatures = map.queryRenderedFeatures(e.point, {
        layers: ['clusters'],
      })
      if (clusterFeatures.length > 0) {
        const clusterId = clusterFeatures[0].properties?.cluster_id
        const source = map.getSource('ancestors')
        if (!source || !('getClusterExpansionZoom' in source)) return
        source.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err || zoom == null) return
          map.easeTo({
            center: (clusterFeatures[0].geometry as GeoJSON.Point).coordinates as [number, number],
            zoom,
          })
        })
        return
      }

      const pointFeatures = map.queryRenderedFeatures(e.point, {
        layers: ['unclustered-point'],
      })
      if (pointFeatures.length > 0) {
        const id = pointFeatures[0].properties?.id
        const ancestor = id != null ? ancestorLookup.get(id) : undefined
        if (ancestor && ancestor.lat != null && ancestor.lng != null) {
          setSelected(ancestor)
          setPopupPos({ x: e.point.x, y: e.point.y })
          flyTo(ancestor.lng, ancestor.lat)
        }
        return
      }

      setSelected(null)
    },
    [ancestorLookup, flyTo]
  )

  const handleSelectFromList = useCallback((ancestor: MaybeGeocoded) => {
    setSelected(ancestor)
    if (ancestor.lat != null && ancestor.lng != null) {
      setPopupPos(null)
      flyTo(ancestor.lng, ancestor.lat)
    } else {
      setPopupPos(null)
    }
  }, [flyTo])

  const handleClose = useCallback(() => setSelected(null), [])

  return (
    <div className="w-full h-screen relative">
      <StatsOverlay
        ancestors={ancestors}
        unmapped={unmapped}
        onSelectUnmapped={handleSelectFromList}
        sidebarOpen={sidebarOpen}
      />

      <AncestorSidebar
        ancestors={ancestors}
        unmapped={unmapped}
        onSelect={handleSelectFromList}
        selectedId={selected?.id}
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
        onViewAs={onViewAs}
        onViewAll={onViewAll}
      />

      {/* Theme toggle – top-right corner */}
      <button
        onClick={toggleTheme}
        className={`absolute z-20 p-2.5 rounded-xl bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm
                   text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors
                   border border-gray-200 dark:border-gray-700
                   top-4 right-4`}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {isDark ? (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
          </svg>
        )}
      </button>

      <MapGL
        ref={mapRef}
        initialViewState={
          initialView?.center
            ? initialView.center
            : initialView?.bounds
              ? { bounds: initialView.bounds, fitBoundsOptions: { padding: 60 } }
              : { longitude: 0, latitude: 30, zoom: 2 }
        }
        style={{ width: '100%', height: '100%' }}
        mapStyle={mapStyle}
        mapboxAccessToken={MAPBOX_TOKEN}
        onClick={handleClick}
        interactiveLayerIds={['clusters', 'unclustered-point']}
        cursor="pointer"
      >
        <Source
          id="ancestors"
          type="geojson"
          data={geojson}
          cluster={true}
          clusterMaxZoom={6}
          clusterRadius={30}
        >
          <Layer {...layers.clusterLayer} />
          <Layer {...layers.clusterCountLayer} />
          <Layer {...layers.unclusteredPointLayer} />
          <Layer {...layers.unclusteredLabelLayer} />
        </Source>
      </MapGL>

      <MiniMap ancestors={ancestors} mapRef={mapRef} isMobile={isMobile} />

      {isMobile ? (
        <MobileSheet
          ancestor={selected}
          open={!!selected}
          onClose={handleClose}
          onNavigate={handleNavigate}
        />
      ) : (
        <DesktopPopup
          ancestor={selected}
          position={popupPos}
          onClose={handleClose}
          onNavigate={handleNavigate}
        />
      )}
    </div>
  )
}
