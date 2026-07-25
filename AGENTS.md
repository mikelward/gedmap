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

## Workflow

Keep this file short and concrete — add a new rule the first time something
bites, not the third.

- **Always add tests.** Every new function, hook, or component needs at least
  one test that exercises its behavior. Bug fixes get a regression test that
  fails before the fix.
- **Always run tests before reporting a task done.** `npm test`, `npm run lint`,
  and `npm run build` (when touching build config) must pass.
- **Fix any preexisting test failures as the *first* commit of the series.**
  Don't stack new work on a red baseline. If the failure is genuinely
  unrelated and out of scope, say so up front and confirm before skipping it.
- **Don't paper over flaky/racy tests** with `sleep`, retry loops, or bumped
  timeouts. Make the ordering explicit (controlled promises, fake timers,
  `act(...)`) or fix the underlying race.
- **Don't disable a failing check** (lint, typecheck, test, hook) to make it
  pass — fix the underlying issue.
- **Call out cost and reliability up front** when recommending new
  infrastructure or external API calls (additional HERE/Mapbox calls,
  third-party APIs, etc.). Free-tier thresholds, rough $/month at expected
  traffic, new failure modes. If impact is effectively zero, say so.

## Asking questions

- **Ask in chat, never with `AskUserQuestion`.** That's Claude Code's
  multiple-choice question prompt, and it's broken in the Claude mobile app —
  a question asked through it may be unanswerable. Plain chat also keeps the
  question, its context, and the answer in one readable thread.
- **After asking, stop and wait for the answer.** Don't proceed on an assumed
  answer, pick a "recommended" option yourself, or keep working on the part
  the question affects.

## Branching

- **Workflow.** `claude/<short-topic>` branch off `origin/main` → PR → merge
  via rebase or squash. One topic per branch. Follow-up work after a merge
  goes on a new branch. Never commit to `main` / `master`.
- **Stacked PRs.** The lower PR (infra) targets `main`; the upper PR
  (feature) targets the lower PR's branch. When the lower PR merges, rebase
  the upper one onto `main`.
- **One commit per logical surviving change.** Rewrite unmerged commits
  freely (squash, amend, reorder, split). Review-fix noise shouldn't survive
  into `main`.
- `git push --force-with-lease` to your own live feature branch after a
  rebase is routine — don't ask. Confirm before destructive actions on
  shared/merged branches.
- **Merge cue (`merged` / `I merged` / `landed` / merge webhook) runs hygiene
  *before* engaging with the rest of the message:** `git fetch origin`, cut
  a fresh `claude/<short-topic>` branch off `origin/main`, announce the switch.
- End every reply with the open-PR link (or `.../compare/main...<branch>`
  until a PR exists). Never link to a closed or merged PR.

## Pull requests and reviews

- Open PRs ready for review (not draft) unless asked otherwise.
- When a feature has multiple open PRs in a stack, list **every** open PR
  on the feature by URL, one per line — the "View PR" chip sticks to the
  first link and hides the rest (anthropics/claude-code#46625).
- Watch the review for automated findings and comments, and proactively
  address them.
- Never leave a review comment thread silently dismissed. Either reply on
  the thread *or* resolve it. When you think a comment is a false positive,
  say *why* on the thread (one or two sentences). Acknowledgement noise
  is fine and preferred over silence.

## CI

- After pushing, **wait for CI** before claiming a change works in any
  environment you can't test locally. Webhooks deliver — don't poll.
- Report significant CI timing regressions (rule of thumb: >25% or >30s
  on a job under ~5min). Name the likely cause: heavy new dependency,
  slow new test, cache invalidation.
