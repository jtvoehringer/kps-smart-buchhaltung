'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Alle verfügbaren Module mit Beschreibung und Preis-Hinweis
const ALL_MODULES = [
  {
    id:          'invoicing',
    label:       'Rechnungsmodul',
    description: 'Ausgangsrechnungen erstellen, Kundenstamm, PDF-Export im Klientendesign, Offene Posten',
    icon:        '📄',
    badge:       'Add-on',
  },
  {
    id:          'ocr',
    label:       'OCR Belegverarbeitung',
    description: 'Belege fotografieren oder hochladen, KI-gestützte Datenerkennung (Datum, Betrag, MwSt), automatisch als Buchung übernehmen',
    icon:        '🔍',
    badge:       'Add-on',
  },
];

export default function ModulToggle({
  clientId,
  modulesEnabled,
}: {
  clientId: string;
  modulesEnabled: string[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const [active, setActive] = useState<string[]>(modulesEnabled);

  async function toggleModule(moduleId: string) {
    const newActive = active.includes(moduleId)
      ? active.filter(m => m !== moduleId)
      : [...active, moduleId];

    setSaving(true);
    setError('');

    const res = await fetch('/api/admin/set-modules', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ clientId, modules: newActive }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Fehler beim Speichern');
    } else {
      setActive(newActive);
      router.refresh();
    }
    setSaving(false);
  }

  return (
    <div className="bg-white rounded-xl border border-[#35609E]/20 shadow-sm p-5 mb-5">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="font-semibold text-gray-700">Module</h2>
        <span className="text-xs bg-[#35609E] text-white px-2 py-0.5 rounded-full font-medium">
          Superadmin
        </span>
      </div>

      <div className="space-y-3">
        {ALL_MODULES.map(mod => {
          const isOn = active.includes(mod.id);
          return (
            <div
              key={mod.id}
              className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                isOn ? 'border-[#35609E] bg-[#35609E]/5' : 'border-gray-200 bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{mod.icon}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-800 text-sm">{mod.label}</span>
                    <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
                      {mod.badge}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{mod.description}</p>
                </div>
              </div>
              <button
                onClick={() => toggleModule(mod.id)}
                disabled={saving}
                className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 focus:outline-none ${
                  isOn ? 'bg-[#35609E]' : 'bg-gray-300'
                }`}
                title={isOn ? 'Deaktivieren' : 'Aktivieren'}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    isOn ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>

      {error && (
        <p className="text-red-600 text-xs mt-3 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
      )}
      {saving && (
        <p className="text-gray-400 text-xs mt-2">Speichern…</p>
      )}
    </div>
  );
}
