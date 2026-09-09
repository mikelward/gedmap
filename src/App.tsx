import { useState, useCallback, useRef } from 'react'
import UploadScreen from './components/UploadScreen'
import PersonPicker from './components/PersonPicker'
import LoadingScreen from './components/LoadingScreen'
import MapView from './components/MapView'
import { parseGedcomFile, collectAncestorsForRoot, collectAll } from './utils/parseGedcom'
import { geocodeAncestors } from './utils/geocode'
import type { GeocodedAncestor, ParsedGedcom, UnmappedAncestors } from './types'

type AppState = 'upload' | 'pick' | 'loading' | 'map'

function App() {
  const [state, setState] = useState<AppState>('upload')
  const [ancestors, setAncestors] = useState<GeocodedAncestor[]>([])
  const [geocodeProgress, setGeocodeProgress] = useState({ done: 0, total: 0 })
  const [unmapped, setUnmapped] = useState<UnmappedAncestors>({ noPlace: [], geocodeFailed: [], geocodeUnavailable: [] })
  const [error, setError] = useState<string | null>(null)

  // Parsed file data, kept so the user can switch anchor person
  const parsedRef = useRef<ParsedGedcom | null>(null)

  const loadAncestors = useCallback(async (rootId: string | undefined) => {
    const { individuals } = parsedRef.current!
    const { withPlace, noPlace } = collectAncestorsForRoot(individuals, rootId)

    if (withPlace.length === 0 && noPlace.length === 0) {
      setError('No ancestors found for this person.')
      setState('pick')
      return
    }

    setError(null)
    setState('loading')
    setGeocodeProgress({ done: 0, total: withPlace.length })

    const { geocoded, geocodeFailed, geocodeUnavailable, unavailableReason } = await geocodeAncestors(withPlace, (done) => {
      setGeocodeProgress((prev) => ({ ...prev, done }))
    })

    setAncestors(geocoded)
    setUnmapped({ noPlace, geocodeFailed, geocodeUnavailable, unavailableReason })
    setState('map')
  }, [])

  const handleFileUpload = useCallback(async (file: File) => {
    try {
      const text = await file.text()
      const parsed = parseGedcomFile(text)
      parsedRef.current = parsed

      if (parsed.allPeople.length === 0) {
        setError('No people found in this file.')
        return
      }

      // Go straight to picker
      setError(null)
      setState('pick')
    } catch (err) {
      console.error('Failed to process GEDCOM file:', err)
      setError('Failed to process file. Please check it is a valid GEDCOM file.')
      setState('upload')
    }
  }, [])

  const handlePickPerson = useCallback(async (rootId: string) => {
    try {
      await loadAncestors(rootId)
    } catch (err) {
      console.error('Failed to load ancestors:', err)
      setError('Failed to load ancestors.')
      setState('pick')
    }
  }, [loadAncestors])

  const handleViewAs = useCallback(() => {
    setState('pick')
  }, [])

  const handleViewAll = useCallback(async () => {
    try {
      const { individuals } = parsedRef.current!
      const { withPlace, noPlace } = collectAll(individuals)

      if (withPlace.length === 0 && noPlace.length === 0) {
        return
      }

      setState('loading')
      setGeocodeProgress({ done: 0, total: withPlace.length })

      const { geocoded, geocodeFailed, geocodeUnavailable, unavailableReason } = await geocodeAncestors(withPlace, (done) => {
        setGeocodeProgress((prev) => ({ ...prev, done }))
      })

      setAncestors(geocoded)
      setUnmapped({ noPlace, geocodeFailed, geocodeUnavailable, unavailableReason })
      setState('map')
    } catch (err) {
      console.error('Failed to load all people:', err)
      setState('map')
    }
  }, [])

  if (state === 'upload') {
    return <UploadScreen onFileUpload={handleFileUpload} appError={error} />
  }

  if (state === 'pick') {
    const { allPeople, defaultRootId } = parsedRef.current!
    return (
      <PersonPicker
        allPeople={allPeople}
        defaultRootId={defaultRootId}
        onSelect={handlePickPerson}
        appError={error}
      />
    )
  }

  if (state === 'loading') {
    return (
      <LoadingScreen
        done={geocodeProgress.done}
        total={geocodeProgress.total}
      />
    )
  }

  return (
    <MapView
      ancestors={ancestors}
      unmapped={unmapped}
      onViewAs={handleViewAs}
      onViewAll={handleViewAll}
    />
  )
}

export default App
