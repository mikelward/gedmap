import { useRef, useState, useCallback, useMemo, useEffect } from 'react'
import MapGL, { Source, Layer } from 'react-map-gl/mapbox'
import StatsOverlay from './StatsOverlay'
import MiniMap from './MiniMap'
import AncestorSidebar from './AncestorSidebar'
import { MobileSheet, DesktopPopup } from './AncestorSheet'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

const clusterLayer = {
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

const clusterCountLayer = {
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
    'text-color': '#1f2937',
  },
}

const unclusteredPointLayer = {
  id: 'unclustered-point',
  type: 'circle',
  source: 'ancestors',
  filter: ['!', ['has', 'point_count']],
  paint: {
    'circle-color': '#f59e0b',
    'circle-radius': 8,
    'circle-stroke-width': 2,
    'circle-stroke-color': '#fff',
  },
}

const unclusteredLabelLayer = {
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
    'text-color': '#e5e7eb',
    'text-halo-color': 'rgba(0, 0, 0, 0.8)',
    'text-halo-width': 1.5,
  },
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.innerWidth < 768
  )

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const handler = (e) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return isMobile
}

export default function MapView({ ancestors, unmapped, onReset, onViewAs, onViewAll }) {
  const mapRef = useRef(null)
  const [selected, setSelected] = useState(null)
  const [popupPos, setPopupPos] = useState(null)
  const isMobile = useIsMobile()
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile)

  const ancestorLookup = useMemo(() => {
    const lookup = new globalThis.Map()
    ancestors.forEach((a) => lookup.set(a.id, a))
    return lookup
  }, [ancestors])

  const geojson = useMemo(() => {
    // Stack co-located points vertically so they don't overlap into
    // one dot. Points within ~1km are grouped together and spread
    // along the latitude axis with ~3km spacing — enough that dots
    // (20px diameter) don't visually overlap at typical zoom levels.
    const STEP_LAT = 0.03
    const coordKey = (a) => `${a.lng.toFixed(2)},${a.lat.toFixed(2)}`
    const groups = new globalThis.Map()
    for (const a of ancestors) {
      const key = coordKey(a)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(a)
    }

    const features = []
    for (const group of groups.values()) {
      // Center the stack so the midpoint is at the original location
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

  const initialView = useMemo(() => {
    if (ancestors.length === 0) return undefined
    // Center on the root person (generation 0) if they have coordinates
    const root = ancestors.find((a) => a.generation === 0)
    if (root) {
      return { center: { longitude: root.lng, latitude: root.lat, zoom: 5 } }
    }
    // Fallback: fit bounds around all ancestors
    const lngs = ancestors.map((a) => a.lng)
    const lats = ancestors.map((a) => a.lat)
    return {
      bounds: [
        [Math.min(...lngs) - 2, Math.min(...lats) - 2],
        [Math.max(...lngs) + 2, Math.max(...lats) + 2],
      ],
    }
  }, [ancestors])

  const flyTo = useCallback((lng, lat) => {
    const ref = mapRef.current
    if (!ref) return
    const map = ref.getMap ? ref.getMap() : ref
    map.flyTo({ center: [lng, lat], zoom: 8, duration: 1500 })
  }, [])

  const handleNavigate = useCallback(
    (id) => {
      const ancestor = ancestorLookup.get(id)
      if (!ancestor) return
      setSelected(ancestor)
      flyTo(ancestor.lng, ancestor.lat)
    },
    [ancestorLookup, flyTo]
  )

  const handleClick = useCallback(
    (e) => {
      const mapWrapper = mapRef.current
      if (!mapWrapper) return

      // Get the raw Mapbox GL map instance for direct API access
      const map = mapWrapper.getMap ? mapWrapper.getMap() : mapWrapper

      // Check for cluster clicks
      const clusterFeatures = map.queryRenderedFeatures(e.point, {
        layers: ['clusters'],
      })
      if (clusterFeatures.length > 0) {
        const clusterId = clusterFeatures[0].properties.cluster_id
        const source = map.getSource('ancestors')
        const result = source.getClusterExpansionZoom(clusterId)
        const handleZoom = (zoom) => {
          map.easeTo({
            center: clusterFeatures[0].geometry.coordinates,
            zoom,
          })
        }
        // Handle both promise-based and callback-based API
        if (result && typeof result.then === 'function') {
          result.then(handleZoom).catch(() => {})
        } else {
          source.getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (!err) handleZoom(zoom)
          })
        }
        return
      }

      // Check for point clicks
      const pointFeatures = map.queryRenderedFeatures(e.point, {
        layers: ['unclustered-point'],
      })
      if (pointFeatures.length > 0) {
        const id = pointFeatures[0].properties.id
        const ancestor = ancestorLookup.get(id)
        if (ancestor) {
          setSelected(ancestor)
          setPopupPos({ x: e.point.x, y: e.point.y })
          flyTo(ancestor.lng, ancestor.lat)
        }
        return
      }

      // Click on empty area
      setSelected(null)
    },
    [ancestorLookup, flyTo]
  )

  const handleSelectFromList = useCallback((ancestor) => {
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
        mapStyle="mapbox://styles/mapbox/dark-v11"
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
          <Layer {...clusterLayer} />
          <Layer {...clusterCountLayer} />
          <Layer {...unclusteredPointLayer} />
          <Layer {...unclusteredLabelLayer} />
        </Source>
      </MapGL>

      {!isMobile && <MiniMap ancestors={ancestors} mapRef={mapRef} />}

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
