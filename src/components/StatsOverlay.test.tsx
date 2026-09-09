import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import StatsOverlay from './StatsOverlay'
import { makeAncestorEntry, makeGeocodedAncestor } from '../testFixtures'

const ANCESTORS = [
  makeGeocodedAncestor({ id: '1', name: 'Alice', lat: 0, lng: 0, country: 'Australia' }),
  makeGeocodedAncestor({ id: '2', name: 'Bob', lat: 0, lng: 0, country: 'Australia' }),
  makeGeocodedAncestor({ id: '3', name: 'Carol', lat: 0, lng: 0, country: 'England' }),
]

describe('StatsOverlay', () => {
  it('shows ancestor count and country count', () => {
    render(
      <StatsOverlay
        ancestors={ANCESTORS}
        unmapped={{ noPlace: [], geocodeFailed: [], geocodeUnavailable: [] }}
        onSelectUnmapped={() => {}}
        sidebarOpen={false}
      />
    )
    expect(screen.getByText(/3 ancestors mapped/)).toBeInTheDocument()
    expect(screen.getByText(/2 countries/)).toBeInTheDocument()
  })

  it('uses singular for 1 ancestor / 1 country', () => {
    render(
      <StatsOverlay
        ancestors={[makeGeocodedAncestor({ id: '1', name: 'A', lat: 0, lng: 0, country: 'UK' })]}
        unmapped={{ noPlace: [], geocodeFailed: [], geocodeUnavailable: [] }}
        onSelectUnmapped={() => {}}
        sidebarOpen={false}
      />
    )
    expect(screen.getByText(/1 ancestor mapped/)).toBeInTheDocument()
    expect(screen.getByText(/1 country/)).toBeInTheDocument()
  })

  it('shows unmapped count and expands on click', () => {
    const noPlace = [makeAncestorEntry({ id: '4', name: 'Dave' })]
    const geocodeFailed = [makeAncestorEntry({ id: '5', name: 'Eve', birthPlace: 'Nowhere' })]

    render(
      <StatsOverlay
        ancestors={ANCESTORS}
        unmapped={{ noPlace, geocodeFailed, geocodeUnavailable: [] }}
        onSelectUnmapped={() => {}}
        sidebarOpen={false}
      />
    )

    const toggle = screen.getByText(/2 not mapped/)
    expect(toggle).toBeInTheDocument()

    fireEvent.click(toggle)
    expect(screen.getByText('No birth place in file')).toBeInTheDocument()
    expect(screen.getByText('Dave')).toBeInTheDocument()
    expect(screen.getByText('Location not found')).toBeInTheDocument()
    expect(screen.getByText('Eve')).toBeInTheDocument()
    expect(screen.getByText('Nowhere')).toBeInTheDocument()
  })

  it('does not show unmapped section when all mapped', () => {
    render(
      <StatsOverlay
        ancestors={ANCESTORS}
        unmapped={{ noPlace: [], geocodeFailed: [], geocodeUnavailable: [] }}
        onSelectUnmapped={() => {}}
        sidebarOpen={false}
      />
    )
    expect(screen.queryByText(/\d+ not mapped/)).not.toBeInTheDocument()
  })

  it('calls onSelectUnmapped when clicking an unmapped person', () => {
    const handler = vi.fn()
    const noPlace = [makeAncestorEntry({ id: '4', name: 'Unique Dave' })]

    render(
      <StatsOverlay
        ancestors={ANCESTORS}
        unmapped={{ noPlace, geocodeFailed: [], geocodeUnavailable: [] }}
        onSelectUnmapped={handler}
        sidebarOpen={false}
      />
    )

    fireEvent.click(screen.getByText(/1 not mapped/))
    fireEvent.click(screen.getByText('Unique Dave'))
    expect(handler).toHaveBeenCalledWith(noPlace[0])
  })

  // A rate-limited run must not read as a file full of missing places — the
  // whole point of the third bucket is that these ancestors WOULD map later.
  it('names the reason when the geocoder was unavailable', () => {
    const geocodeUnavailable = [
      makeAncestorEntry({ id: '9', name: 'Unlooked Person', birthPlace: 'Somewhere' }),
    ]
    render(
      <StatsOverlay
        ancestors={ANCESTORS}
        unmapped={{ noPlace: [], geocodeFailed: [], geocodeUnavailable, unavailableReason: 'quota' }}
        onSelectUnmapped={() => {}}
        sidebarOpen={false}
      />
    )

    expect(screen.getByText(/Lookup limit reached/)).toBeInTheDocument()
    fireEvent.click(screen.getByText(/1 not mapped/))
    expect(screen.getByText('Not looked up')).toBeInTheDocument()
    expect(screen.getByText('Unlooked Person')).toBeInTheDocument()
  })

  it('says nothing about availability when every lookup ran', () => {
    render(
      <StatsOverlay
        ancestors={ANCESTORS}
        unmapped={{ noPlace: [], geocodeFailed: [], geocodeUnavailable: [] }}
        onSelectUnmapped={() => {}}
        sidebarOpen={false}
      />
    )
    expect(screen.queryByText(/Lookup limit reached/)).not.toBeInTheDocument()
  })
})
