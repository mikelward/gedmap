import { useEffect, useRef } from 'react'
import { PROVIDERS } from './exportGuideData'

function ProviderGuide({ provider }) {
  return (
    <details className="group border-b border-gray-200 dark:border-gray-800 last:border-b-0">
      <summary
        className="flex items-center justify-between cursor-pointer py-3 px-1
                   text-gray-900 dark:text-white font-medium select-none
                   list-none [&::-webkit-details-marker]:hidden min-h-[44px]"
      >
        {provider.name}
        <svg
          className="w-4 h-4 text-gray-400 transition-transform group-open:rotate-180"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </summary>
      <div className="pb-4 px-1 space-y-3">
        <ol className="list-decimal list-inside space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          {provider.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
        {provider.note && (
          <p className="text-xs text-gray-500 dark:text-gray-400">{provider.note}</p>
        )}
        <a
          href={provider.helpUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-xs text-amber-500 dark:text-amber-400 hover:underline"
        >
          {provider.name} official help →
        </a>
      </div>
    </details>
  )
}

const FOCUSABLE =
  'a[href], button:not([disabled]), summary, input, [tabindex]:not([tabindex="-1"])'

// An element is reachable by Tab only if it is not hidden inside a collapsed
// <details> (the <summary> itself stays reachable).
function isReachable(el) {
  for (let node = el; node && node.parentElement; node = node.parentElement) {
    const parent = node.parentElement
    if (parent.tagName === 'DETAILS' && !parent.open && node.tagName !== 'SUMMARY') {
      return false
    }
  }
  return true
}

export default function ExportGuide({ open, onClose }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    if (!open) return

    // Move focus into the dialog and restore it to the trigger on close.
    const previouslyFocused = document.activeElement
    dialogRef.current?.focus()

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return

      // Trap Tab order within the dialog so the background stays unreachable.
      const dialog = dialogRef.current
      if (!dialog) return
      const focusable = Array.from(dialog.querySelectorAll(FOCUSABLE)).filter(
        isReachable
      )
      if (focusable.length === 0) {
        e.preventDefault()
        dialog.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === dialog)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="How to export a GEDCOM file"
        tabIndex={-1}
        className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-white dark:bg-gray-900
                   shadow-2xl border border-gray-200 dark:border-gray-800 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            How to export a GEDCOM file
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white
                       w-8 h-8 -mr-2 -mt-1 flex items-center justify-center shrink-0"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Pick your genealogy site for step-by-step instructions, then upload the
          downloaded file.
        </p>
        <div>
          {PROVIDERS.map((provider) => (
            <ProviderGuide key={provider.name} provider={provider} />
          ))}
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-600 mt-4">
          Using a different app? Look for an Export or "Export to GEDCOM" option in
          your tree or account settings.
        </p>
      </div>
    </div>
  )
}
