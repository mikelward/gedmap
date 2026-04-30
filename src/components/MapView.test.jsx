import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MapView from './MapView'
import { ThemeProvider } from '../ThemeContext'

// Mock react-map-gl/mapbox — we only care about the React tree, not actual WebGL
vi.mock('react-map-gl/mapbox', () => ({
  default: vi.fn(({ children }) => <div data-testid="mapbox">{children}</div>),
  Source: vi.fn(({ children }) => <div>{children}</div>),
  Layer: vi.fn(() => null),
}))

// Mock vaul Drawer (used by MobileSheet)
vi.mock('vaul', () => ({
  Drawer: {
    Root: ({ children, open }) => <div>{open ? children : null}</div>,
    Portal: ({ children }) => <div>{children}</div>,
    Overlay: () => null,
    Content: ({ children }) => <div>{children}</div>,
  },
}))

// Mock MiniMap — uses canvas which jsdom doesn't fully support
vi.mock('./MiniMap', () => ({ default: () => null }))

const UNMAPPED_PARENT = {
  id: 'unmapped-1',
  name: 'Unmapped Parent',
  generation: 1,
  relationship: 'Father',
  birthPlace: null,
  birthDate: null,
  deathDate: null,
  deathPlace: null,
  photo: null,
  parents: [],
  children: [{ id: 'root-1', name: 'Root Person' }],
}

const ROOT_ANCESTOR = {
  id: 'root-1',
  name: 'Root Person',
  generation: 0,
  relationship: null,
  birthPlace: 'Sydney, Australia',
  birthDate: '1 Jan 2000',
  deathDate: null,
  deathPlace: null,
  photo: null,
  lat: -33.87,
  lng: 151.21,
  country: 'Australia',
  parents: [{ id: 'unmapped-1', name: 'Unmapped Parent' }],
  children: [],
}

function renderMapView(props = {}) {
  return render(
    <ThemeProvider>
      <MapView
        ancestors={[ROOT_ANCESTOR]}
        unmapped={{ noPlace: [UNMAPPED_PARENT], geocodeFailed: [] }}
        onReset={() => {}}
        onViewAs={() => {}}
        onViewAll={() => {}}
        {...props}
      />
    </ThemeProvider>
  )
}

describe('MapView', () => {
  it('shows the sidebar close button when sidebar is open', () => {
    renderMapView()
    // In jsdom window.innerWidth is 1024 (desktop), sidebar starts open
    expect(screen.getByTitle('Hide list')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search ancestors...')).toBeInTheDocument()
  })

  it('shows the hamburger button when sidebar is closed', () => {
    renderMapView()
    fireEvent.click(screen.getByTitle('Hide list'))
    expect(screen.getByTitle('Show ancestor list')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Search ancestors...')).not.toBeInTheDocument()
  })

  it('shows ancestor details when selected from sidebar', () => {
    renderMapView()
    fireEvent.click(screen.getByText('Root Person'))

    // Detail popup should show the selected ancestor's name as a heading
    expect(screen.getAllByText('Root Person').some((el) => el.tagName === 'H2')).toBe(true)
    expect(screen.getByText(/1 Jan 2000/)).toBeInTheDocument()
  })

  it('navigates to an unmapped ancestor when clicking a parent link', () => {
    renderMapView()
    // Select the geocoded root ancestor from the sidebar
    fireEvent.click(screen.getByText('Root Person'))

    // The detail popup shows "Unmapped Parent" as a parent link button
    const parentLinks = screen.getAllByText('Unmapped Parent')
    expect(parentLinks.length).toBeGreaterThanOrEqual(1)

    // Click the parent link — triggers handleNavigate('unmapped-1')
    fireEvent.click(parentLinks[0])

    // The popup should now show the unmapped parent as h2 heading
    const headings = screen.getAllByText('Unmapped Parent')
    expect(headings.some((el) => el.tagName === 'H2')).toBe(true)
  })
})
