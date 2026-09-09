import { Drawer } from 'vaul'
import type { AncestorEntry } from '../types'

interface AncestorDetailProps {
  ancestor: AncestorEntry | null
  onNavigate: (id: string) => void
}

function AncestorDetail({ ancestor, onNavigate }: AncestorDetailProps) {
  if (!ancestor) return null

  return (
    <div className="space-y-4">
      {ancestor.photo && (
        <img
          src={ancestor.photo}
          alt={ancestor.name}
          className="w-24 h-24 rounded-full object-cover mx-auto"
        />
      )}
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white text-center">
        {ancestor.name}
      </h2>
      {ancestor.relationship && (
        <p className="text-sm text-amber-500/80 dark:text-amber-400/80 text-center -mt-2">{ancestor.relationship}</p>
      )}
      <div className="space-y-2 text-sm">
        {ancestor.birthDate && (
          <div className="flex justify-between">
            <span className="text-gray-500">Born</span>
            <span className="text-gray-700 dark:text-gray-300">
              {ancestor.birthDate}
              {ancestor.birthPlace && `, ${ancestor.birthPlace}`}
            </span>
          </div>
        )}
        {!ancestor.birthDate && ancestor.birthPlace && (
          <div className="flex justify-between">
            <span className="text-gray-500">Birthplace</span>
            <span className="text-gray-700 dark:text-gray-300">{ancestor.birthPlace}</span>
          </div>
        )}
        {(ancestor.deathDate || ancestor.deathPlace) && (
          <div className="flex justify-between">
            <span className="text-gray-500">Died</span>
            <span className="text-gray-700 dark:text-gray-300">
              {ancestor.deathDate || ''}
              {ancestor.deathPlace
                ? `${ancestor.deathDate ? ', ' : ''}${ancestor.deathPlace}`
                : ''}
            </span>
          </div>
        )}
      </div>
      {ancestor.parents.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Parents
          </h3>
          <div className="space-y-1">
            {ancestor.parents.map((p) => (
              <button
                key={p.id}
                onClick={() => onNavigate(p.id)}
                className="block w-full text-left text-amber-500 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-300
                           text-sm py-1.5 px-3 rounded-lg hover:bg-gray-100/50 dark:hover:bg-gray-800/50 transition-colors
                           min-h-[44px] flex items-center"
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {ancestor.children.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Children
          </h3>
          <div className="space-y-1">
            {ancestor.children.map((c) => (
              <button
                key={c.id}
                onClick={() => onNavigate(c.id)}
                className="block w-full text-left text-amber-500 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-300
                           text-sm py-1.5 px-3 rounded-lg hover:bg-gray-100/50 dark:hover:bg-gray-800/50 transition-colors
                           min-h-[44px] flex items-center"
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface MobileSheetProps {
  ancestor: AncestorEntry | null
  open: boolean
  onClose: () => void
  onNavigate: (id: string) => void
}

export function MobileSheet({ ancestor, open, onClose, onNavigate }: MobileSheetProps) {
  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 outline-none">
          <div className="bg-white dark:bg-gray-900 rounded-t-2xl p-6 pb-8 max-h-[85vh] overflow-y-auto">
            <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-700 rounded-full mx-auto mb-6" />
            <AncestorDetail ancestor={ancestor} onNavigate={onNavigate} />
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

interface PopupPosition {
  x: number
  y: number
}

interface DesktopPopupProps {
  ancestor: AncestorEntry | null
  position: PopupPosition | null
  onClose: () => void
  onNavigate: (id: string) => void
}

export function DesktopPopup({ ancestor, position, onClose, onNavigate }: DesktopPopupProps) {
  if (!ancestor) return null

  const style = position
    ? { left: position.x, top: position.y, transform: 'translate(-50%, -110%)' }
    : { right: 16, top: 80 }

  return (
    <div
      className="absolute z-30 w-72 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-800 p-5"
      style={style}
    >
      <button
        onClick={onClose}
        className="absolute top-3 right-3 text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white
                   w-6 h-6 flex items-center justify-center"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
      <AncestorDetail ancestor={ancestor} onNavigate={onNavigate} />
    </div>
  )
}
