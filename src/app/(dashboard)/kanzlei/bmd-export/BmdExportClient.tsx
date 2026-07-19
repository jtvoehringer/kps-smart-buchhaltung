'use client';

import { useState } from 'react';

type Client = { id: string; company_name: string };

type Props = {
  clients: Client[];
};

const currentYear = new Date().getFullYear();

export default function BmdExportClient({ clients }: Props) {
  const [clientId, setClientId]   = useState(clients[0]?.id ?? '');
  const [dateFrom, setDateFrom]   = useState(`${currentYear}-01-01`);
  const [dateTo, setDateTo]       = useState(`${currentYear}-12-31`);
  const [loading, setLoading]     = useState(false);
  const [previewRows, setPreviewRows] = useState<PreviewRow[] | null>(null);
  const [error, setError]         = useState('');

  const selectedClient = clients.find(c => c.id === clientId);

  async function fetchPreview() {
    if (!clientId) return;
    setLoading(true);
    setError('');
    setPreviewRows(null);
    try {
      const res = await fetch(
        `/api/kanzlei/bmd-export?clientId=${clientId}&dateFrom=${dateFrom}&dateTo=${dateTo}&preview=1`
      );
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setPreviewRows(json.rows);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }

  async function downloadCsv() {
    if (!clientId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/kanzlei/bmd-export?clientId=${clientId}&dateFrom=${dateFrom}&dateTo=${dateTo}`
      );
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      const fname = `BMD_EA_${selectedClient?.company_name.replace(/\s+/g, '_')}_${dateFrom}_${dateTo}.csv`;
      a.href     = url;
      a.download = fname;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fehler beim Export');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Auswahlkarte */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
          Export-Parameter
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Mandant */}
          <div className="sm:col-span-3">
            <label className="block text-xs font-medium text-gray-500 mb-1">Mandant</label>
            <select
              value={clientId}
              onChange={e => { setClientId(e.target.value); setPreviewRows(null); }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/30 bg-white"
            >
              {clients.length === 0 && (
                <option value="">Keine Mandanten gefunden</option>
              )}
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.company_name}</option>
              ))}
            </select>
          </div>

          {/* Datum von */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Datum von</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPreviewRows(null); }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/30"
            />
          </div>

          {/* Datum bis */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Datum bis</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPreviewRows(null); }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/30"
            />
          </div>

          {/* Schnellwahl */}
          <div className="flex flex-col justify-end gap-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">Schnellwahl</label>
            <div className="flex gap-1 flex-wrap">
              {[currentYear, currentYear - 1].map(y => (
                <button
                  key={y}
                  type="button"
                  onClick={() => {
                    setDateFrom(`${y}-01-01`);
                    setDateTo(`${y}-12-31`);
                    setPreviewRows(null);
                  }}
                  className="text-xs px-2.5 py-1 rounded-md border border-[#1B3A6B]/20 text-[#1B3A6B] hover:bg-[#1B3A6B]/5 transition-colors"
                >
                  {y}
                </button>
              ))}
              {[1, 2, 3, 4].map(q => {
                const from = `${currentYear}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`;
                const lastMonth = q * 3;
                const lastDay   = new Date(currentYear, lastMonth, 0).getDate();
                const to   = `${currentYear}-${String(lastMonth).padStart(2, '0')}-${lastDay}`;
                return (
                  <button
                    key={q}
                    type="button"
                    onClick={() => { setDateFrom(from); setDateTo(to); setPreviewRows(null); }}
                    className="text-xs px-2.5 py-1 rounded-md border border-[#1B3A6B]/20 text-[#1B3A6B] hover:bg-[#1B3A6B]/5 transition-colors"
                  >
                    Q{q}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            onClick={fetchPreview}
            disabled={!clientId || loading}
            className="flex-1 sm:flex-none px-5 py-2 rounded-lg border border-[#1B3A6B] text-[#1B3A6B] text-sm font-medium hover:bg-[#1B3A6B]/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Lädt…' : '🔍 Vorschau'}
          </button>
          <button
            onClick={downloadCsv}
            disabled={!clientId || loading}
            className="flex-1 sm:flex-none px-5 py-2 rounded-lg bg-[#1B3A6B] hover:bg-[#1565C0] text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Exportiert…' : '📤 CSV herunterladen'}
          </button>
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
        )}
      </div>

      {/* Vorschau-Tabelle */}
      {previewRows !== null && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">
              Vorschau — {previewRows.length} Buchungen
            </h2>
            {previewRows.length > 0 && (
              <span className="text-xs text-gray-400">BMD NTCS EA-Import Format</span>
            )}
          </div>

          {previewRows.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <div className="text-3xl mb-2">📭</div>
              <p className="text-sm">Keine Buchungen im gewählten Zeitraum</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-400 uppercase tracking-wide border-b border-gray-100">
                    <th className="text-left px-4 py-2.5">Datum</th>
                    <th className="text-left px-4 py-2.5">BelegNr</th>
                    <th className="text-left px-4 py-2.5">Text</th>
                    <th className="text-right px-4 py-2.5">Netto</th>
                    <th className="text-right px-4 py-2.5">St%</th>
                    <th className="text-right px-4 py-2.5">Steuer</th>
                    <th className="text-right px-4 py-2.5">Brutto</th>
                    <th className="text-center px-4 py-2.5">Konto</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i} className={`border-t border-gray-50 ${row.type === 'income' ? '' : 'text-red-700'}`}>
                      <td className="px-4 py-2 text-gray-700 whitespace-nowrap">{row.datum}</td>
                      <td className="px-4 py-2 text-gray-500">{row.belegnr}</td>
                      <td className="px-4 py-2 text-gray-700 max-w-[180px] truncate">{row.text}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{row.netto}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{row.steuerProzent}%</td>
                      <td className="px-4 py-2 text-right tabular-nums">{row.steuer}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium">{row.brutto}</td>
                      <td className="px-4 py-2 text-center text-gray-500">{row.konto}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Hinweis */}
      <div className="rounded-xl border border-[#98C6DD]/50 bg-[#98C6DD]/10 px-5 py-4 text-sm text-[#0E3C62]">
        <p className="font-semibold mb-1">ℹ️ BMD NTCS EA-Import</p>
        <p className="text-xs leading-relaxed opacity-80">
          Die CSV-Datei ist kompatibel mit dem BMD NTCS EA-Import (Semikolon-getrennt, ISO-8859-1).
          Einnahmen werden mit Konto 4000, Ausgaben mit Konto 5000 exportiert —
          diese können im BMD nach dem Import angepasst werden.
        </p>
      </div>
    </div>
  );
}

type PreviewRow = {
  datum: string;
  belegnr: string;
  text: string;
  netto: string;
  steuerProzent: number;
  steuer: string;
  brutto: string;
  konto: string;
  type: 'income' | 'expense';
};
