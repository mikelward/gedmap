import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import App from './App'
import { geocodeAncestors } from './utils/geocode'

vi.mock('./utils/geocode', () => ({
  geocodeAncestors: vi.fn(),
}))

const mockedGeocodeAncestors = vi.mocked(geocodeAncestors)

// MapView pulls in mapbox-gl, which jsdom can't run — stub it with just
// the "View as…" action the tests need.
vi.mock('./components/MapView', () => ({
  default: ({ onViewAs }: { onViewAs: () => void }) => <button onClick={onViewAs}>Back to picker</button>,
}))

const GEDCOM = `0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
1 BIRT
2 PLAC London, England
0 TRLR
`

function uploadGedcom(container: HTMLElement) {
  const file = new File([GEDCOM], 'family.ged', { type: 'text/plain' })
  file.text = () => Promise.resolve(GEDCOM)
  const input = container.querySelector('input[type="file"]')!
  fireEvent.change(input, { target: { files: [file] } })
}

describe('App', () => {
  beforeEach(() => {
    mockedGeocodeAncestors.mockReset()
  })

  it('walks upload → pick → map', async () => {
    mockedGeocodeAncestors.mockResolvedValue({ geocoded: [], geocodeFailed: [] })
    const { container } = render(<App />)

    uploadGedcom(container)
    expect(await screen.findByText('Choose a starting person')).toBeInTheDocument()

    fireEvent.click(screen.getByText('John Smith'))
    expect(await screen.findByText('Back to picker')).toBeInTheDocument()
  })

  it('shows an error when loading ancestors fails', async () => {
    mockedGeocodeAncestors.mockRejectedValue(new Error('network down'))
    const { container } = render(<App />)

    uploadGedcom(container)
    fireEvent.click(await screen.findByText('John Smith'))

    expect(await screen.findByText('Failed to load ancestors.')).toBeInTheDocument()
  })

  it('does not show a stale error in the picker after a successful retry', async () => {
    mockedGeocodeAncestors
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValue({ geocoded: [], geocodeFailed: [] })
    const { container } = render(<App />)

    uploadGedcom(container)
    fireEvent.click(await screen.findByText('John Smith'))
    expect(await screen.findByText('Failed to load ancestors.')).toBeInTheDocument()

    // Retry succeeds → map view
    fireEvent.click(screen.getByText('John Smith'))
    fireEvent.click(await screen.findByText('Back to picker'))

    expect(await screen.findByText('Choose a starting person')).toBeInTheDocument()
    expect(screen.queryByText('Failed to load ancestors.')).not.toBeInTheDocument()
  })
})
