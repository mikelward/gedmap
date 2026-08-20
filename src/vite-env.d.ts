/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Not readonly: geocode.test.ts sets VITE_HERE_API_KEY at test time via
  // vi.hoisted() so hereSearch doesn't short-circuit.
  VITE_HERE_API_KEY?: string
  VITE_MAPBOX_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
