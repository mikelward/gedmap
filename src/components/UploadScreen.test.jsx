import { describe, it, expect } from 'vitest'
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
