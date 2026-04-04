import { useState, useMemo } from 'react'

const GEN_LABELS = [
  'Self',
  'Parents',
  'Grandparents',
  'Great-grandparents',
  'Great-great-grandparents',
]

export default function AncestorSidebar({ ancestors, unmapped, onSelect, selectedId, open, onOpenChange, onViewAs, onViewAll }) {
  const [search, setSearch] = useState('')
  const setOpen = onOpenChange

  const { noPlace = [], geocodeFailed = [] } = unmapped
  const allAncestors = useMemo(() => {
    const mapped = ancestors.map((a) => ({ ...a, _mapped: true }))
    const notMapped = [
      ...noPlace.map((a) => ({ ...a, _mapped: false, _reason: 'No birth place' })),
      ...geocodeFailed.map((a) => ({ ...a, _mapped: false, _reason: 'Not found' })),
    ]
    return [...mapped, ...notMapped]
  }, [ancestors, noPlace, geocodeFailed])

  const filtered = useMemo(() => {
    if (!search.trim()) return allAncestors
    const q = search.toLowerCase()
    return allAncestors.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.birthPlace?.toLowerCase().includes(q) ||
        a.birthDate?.toLowerCase().includes(q)
    )
  }, [allAncestors, search])

  // Group by generation
  const grouped = useMemo(() => {
    const groups = new globalThis.Map()
    for (const a of filtered) {
      const gen = a.generation ?? 0
      if (!groups.has(gen)) groups.set(gen, [])
      groups.get(gen).push(a)
    }
    return Array.from(groups.entries()).sort((a, b) => a[0] - b[0])
  }, [filtered])

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute top-4 left-4 z-20 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm
                   rounded-xl px-3 py-3 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        title="Show ancestor list"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>
    )
  }

  return (
    <div className="absolute top-0 left-0 bottom-0 z-20 w-72 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm
                    border-r border-gray-200 dark:border-gray-800 flex flex-col">
      <div className="p-3 border-b border-gray-200 dark:border-gray-800 flex gap-2">
        <div className="flex-1 relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Search ancestors..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white text-sm rounded-lg pl-8 pr-3 py-2
                       placeholder-gray-400 dark:placeholder-gray-500 border border-gray-300 dark:border-gray-700 focus:border-amber-400
                       focus:outline-none transition-colors"
          />
        </div>
        <button
          onClick={() => setOpen(false)}
          className="text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors px-1"
          title="Hide list"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {(onViewAll || onViewAs) && (
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800 flex gap-2">
          {onViewAll && (
            <button
              onClick={onViewAll}
              className="flex-1 text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white bg-gray-100 dark:bg-gray-800
                         hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg py-1.5 transition-colors"
            >
              View all
            </button>
          )}
          {onViewAs && (
            <button
              onClick={onViewAs}
              className="flex-1 text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white bg-gray-100 dark:bg-gray-800
                         hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg py-1.5 transition-colors"
            >
              View as…
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {grouped.length === 0 && (
          <p className="text-gray-500 text-sm p-4 text-center">No matches</p>
        )}
        {grouped.map(([gen, people]) => (
          <div key={gen}>
            <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider
                           px-3 pt-3 pb-1 sticky top-0 bg-white/95 dark:bg-gray-900/95">
              {GEN_LABELS[gen] || `Generation ${gen}`}
            </h3>
            {people.map((a) => (
              <button
                key={a.id}
                onClick={() => onSelect(a)}
                className={`w-full text-left px-3 py-2 text-sm transition-colors
                  hover:bg-gray-100/60 dark:hover:bg-gray-800/60 flex items-center justify-between gap-2
                  ${selectedId === a.id ? 'bg-gray-100/80 dark:bg-gray-800/80 text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}
              >
                <div className="min-w-0">
                  <div className="truncate">{a.name}</div>
                  {a.relationship && (
                    <div className="text-[11px] text-amber-500/60 dark:text-amber-400/60 truncate">{a.relationship}</div>
                  )}
                  {a.birthPlace && (
                    <div className="text-[11px] text-gray-500 truncate">{a.birthPlace}</div>
                  )}
                </div>
                {!a._mapped && (
                  <span className="text-[10px] text-gray-400 dark:text-gray-600 shrink-0">{a._reason}</span>
                )}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="p-2 border-t border-gray-200 dark:border-gray-800 text-center">
        <span className="text-[11px] text-gray-400 dark:text-gray-600">
          {filtered.length} of {allAncestors.length} people
        </span>
      </div>
    </div>
  )
}
