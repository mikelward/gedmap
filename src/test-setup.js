import '@testing-library/jest-dom/vitest'

// Mock window.matchMedia for jsdom (used by ThemeContext)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query) => ({
    matches: query === '(prefers-color-scheme: dark)',
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
})
