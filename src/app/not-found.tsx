// Zeigt eine verständliche Seite statt der englischen Next.js-
// Standardmeldung "This page could not be found."

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-6">
      <div className="max-w-md w-full bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
        <p className="text-4xl font-semibold text-gray-300">404</p>
        <h1 className="mt-3 text-lg font-semibold text-gray-900">
          Diese Seite gibt es nicht
        </h1>
        <p className="mt-2 text-sm text-gray-600 leading-relaxed">
          Möglicherweise wurde sie verschoben, oder der Link ist nicht mehr aktuell.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block px-5 py-2 rounded-lg bg-[#35609E] hover:bg-[#4F90E8] text-white text-sm font-semibold transition-colors"
        >
          Zur Übersicht
        </Link>
      </div>
    </div>
  );
}
