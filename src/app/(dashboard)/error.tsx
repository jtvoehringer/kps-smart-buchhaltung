'use client';

// Fängt Fehler ab, die beim Rendern einer Dashboard-Seite auftreten.
// Ohne diese Datei zeigt Next.js im Produktionsbetrieb eine leere
// Seite mit "Application error: a client-side exception has occurred" –
// ohne Hinweis, was zu tun ist, und ohne Weg zurück.

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw, LayoutDashboard } from 'lucide-react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Dashboard] Unbehandelter Fehler', error);
  }, [error]);

  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-white rounded-xl border border-gray-100 shadow-sm p-8">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-red-50 p-2.5 text-red-600 flex-shrink-0">
            <AlertTriangle size={22} strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-gray-900">
              Diese Seite konnte nicht geladen werden
            </h1>
            <p className="mt-2 text-sm text-gray-600 leading-relaxed">
              Ihre Daten sind davon nicht betroffen – es ist nichts verlorengegangen.
              Meist hilft es, die Seite noch einmal zu laden.
            </p>

            {error.digest && (
              <p className="mt-3 text-xs text-gray-400">
                Kennung für die Fehlersuche: <span className="font-mono">{error.digest}</span>
              </p>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={reset}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#35609E] hover:bg-[#4F90E8] text-white text-sm font-semibold transition-colors"
              >
                <RotateCcw size={15} strokeWidth={2} /> Erneut versuchen
              </button>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                <LayoutDashboard size={15} strokeWidth={2} /> Zur Übersicht
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
