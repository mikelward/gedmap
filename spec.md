# AncestryAtlas — Implementation Spec

## Overview

Client-side React app. Upload a GEDCOM file, see direct ancestors' birthplaces on a Mapbox map. No backend, no auth, no database.

**Domain:** ancestryatlas.app
**Deploy:** Vercel (auto-deploy on push)

---

## Tech Stack

| Concern | Choice | Why |
|---------|--------|-----|
| Framework | React 19 + Vite 8 | Fast dev/build, modern defaults |
| Map | Mapbox GL JS 3.x + react-map-gl 8.x | Best clustering support, dark styles |
| GEDCOM parsing | Custom parser | `parse-gedcom` npm crashes on CONC/CONT lines with pointer values |
| Styling | Tailwind CSS 4.x (@tailwindcss/vite plugin) | Utility-first, no separate CSS files |
| Bottom sheet | vaul 1.x | Native-feeling iOS/Android drawer |
| Geocoding | HERE Geocoding API | Handles historical place names well |

---

## File Structure

```
src/
├── App.jsx                    # State machine: upload → loading → map
├── main.jsx                   # React 19 createRoot bootstrap
├── index.css                  # Tailwind + mapbox-gl CSS imports
├── components/
│   ├── UploadScreen.jsx       # Landing page, drag & drop file upload
│   ├── LoadingScreen.jsx      # Geocoding progress bar
│   ├── MapView.jsx            # Mapbox map, clustering, click handlers
│   ├── AncestorSheet.jsx      # Bottom sheet (mobile) / popup (desktop)
│   ├── AncestorSidebar.jsx    # Searchable ancestor list panel
│   └── StatsOverlay.jsx       # "X ancestors across Y countries"
└── utils/
    ├── parseGedcom.js         # GEDCOM tokenizer, tree builder, ancestor filter
    └── geocode.js             # HERE geocoding with in-memory cache
```

---

## App State Machine

Three states, linear flow:

```
upload → loading → map
  ↑                  │
  └──── reset ───────┘
```

- **upload**: Show `UploadScreen`. On file selected, parse GEDCOM synchronously, then transition to loading.
- **loading**: Show `LoadingScreen` with progress. Geocode each ancestor sequentially, updating count.
- **map**: Show `MapView` with all geocoded ancestors. Reset button returns to upload.

Error handling: try/catch around parse + geocode. On failure, show error message on upload screen.

---

## GEDCOM Parsing

### Why Custom Parser

The `parse-gedcom` npm package throws `"Cannot concatenate a pointer"` when CONC/CONT continuation lines contain pointer-like values (`@...@`). Common in Ancestry.com exports. Replaced with a ~170-line custom parser.

### Tokenization

Each GEDCOM line has the format: `LEVEL [XREF] TAG [VALUE]`

```
0 @I123@ INDI              → level=0, xref=@I123@, tag=INDI
1 NAME John /Smith/         → level=1, tag=NAME, value="John /Smith/"
1 FAMC @F45@                → level=1, tag=FAMC, pointer=@F45@
```

Regex: `^(\d+)\s+(@[^@]+@\s+)?(\S+)\s?(.*)$`

Pointer values (matching `^@[^@]+@$`) are stored separately from string values.

### Tree Building

Stack-based: maintain a stack of nodes indexed by level. Each new node is added as a child of `stack[level]`.

**CONC/CONT handling:** These tags append to the *parent* node's value (not a sibling). CONT adds a newline; CONC concatenates directly.

### Root Person Selection

Use the **first INDI record** in the file. Ancestry, MyHeritage, and FamilySearch all export the "home person" first. No explicit marker exists in the GEDCOM spec.

### Ancestor Collection

BFS traversal up through `parentIds`, starting from root person. Collects up to 4 generations:

- Gen 0: root person (1)
- Gen 1: parents (up to 2)
- Gen 2: grandparents (up to 4)
- Gen 3: great-grandparents (up to 8)
- Gen 4: great-great-grandparents (up to 16)
- **Max ~31 people**

Only ancestors with a `birthPlace` are included in the final output. Parent/child references are filtered to only include people within the collected set.

### Extracted Fields

| Field | GEDCOM path | Notes |
|-------|-------------|-------|
| name | INDI > NAME | Slashes removed (GEDCOM wraps surname in //) |
| birthDate | INDI > BIRT > DATE | Months title-cased (JUL → Jul) |
| birthPlace | INDI > BIRT > PLAC | Required for inclusion |
| deathDate | INDI > DEAT > DATE | Optional, months title-cased |
| deathPlace | INDI > DEAT > PLAC | Optional |
| photo | INDI > OBJE > FILE | Optional, rarely present |
| parentIds | Resolved via FAM > HUSB/WIFE where INDI > FAMC matches | |
| childIds | Resolved via FAM > CHIL where INDI > FAMS matches | |

---

## Geocoding

### API

HERE Geocoding API forward endpoint:
```
GET https://geocode.search.hereapi.com/v1/geocode?q={place}&apiKey={key}&limit=5
```

### Caching

In-memory `Map` keyed by place string. Caches both hits (coordinates + country) and misses (null). No TTL, lives for the session.

### Country Extraction

Priority order:
1. `feature.properties.context.country.name` from geocoding response
2. Last comma-separated segment of the place string
3. `"Unknown"`

### Broad Result Fallback

GEDCOM place strings are hierarchical (e.g. "New Tiers, Mount Lofty, South Australia, Australia"). The geocoder often doesn't know the most local part and returns a broad region centroid instead.

Strategy: try all query variations (full string, then dropping the most-local part each time). Rank results by `feature_type` specificity and pick the most specific one:

```
address(0) > street(1) > neighborhood(2) > locality(3) > place(4) > district(6) > region(7) > country(8)
```

Stop early if we get a result with specificity <= 3 (locality or better).

Example for "New Tiers, Mount Lofty, South Australia, Australia":
1. Try "New Tiers, Mount Lofty, South Australia, Australia" → returns region (specificity 7)
2. Try "Mount Lofty, South Australia, Australia" → returns locality (specificity 3) — better, use this
3. Stop (specificity <= 3).

### Processing

Sequential (one at a time), not parallel. Simpler and enables smooth progress updates. With ~30 max ancestors and cached duplicates, total time is acceptable.

### Unmapped Ancestors

Two reasons an ancestor may not appear on the map:
1. **No birth place in GEDCOM** — detected during parsing, reason: "No birth place in file"
2. **Geocoding failed** — has a place string but the geocoder couldn't resolve it, reason: `Could not locate "place name"`

Both are tracked with full ancestor data. The stats overlay shows "X not mapped ▼" — expanding it reveals two grouped lists:

- **No birth place in file** — names of ancestors with no PLAC under BIRT
- **Location not found** — names + the place string that failed geocoding

Each name is clickable (amber link), opening the ancestor's detail card (bottom sheet on mobile, popup on desktop) so you can see their full info.

---

## Map View

### Style

`mapbox://styles/mapbox/dark-v11` — dark heritage feel.

### Clustering

Mapbox GL built-in GeoJSON clustering:
- `cluster: true` on the Source
- `clusterMaxZoom: 6` (clusters break apart early so users don't have to zoom much)
- `clusterRadius: 30` (tight grouping — only truly nearby points cluster)

### Co-located Points

Multiple ancestors born in the same place share identical coordinates and would permanently cluster. To fix this, co-located points are stacked vertically with ~0.03° (~3km) spacing, centered on the original coordinate. This keeps them visually grouped while ensuring dots don't overlap at typical zoom levels.

Four layers:
1. **clusters** — amber circles, size 20→30→40px based on point count
2. **cluster-count** — text labels showing abbreviated count
3. **unclustered-point** — amber circles (8px) with white stroke
4. **unclustered-label** — name labels positioned to the right of the dot. Uses text halo for readability on dark map. `text-allow-overlap: true` ensures all labels in a stack are visible.

### Click Handling

Priority order:
1. Cluster click → `getClusterExpansionZoom()` (promise-based) → `easeTo` that zoom level
2. Point click → select ancestor, show detail, `flyTo` with 1.5s animation
3. Empty area → deselect

### Initial Bounds

Calculated bounding box of all ancestor coordinates with 2-degree padding. Falls back to `[0, 30] zoom 2` if no ancestors.

### Import Note

react-map-gl v8 changed exports. Must import from `react-map-gl/mapbox`, not `react-map-gl`. The Map component is imported as `MapGL` to avoid shadowing JavaScript's `Map` constructor. Ancestor lookups use `globalThis.Map`.

---

## Ancestor Sidebar

Left-side panel (280px wide) listing all ancestors — both mapped and unmapped.

### Features
- **Search/filter box** at top — filters by name, birth place, or birth date as you type
- **Grouped by generation** — sticky headers: Self, Parents, Grandparents, Great-grandparents, Great-great-grandparents
- **Clickable names** — mapped ancestors fly the map to their pin + open detail card; unmapped ancestors just open the detail card
- **Selected state** — currently selected ancestor is highlighted
- **Unmapped indicators** — "No birth place" or "Not found" shown in gray next to unmapped names
- **Collapsible** — X button hides the panel, hamburger button re-opens it
- **Footer** — shows "X of Y ancestors" count (reflects search filter)

---

## Ancestor Detail

### Responsive Behavior

| Viewport | Component | Behavior |
|----------|-----------|----------|
| < 768px | `MobileSheet` (vaul Drawer) | Slides up from bottom, draggable, max 85vh |
| >= 768px | `DesktopPopup` | Floating card positioned above click point |

Detection: `window.matchMedia('(max-width: 767px)')` with change listener.

### Content

Shared `AncestorDetail` component renders:
1. Photo (if available, circular crop)
2. Name (prominent)
3. Born: date + place
4. Died: date + place (if available)
5. Parents (tappable, navigates map)
6. Children (tappable, navigates map)

Tapping a parent/child calls `onNavigate(id)` → `flyTo` their pin + select them.

All tap targets: `min-h-[44px]` for mobile accessibility.

---

## Styling

- Dark theme throughout (gray-950 backgrounds, white/gray text, amber accents)
- Tailwind utility classes, no custom CSS files beyond index.css
- Mapbox GL CSS imported in index.css
- Vaul overlay opacity overridden to `rgba(0, 0, 0, 0.4)`
- `html, body, #root` set to 100% height for fullscreen app

---

## Environment Variables

```
VITE_MAPBOX_TOKEN=<public token>
VITE_HERE_API_KEY=<HERE API key>
```

Mapbox public tokens are safe to expose client-side. HERE requires a free account at developer.here.com (250k requests/month free tier). Both are set in `.env.local` (gitignored via `*.local` pattern). HERE is the geocoder — it handles historical place names well (e.g. "Ganth, Fejer, Austria-Hungary" → Gánt, Hungary).

---

## Known Limitations

- Root person detection assumes first INDI is the home person (works for Ancestry/MyHeritage/FamilySearch exports)
- Sequential geocoding (not parallelized)
- No offline/persistence — re-upload required each session
- Photos from GEDCOM OBJE > FILE are URLs that may not resolve (depend on source app)
- 4-generation depth is hardcoded (post-MVP: add slider)
