import { useState, useMemo } from 'react'
import { useTheme } from '../ThemeContext'
import type { PersonSummary } from '../types'

interface PersonPickerProps {
  allPeople: PersonSummary[]
  defaultRootId: string | undefined
  onSelect: (id: string) => void
  appError: string | null
}

export default function PersonPicker({ allPeople, defaultRootId, onSelect, appError }: PersonPickerProps) {
  const [search, setSearch] = useState('')
  const { theme, toggleTheme } = useTheme()

  const filtered = useMemo(() => {
    if (!search.trim()) return allPeople
    const q = search.toLowerCase()
    return allPeople.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.birthPlace?.toLowerCase().includes(q) ||
        p.birthDate?.toLowerCase().includes(q)
    )
  }, [allPeople, search])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center px-4 py-8">
      <button
        onClick={toggleTheme}
        className="fixed top-4 right-4 z-30 p-2 rounded-lg bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
          </svg>
        )}
      </button>

      <div className="text-center mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white tracking-tight mb-2">
          Choose a starting person
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          {allPeople.length} people in file — pick who to map ancestors for
        </p>
      </div>

      {appError && (
        <p className="text-red-500 dark:text-red-400 text-sm mb-4">{appError}</p>
      )}

      <div className="w-full max-w-md mb-4">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Search by name or place..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            className="w-full bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm rounded-xl pl-9 pr-4 py-3
                       placeholder-gray-400 dark:placeholder-gray-500 border border-gray-300 dark:border-gray-700 focus:border-amber-400
                       focus:outline-none transition-colors"
          />
        </div>
      </div>

      <div className="w-full max-w-md flex-1 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-800
                      bg-white/50 dark:bg-gray-900/50 max-h-[60vh]">
        {filtered.length === 0 && (
          <p className="text-gray-500 text-sm p-6 text-center">No matches</p>
        )}
        {filtered.map((person) => (
          <button
            key={person.id}
            onClick={() => onSelect(person.id)}
            className={`w-full text-left px-4 py-3 text-sm transition-colors
              hover:bg-gray-100/60 dark:hover:bg-gray-800/60 border-b border-gray-200/50 dark:border-gray-800/50 last:border-b-0
              ${person.id === defaultRootId ? 'bg-amber-400/10 dark:bg-amber-400/5' : ''}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-gray-900 dark:text-white truncate">{person.name}</div>
                <div className="text-[11px] text-gray-500 truncate">
                  {[person.birthDate, person.birthPlace].filter(Boolean).join(' — ') || 'No details'}
                </div>
              </div>
              {person.id === defaultRootId && (
                <span className="text-[10px] text-amber-500 dark:text-amber-400 shrink-0 border border-amber-500/30 dark:border-amber-400/30
                                 rounded px-1.5 py-0.5">
                  Default
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      <p className="text-gray-400 dark:text-gray-600 text-xs mt-4">
        {filtered.length} of {allPeople.length} people shown
      </p>
    </div>
  )
}
