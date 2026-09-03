import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AncestorSidebar from './AncestorSidebar'
import { makeAncestorEntry, makeGeocodedAncestor } from '../testFixtures'
import type { ComponentProps } from 'react'

const ANCESTORS = [
  makeGeocodedAncestor({ id: '1', name: 'Root Person', generation: 0, relationship: null, birthPlace: 'Sydney', lat: -33.8, lng: 151.2, country: 'Australia' }),
  makeGeocodedAncestor({ id: '2', name: 'Father Test', generation: 1, relationship: 'Father', birthPlace: 'Melbourne', lat: -37.8, lng: 144.9, country: 'Australia' }),
  makeGeocodedAncestor({ id: '3', name: 'Mother Test', generation: 1, relationship: 'Mother', birthPlace: 'Brisbane', lat: -27.4, lng: 153.0, country: 'Australia' }),
  makeGeocodedAncestor({ id: '4', name: 'Grandfather', generation: 2, relationship: 'Paternal Grandfather', birthPlace: 'Perth', lat: -31.9, lng: 115.8, country: 'Australia' }),
]

const UNMAPPED = {
  noPlace: [makeAncestorEntry({ id: '5', name: 'No Place Person', generation: 2 })],
  geocodeFailed: [makeAncestorEntry({ id: '6', name: 'Failed Person', generation: 2, birthPlace: 'Nowhere' })],
  geocodeUnavailable: [],
}

function renderSidebar(props: Partial<ComponentProps<typeof AncestorSidebar>> = {}) {
  return render(
    <AncestorSidebar
      ancestors={ANCESTORS}
      unmapped={UNMAPPED}
      onSelect={() => {}}
      selectedId={undefined}
      open={true}
      onOpenChange={() => {}}
      onViewAs={() => {}}
      onViewAll={() => {}}
      {...props}
    />
  )
}

describe('AncestorSidebar', () => {
  it('renders all ancestors grouped by generation', () => {
    renderSidebar()
    expect(screen.getByText('Self')).toBeInTheDocument()
    expect(screen.getByText('Parents')).toBeInTheDocument()
    expect(screen.getByText('Grandparents')).toBeInTheDocument()
    expect(screen.getByText('Root Person')).toBeInTheDocument()
    expect(screen.getByText('Father Test')).toBeInTheDocument()
    expect(screen.getByText('Grandfather')).toBeInTheDocument()
  })

  it('shows total count including unmapped', () => {
    renderSidebar()
    const counts = screen.getAllByText(/6 of 6 people/)
    expect(counts.length).toBeGreaterThanOrEqual(1)
  })

  it('includes unmapped people with reason labels', () => {
    renderSidebar()
    expect(screen.getByText('No Place Person')).toBeInTheDocument()
    expect(screen.getByText('No birth place')).toBeInTheDocument()
    expect(screen.getByText('Failed Person')).toBeInTheDocument()
    expect(screen.getByText('Not found')).toBeInTheDocument()
  })

  it('filters by name', () => {
    renderSidebar()
    const input = screen.getByPlaceholderText('Search ancestors...')
    fireEvent.change(input, { target: { value: 'father' } })

    expect(screen.getByText('Father Test')).toBeInTheDocument()
    expect(screen.getByText('Grandfather')).toBeInTheDocument()
    expect(screen.queryByText('Root Person')).not.toBeInTheDocument()
    expect(screen.queryByText('Mother Test')).not.toBeInTheDocument()
  })

  it('filters by birth place', () => {
    renderSidebar()
    const input = screen.getByPlaceholderText('Search ancestors...')
    fireEvent.change(input, { target: { value: 'perth' } })

    expect(screen.getByText('Grandfather')).toBeInTheDocument()
    expect(screen.queryByText('Root Person')).not.toBeInTheDocument()
  })

  it('shows "No matches" when search matches nothing', () => {
    renderSidebar()
    const input = screen.getByPlaceholderText('Search ancestors...')
    fireEvent.change(input, { target: { value: 'zzzzz' } })

    expect(screen.getByText('No matches')).toBeInTheDocument()
  })

  it('calls onSelect when clicking an ancestor', () => {
    const handler = vi.fn()
    renderSidebar({ onSelect: handler })

    fireEvent.click(screen.getByText('Father Test'))
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ id: '2', name: 'Father Test' })
    )
  })

  it('shows relationship labels', () => {
    renderSidebar()
    expect(screen.getByText('Father')).toBeInTheDocument()
    expect(screen.getByText('Mother')).toBeInTheDocument()
    expect(screen.getByText('Paternal Grandfather')).toBeInTheDocument()
  })

  it('shows hamburger button when closed', () => {
    renderSidebar({ open: false })
    expect(screen.getByTitle('Show ancestor list')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Search ancestors...')).not.toBeInTheDocument()
  })

  it('calls onOpenChange when hamburger is clicked', () => {
    const handler = vi.fn()
    renderSidebar({ open: false, onOpenChange: handler })

    fireEvent.click(screen.getByTitle('Show ancestor list'))
    expect(handler).toHaveBeenCalledWith(true)
  })

  it('does not label generation-less people (View all mode) as Self', () => {
    renderSidebar({
      ancestors: [
        makeGeocodedAncestor({ id: '1', name: 'Someone', generation: null, relationship: null, birthPlace: 'Sydney', lat: -33.8, lng: 151.2, country: 'Australia' }),
        makeGeocodedAncestor({ id: '2', name: 'Someone Else', generation: null, relationship: null, birthPlace: 'Perth', lat: -31.9, lng: 115.8, country: 'Australia' }),
      ],
      unmapped: { noPlace: [], geocodeFailed: [], geocodeUnavailable: [] },
    })
    expect(screen.queryByText('Self')).not.toBeInTheDocument()
    expect(screen.getByText('Someone')).toBeInTheDocument()
    expect(screen.getByText('Someone Else')).toBeInTheDocument()
  })

  it('renders View all and View as buttons', () => {
    renderSidebar()
    expect(screen.getByText('View all')).toBeInTheDocument()
    expect(screen.getByText(/View as/)).toBeInTheDocument()
  })

  it('calls onViewAll when View all is clicked', () => {
    const handler = vi.fn()
    renderSidebar({ onViewAll: handler })

    fireEvent.click(screen.getByText('View all'))
    expect(handler).toHaveBeenCalled()
  })

  // Before the three-way split these sat in geocodeFailed, so a sidebar built
  // from only two buckets drops them out of the list entirely.
  it('lists ancestors whose lookup never ran', () => {
    renderSidebar({
      unmapped: {
        ...UNMAPPED,
        geocodeUnavailable: [
          makeAncestorEntry({ id: '7', name: 'Unlooked Person', generation: 2, birthPlace: 'Somewhere' }),
        ],
      },
    })
    expect(screen.getByText('Unlooked Person')).toBeInTheDocument()
  })
})
