import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ComponentProps } from 'react'
import UploadScreen from './UploadScreen'
import { ThemeProvider } from '../ThemeContext'

function renderUpload(props: Partial<ComponentProps<typeof UploadScreen>> = {}) {
  return render(
    <ThemeProvider>
      <UploadScreen onFileUpload={() => {}} appError={null} {...props} />
    </ThemeProvider>
  )
}

describe('UploadScreen file selection', () => {
  it('has no accept restriction on the file input', () => {
    // Regression test: a restrictive `accept` (even the permissive-looking
    // "*/*") is enough of a hint for some mobile browsers to default the
    // native picker to Photos instead of Files, with no way to steer that
    // from the page — see the "Fix file upload defaulting to photos-only on
    // mobile" commit this repo already shipped once. handleFile() validates
    // the .ged/.gedcom extension after selection instead.
    const { container } = renderUpload()
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
    expect(input.hasAttribute('accept')).toBe(false)
  })

  it('clears the input value so the same file can be selected again', () => {
    // Browsers skip the change event when the same file is re-selected unless
    // the input's value is reset. jsdom never populates a file input's value,
    // so stub it to observe the reset.
    const onFileUpload = vi.fn()
    const { container } = renderUpload({ onFileUpload })
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!

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
