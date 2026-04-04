import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import StatsOverlay from './StatsOverlay'

const ANCESTORS = [
  { id: '1', name: 'Alice', country: 'Australia' },
  { id: '2', name: 'Bob', country: 'Australia' },
  { id: '3', name: 'Carol', country: 'England' },
]

describe('StatsOverlay', () => {
  it('shows ancestor count and country count', () => {
    render(
      <StatsOverlay
        ancestors={ANCESTORS}
        unmapped={{ noPlace: [], geocodeFailed: [] }}
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
        ancestors={[{ id: '1', name: 'A', country: 'UK' }]}
        unmapped={{ noPlace: [], geocodeFailed: [] }}
        onSelectUnmapped={() => {}}
        sidebarOpen={false}
      />
    )
    expect(screen.getByText(/1 ancestor mapped/)).toBeInTheDocument()
    expect(screen.getByText(/1 country/)).toBeInTheDocument()
  })

  it('shows unmapped count and expands on click', () => {
    const noPlace = [{ id: '4', name: 'Dave' }]
    const geocodeFailed = [{ id: '5', name: 'Eve', birthPlace: 'Nowhere' }]

    render(
      <StatsOverlay
        ancestors={ANCESTORS}
        unmapped={{ noPlace, geocodeFailed }}
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
        unmapped={{ noPlace: [], geocodeFailed: [] }}
        onSelectUnmapped={() => {}}
        sidebarOpen={false}
      />
    )
    expect(screen.queryByText(/\d+ not mapped/)).not.toBeInTheDocument()
  })

  it('calls onSelectUnmapped when clicking an unmapped person', () => {
    const handler = vi.fn()
    const noPlace = [{ id: '4', name: 'Unique Dave' }]

    render(
      <StatsOverlay
        ancestors={ANCESTORS}
        unmapped={{ noPlace, geocodeFailed: [] }}
        onSelectUnmapped={handler}
        sidebarOpen={false}
      />
    )

    fireEvent.click(screen.getByText(/1 not mapped/))
    fireEvent.click(screen.getByText('Unique Dave'))
    expect(handler).toHaveBeenCalledWith(noPlace[0])
  })
})
