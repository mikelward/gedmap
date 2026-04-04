import { useState, useCallback, useRef } from 'react'
import { useTheme } from '../ThemeContext'

export default function UploadScreen({ onFileUpload, appError }) {
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)
  const { theme, toggleTheme } = useTheme()

  const handleFile = useCallback(
    (file) => {
      const name = file.name.toLowerCase()
      if (!name.endsWith('.ged') && !name.endsWith('.gedcom')) {
        setError('Please upload a .ged or .gedcom file')
        return
      }
      setError(null)
      onFileUpload(file)
    },
    [onFileUpload]
  )

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center px-6">
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

      <div className="text-center mb-10">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white tracking-tight mb-3">
          AncestryAtlas
        </h1>
        <p className="text-lg text-gray-500 dark:text-gray-400">
          See where your family came from
        </p>
      </div>

      <div
        className={`
          w-full max-w-md rounded-2xl border-2 border-dashed p-12
          flex flex-col items-center justify-center gap-4 cursor-pointer
          transition-colors duration-200
          ${
            isDragging
              ? 'border-amber-400 bg-amber-400/10 dark:bg-amber-400/5'
              : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 bg-white/50 dark:bg-gray-900/50'
          }
        `}
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div className="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
            />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-gray-900 dark:text-white font-medium">
            Drop your GEDCOM file here
          </p>
          <p className="text-gray-500 text-sm mt-1">or tap to browse</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="*/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
          }}
        />
      </div>

      {(error || appError) && (
        <p className="text-red-500 dark:text-red-400 text-sm mt-4">{error || appError}</p>
      )}

      <p className="text-gray-400 dark:text-gray-600 text-sm mt-8 max-w-sm text-center">
        Upload a GEDCOM file exported from Ancestry, MyHeritage, FamilySearch,
        or any genealogy app
      </p>
    </div>
  )
}
