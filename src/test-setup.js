import '@testing-library/jest-dom/vitest'

// setupFiles runs for every test file, including ones that opt into the node
// environment with `// @vitest-environment node` (the repo-config guards at the
// root do). Those have no `window`, so touching it unconditionally here failed
// the whole file before a single test ran.
if (typeof window !== 'undefined') {
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
}
