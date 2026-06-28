import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ExportGuide from './ExportGuide'
import { PROVIDERS } from './exportGuideData'

describe('ExportGuide', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<ExportGuide open={false} onClose={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a section for every supported provider when open', () => {
    render(<ExportGuide open={true} onClose={() => {}} />)
    for (const provider of PROVIDERS) {
      expect(screen.getByText(provider.name)).toBeInTheDocument()
    }
  })

  it('covers the major sites', () => {
    const names = PROVIDERS.map((p) => p.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'Ancestry',
        'MyHeritage',
        'FamilySearch',
        'Geni',
        'Findmypast',
      ])
    )
  })

  it('shows the export steps for each provider', () => {
    render(<ExportGuide open={true} onClose={() => {}} />)
    // Steps render in the DOM even inside collapsed <details>.
    expect(screen.getByText(/Click Trees in the top menu/)).toBeInTheDocument()
    expect(screen.getByText(/Export to GEDCOM in the Actions column/)).toBeInTheDocument()
  })

  it('links to each provider official help page', () => {
    render(<ExportGuide open={true} onClose={() => {}} />)
    const links = screen.getAllByRole('link')
    expect(links.length).toBe(PROVIDERS.length)
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    }
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(<ExportGuide open={true} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn()
    render(<ExportGuide open={true} onClose={onClose} />)
    fireEvent.click(screen.getByRole('dialog').parentElement)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close when clicking inside the dialog', () => {
    const onClose = vi.fn()
    render(<ExportGuide open={true} onClose={onClose} />)
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on Escape key', () => {
    const onClose = vi.fn()
    render(<ExportGuide open={true} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('moves focus into the dialog when opened', () => {
    render(<ExportGuide open={true} onClose={() => {}} />)
    expect(document.activeElement).toBe(screen.getByRole('dialog'))
  })

  it('restores focus to the trigger when closed', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    const { rerender } = render(<ExportGuide open={true} onClose={() => {}} />)
    expect(document.activeElement).not.toBe(trigger)

    rerender(<ExportGuide open={false} onClose={() => {}} />)
    expect(document.activeElement).toBe(trigger)

    document.body.removeChild(trigger)
  })

  it('traps Tab focus within the dialog', () => {
    render(<ExportGuide open={true} onClose={() => {}} />)
    const dialog = screen.getByRole('dialog')
    // With every <details> collapsed, the reachable elements are the close
    // button and each provider's <summary>; the help links are hidden.
    const closeButton = screen.getByLabelText('Close')
    const summaries = dialog.querySelectorAll('summary')
    const lastSummary = summaries[summaries.length - 1]

    lastSummary.focus()
    expect(document.activeElement).toBe(lastSummary)

    // Tab from the last reachable element wraps back to the first (close button).
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(closeButton)
  })

  it('wraps Shift+Tab from the dialog back to the last reachable element', () => {
    render(<ExportGuide open={true} onClose={() => {}} />)
    const dialog = screen.getByRole('dialog')
    const summaries = dialog.querySelectorAll('summary')
    const lastSummary = summaries[summaries.length - 1]

    // Focus starts on the dialog itself; Shift+Tab should jump to the last item.
    expect(document.activeElement).toBe(dialog)
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(lastSummary)
  })
})
