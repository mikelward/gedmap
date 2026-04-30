import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PersonPicker from './PersonPicker'
import { ThemeProvider } from '../ThemeContext'

const PEOPLE = [
  { id: '@I1@', name: 'John Smith', birthDate: '10 Jul 1882', birthPlace: 'London, England' },
  { id: '@I2@', name: 'Jane Doe', birthDate: '15 Dec 1885', birthPlace: 'Bristol, England' },
  { id: '@I3@', name: 'James Brown', birthDate: null, birthPlace: null },
]

function renderPicker(props = {}) {
  return render(
    <ThemeProvider>
      <PersonPicker
        allPeople={PEOPLE}
        defaultRootId="@I1@"
        onSelect={() => {}}
        {...props}
      />
    </ThemeProvider>
  )
}

describe('PersonPicker', () => {
  it('renders all people', () => {
    renderPicker()
    expect(screen.getByText('John Smith')).toBeInTheDocument()
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    expect(screen.getByText('James Brown')).toBeInTheDocument()
  })

  it('shows people count', () => {
    renderPicker()
    expect(screen.getByText(/3 people in file/)).toBeInTheDocument()
  })

  it('marks the default root person', () => {
    renderPicker()
    expect(screen.getByText('Default')).toBeInTheDocument()
  })

  it('filters by name', () => {
    renderPicker()
    const input = screen.getByPlaceholderText('Search by name or place...')
    fireEvent.change(input, { target: { value: 'jane' } })

    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    expect(screen.queryByText('John Smith')).not.toBeInTheDocument()
    expect(screen.queryByText('James Brown')).not.toBeInTheDocument()
    expect(screen.getByText(/1 of 3 people shown/)).toBeInTheDocument()
  })

  it('filters by birth place', () => {
    renderPicker()
    const input = screen.getByPlaceholderText('Search by name or place...')
    fireEvent.change(input, { target: { value: 'bristol' } })

    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    expect(screen.queryByText('John Smith')).not.toBeInTheDocument()
  })

  it('shows "No matches" when search matches nothing', () => {
    renderPicker()
    const input = screen.getByPlaceholderText('Search by name or place...')
    fireEvent.change(input, { target: { value: 'zzzzz' } })

    expect(screen.getByText('No matches')).toBeInTheDocument()
  })

  it('calls onSelect with person id when clicked', () => {
    const handler = vi.fn()
    renderPicker({ onSelect: handler })

    fireEvent.click(screen.getByText('Jane Doe'))
    expect(handler).toHaveBeenCalledWith('@I2@')
  })

  it('shows "No details" for person without dates or place', () => {
    renderPicker()
    expect(screen.getByText('No details')).toBeInTheDocument()
  })

  it('displays appError when provided', () => {
    renderPicker({ appError: 'No ancestors found for this person.' })
    expect(screen.getByText('No ancestors found for this person.')).toBeInTheDocument()
  })

  it('does not render error paragraph when appError is not provided', () => {
    renderPicker()
    expect(screen.queryByText('No ancestors found for this person.')).not.toBeInTheDocument()
  })
})
