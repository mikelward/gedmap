import { useState } from 'react'
import type { AncestorEntry, GeocodedAncestor, UnmappedAncestors } from '../types'
import type { GeocoderUnavailableReason } from '../utils/geocode'

// Why the geocoder went quiet, in the user's terms. Each says whether the
// ancestors below would map on a later run — that's the whole difference
// between this bucket and the two permanent ones.
const UNAVAILABLE_NOTE: Record<GeocoderUnavailableReason, string> = {
  quota: 'Lookup limit reached \u2014 try again later.',
  'rate-limited': 'Too many lookups at once \u2014 try again shortly.',
  auth: 'Geocoder key rejected.',
  network: "Couldn't reach the geocoder \u2014 try again later.",
  unconfigured: 'No geocoder key configured.',
}

interface StatsOverlayProps {
  ancestors: GeocodedAncestor[]
  unmapped: UnmappedAncestors
  onSelectUnmapped: (ancestor: AncestorEntry) => void
  sidebarOpen: boolean
}

export default function StatsOverlay({ ancestors, unmapped, onSelectUnmapped, sidebarOpen }: StatsOverlayProps) {
  const [showUnmapped, setShowUnmapped] = useState(false)
  const countries = new Set(ancestors.map((a) => a.country))
  const { noPlace = [], geocodeFailed = [], geocodeUnavailable = [], unavailableReason } = unmapped
  const totalUnmapped = noPlace.length + geocodeFailed.length + geocodeUnavailable.length

  return (
    <div className={`absolute top-4 right-4 z-10 flex items-start justify-between pointer-events-none transition-[left] duration-300 ${sidebarOpen ? 'left-[304px]' : 'left-16'}`}>
      <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm rounded-xl px-4 py-3 pointer-events-auto max-w-sm">
        <p className="text-gray-900 dark:text-white text-sm font-medium">
          {ancestors.length} ancestor{ancestors.length !== 1 ? 's' : ''} mapped
          across {countries.size} countr{countries.size !== 1 ? 'ies' : 'y'}
        </p>
        {totalUnmapped > 0 && (
          <>
            <button
              onClick={() => setShowUnmapped(!showUnmapped)}
              className="text-gray-500 dark:text-gray-400 text-xs mt-1 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              {totalUnmapped} not mapped {showUnmapped ? '▲' : '▼'}
            </button>
            {geocodeUnavailable.length > 0 && (
              <p className="text-xs mt-1 text-amber-600 dark:text-amber-400">
                {UNAVAILABLE_NOTE[unavailableReason ?? 'network']}
              </p>
            )}
            {showUnmapped && (
              <div className="mt-2 max-h-48 overflow-y-auto space-y-3">
                {geocodeUnavailable.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                      Not looked up
                    </h4>
                    <ul className="space-y-0.5">
                      {geocodeUnavailable.map((a) => (
                        <li key={a.id}>
                          <button
                            onClick={() => onSelectUnmapped(a)}
                            className="text-xs text-amber-500 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 transition-colors text-left"
                          >
                            {a.name}
                          </button>
                          <span className="text-[10px] text-gray-400 dark:text-gray-600 ml-1">
                            {a.birthPlace}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {noPlace.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                      No birth place in file
                    </h4>
                    <ul className="space-y-0.5">
                      {noPlace.map((a) => (
                        <li key={a.id}>
                          <button
                            onClick={() => onSelectUnmapped(a)}
                            className="text-xs text-amber-500 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 transition-colors text-left"
                          >
                            {a.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {geocodeFailed.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                      Location not found
                    </h4>
                    <ul className="space-y-0.5">
                      {geocodeFailed.map((a) => (
                        <li key={a.id}>
                          <button
                            onClick={() => onSelectUnmapped(a)}
                            className="text-xs text-amber-500 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 transition-colors text-left"
                          >
                            {a.name}
                          </button>
                          <span className="text-[10px] text-gray-400 dark:text-gray-600 ml-1">
                            {a.birthPlace}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
