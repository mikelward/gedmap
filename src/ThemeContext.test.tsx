import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeProvider, useTheme } from './ThemeContext'

function ThemeDisplay() {
  const { theme, toggleTheme } = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button onClick={toggleTheme}>Toggle</button>
    </div>
  )
}

describe('ThemeContext', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  it('defaults to dark when no stored preference and system prefers dark', () => {
    // jsdom doesn't support matchMedia by default, falls through to 'dark'
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>
    )
    expect(screen.getByTestId('theme').textContent).toBe('dark')
  })

  it('uses stored theme from localStorage', () => {
    localStorage.setItem('theme', 'light')
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>
    )
    expect(screen.getByTestId('theme').textContent).toBe('light')
  })

  it('toggles between dark and light', () => {
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>
    )

    expect(screen.getByTestId('theme').textContent).toBe('dark')

    fireEvent.click(screen.getByText('Toggle'))
    expect(screen.getByTestId('theme').textContent).toBe('light')

    fireEvent.click(screen.getByText('Toggle'))
    expect(screen.getByTestId('theme').textContent).toBe('dark')
  })

  it('persists theme to localStorage', () => {
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>
    )

    fireEvent.click(screen.getByText('Toggle'))
    expect(localStorage.getItem('theme')).toBe('light')
  })

  it('adds dark class to document element', () => {
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>
    )

    expect(document.documentElement.classList.contains('dark')).toBe(true)

    fireEvent.click(screen.getByText('Toggle'))
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
