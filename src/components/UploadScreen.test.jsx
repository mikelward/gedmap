import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import UploadScreen from './UploadScreen'
import { ThemeProvider } from '../ThemeContext'

function renderUpload(props = {}) {
  return render(
    <ThemeProvider>
      <UploadScreen onFileUpload={() => {}} {...props} />
    </ThemeProvider>
  )
}

describe('UploadScreen file selection', () => {
  it('clears the input value so the same file can be selected again', () => {
    // Browsers skip the change event when the same file is re-selected unless
    // the input's value is reset. jsdom never populates a file input's value,
    // so stub it to observe the reset.
    const onFileUpload = vi.fn()
    const { container } = renderUpload({ onFileUpload })
    const input = container.querySelector('input[type="file"]')

    let value = 'C:\\fakepath\\family.ged'
    Object.defineProperty(input, 'value', {
      get: () => value,
      set: (v) => {
        value = v
      },
      configurable: true,
    })

    const file = new File(['0 HEAD'], 'family.ged', { type: 'text/plain' })
    fireEvent.change(input, { target: { files: [file] } })

    expect(onFileUpload).toHaveBeenCalledWith(file)
    expect(input.value).toBe('')
  })
})

describe('UploadScreen export guide', () => {
  it('does not show the export guide by default', () => {
    renderUpload()
    expect(
      screen.queryByText('How to export a GEDCOM file')
    ).not.toBeInTheDocument()
  })

  it('opens the export guide when the help link is clicked', () => {
    renderUpload()
    fireEvent.click(screen.getByText('How do I export a GEDCOM file?'))
    expect(screen.getByText('How to export a GEDCOM file')).toBeInTheDocument()
    expect(screen.getByText('Ancestry')).toBeInTheDocument()
  })

  it('closes the export guide again', () => {
    renderUpload()
    fireEvent.click(screen.getByText('How do I export a GEDCOM file?'))
    fireEvent.click(screen.getByLabelText('Close'))
    expect(
      screen.queryByText('How to export a GEDCOM file')
    ).not.toBeInTheDocument()
  })
})
