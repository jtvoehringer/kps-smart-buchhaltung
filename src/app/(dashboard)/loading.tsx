// Wird angezeigt, solange eine Dashboard-Seite serverseitig lädt.
// Ohne diese Datei bleibt beim Seitenwechsel die alte Seite stehen –
// je nach Datenmenge mehrere Sekunden lang, ohne dass erkennbar ist,
// dass überhaupt etwas passiert.

export default function DashboardLoading() {
  return (
    <div className="p-6 md:p-8 animate-pulse" aria-busy="true" aria-live="polite">
      <span className="sr-only">Wird geladen…</span>

      <div className="h-7 w-56 rounded-lg bg-line" />
      <div className="mt-2 h-4 w-80 rounded-sm bg-well" />

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map(i => (
          <div key={i} className="card p-5">
            <div className="h-3 w-20 rounded-sm bg-well" />
            <div className="mt-3 h-6 w-28 rounded-sm bg-line" />
          </div>
        ))}
      </div>

      <div className="mt-6 card overflow-hidden">
        <div className="px-6 py-4 border-b border-line">
          <div className="h-4 w-40 rounded-sm bg-line" />
        </div>
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="px-6 py-3.5 border-b border-line flex items-center gap-4">
            <div className="h-3 w-20 rounded-sm bg-well" />
            <div className="h-3 flex-1 rounded-sm bg-well" />
            <div className="h-3 w-24 rounded-sm bg-well" />
          </div>
        ))}
      </div>
    </div>
  );
}
