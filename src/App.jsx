import { useState, useCallback, useRef } from 'react'
import UploadScreen from './components/UploadScreen'
import PersonPicker from './components/PersonPicker'
import LoadingScreen from './components/LoadingScreen'
import MapView from './components/MapView'
import { parseGedcomFile, collectAncestorsForRoot, collectAll } from './utils/parseGedcom'
import { geocodeAncestors } from './utils/geocode'

function App() {
  const [state, setState] = useState('upload') // upload | pick | loading | map
  const [ancestors, setAncestors] = useState([])
  const [geocodeProgress, setGeocodeProgress] = useState({ done: 0, total: 0 })
  const [unmapped, setUnmapped] = useState({ noPlace: [], geocodeFailed: [] })
  const [error, setError] = useState(null)

  // Parsed file data, kept so the user can switch anchor person
  const parsedRef = useRef(null)

  const loadAncestors = useCallback(async (rootId) => {
    const { individuals } = parsedRef.current
    const { withPlace, noPlace } = collectAncestorsForRoot(individuals, rootId)

    if (withPlace.length === 0 && noPlace.length === 0) {
      setError('No ancestors found for this person.')
      setState('pick')
      return
    }

    setError(null)
    setState('loading')
    setGeocodeProgress({ done: 0, total: withPlace.length })

    const { geocoded, geocodeFailed } = await geocodeAncestors(withPlace, (done) => {
      setGeocodeProgress((prev) => ({ ...prev, done }))
    })

    setAncestors(geocoded)
    setUnmapped({ noPlace, geocodeFailed })
    setState('map')
  }, [])

  const handleFileUpload = useCallback(async (file) => {
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

  const handlePickPerson = useCallback(async (rootId) => {
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
      const { individuals } = parsedRef.current
      const { withPlace, noPlace } = collectAll(individuals)

      if (withPlace.length === 0 && noPlace.length === 0) {
        return
      }

      setState('loading')
      setGeocodeProgress({ done: 0, total: withPlace.length })

      const { geocoded, geocodeFailed } = await geocodeAncestors(withPlace, (done) => {
        setGeocodeProgress((prev) => ({ ...prev, done }))
      })

      setAncestors(geocoded)
      setUnmapped({ noPlace, geocodeFailed })
      setState('map')
    } catch (err) {
      console.error('Failed to load all people:', err)
      setState('map')
    }
  }, [])

  const handleReset = useCallback(() => {
    setState('upload')
    setAncestors([])
    setGeocodeProgress({ done: 0, total: 0 })
    setUnmapped({ noPlace: [], geocodeFailed: [] })
    setError(null)
    parsedRef.current = null
  }, [])

  if (state === 'upload') {
    return <UploadScreen onFileUpload={handleFileUpload} appError={error} />
  }

  if (state === 'pick') {
    const { allPeople, defaultRootId } = parsedRef.current
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
      onReset={handleReset}
      onViewAs={handleViewAs}
      onViewAll={handleViewAll}
    />
  )
}

export default App
