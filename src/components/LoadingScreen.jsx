export default function LoadingScreen({ done, total }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center px-6">
      <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
        Locating ancestors...
      </h2>
      <p className="text-gray-500 dark:text-gray-400 mb-8">
        {done} / {total}
      </p>
      <div className="w-full max-w-xs bg-gray-200 dark:bg-gray-800 rounded-full h-2 overflow-hidden">
        <div
          className="bg-amber-400 h-full rounded-full transition-all duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
