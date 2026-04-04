# GedMap

Client-side GEDCOM file analyzer that visualizes ancestor birthplaces on a Mapbox map.

## Tech Stack

- React 19, Vite 8, Tailwind CSS 4, Vitest
- Mapbox GL JS for map rendering
- HERE Geocoding API for place lookups

## Development

```sh
npm install
npm run dev        # Start dev server
npm run build      # Production build
npm run lint       # ESLint
```

## Testing

```sh
npm test              # Run all tests once
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with V8 coverage report
```

Tests use [Vitest](https://vitest.dev/) with jsdom for component tests. Test files
live next to their source files using the `*.test.{js,jsx}` convention.

### Test structure

- `src/utils/parseGedcom.test.js` — GEDCOM parser: tokenization, tree building, family links, relationship labels, ancestor collection
- `src/utils/geocode.test.js` — Geocoding: place splitting, feature ranking, progressive query shortening, concurrent ancestor geocoding
- `src/components/StatsOverlay.test.jsx` — Stats display: counts, unmapped sections
- `src/components/PersonPicker.test.jsx` — Person picker: rendering, search filtering, selection
- `src/components/AncestorSidebar.test.jsx` — Sidebar: generation grouping, search, open/close
- `src/components/MiniMap.test.jsx` — Mercator projection math
- `src/ThemeContext.test.jsx` — Theme toggling and persistence

### Writing tests

- Utility tests: import functions directly, use mock search functions for geocoding
- Component tests: use `@testing-library/react`, wrap with `<ThemeProvider>` if the component uses `useTheme()`
- The geocode tests set `import.meta.env.VITE_HERE_API_KEY` via `vi.hoisted()` and mock `fetch` to avoid real API calls
