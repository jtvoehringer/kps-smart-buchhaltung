'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/utils';
import { Lock, LockOpen, Loader2, CalendarCheck } from 'lucide-react';

type MonthRow = {
  year: number;
  month: number;
  label: string;
  txCount: number;
  income: number;
  expense: number;
  closed: boolean;
  closedAt: string | null;
};

export default function MonatsabschlussClient({
  clientId,
  months,
  canReopen,
}: {
  clientId: string;
  months: MonthRow[];
  canReopen: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function handleClose(m: MonthRow) {
    const key = `${m.year}-${m.month}`;
    if (!confirm(
      `Monat ${m.label} wirklich abschließen? Danach können keine Buchungen mehr in diesem Monat angelegt oder geändert werden (auch nicht per Beleg-OCR, Offene-Posten-Zahlung oder Bank-Import).`
    )) return;
    setBusyKey(key); setError('');
    const { error: err } = await supabase.rpc('monat_abschliessen', {
      p_client_id: clientId, p_year: m.year, p_month: m.month,
    });
    if (err) setError(err.message);
    setBusyKey(null);
    router.refresh();
  }

  async function handleReopen(m: MonthRow) {
    const key = `${m.year}-${m.month}`;
    if (!confirm(`Monat ${m.label} wirklich wieder öffnen? Es können danach wieder Buchungen erfasst werden – bitte anschließend erneut abschließen.`)) return;
    setBusyKey(key); setError('');
    const { error: err } = await supabase.rpc('monat_oeffnen', {
      p_client_id: clientId, p_year: m.year, p_month: m.month,
    });
    if (err) setError(err.message);
    setBusyKey(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
              <th className="text-left px-4 py-3">Monat</th>
              <th className="text-right px-4 py-3">Buchungen</th>
              <th className="text-right px-4 py-3">Einnahmen</th>
              <th className="text-right px-4 py-3">Ausgaben</th>
              <th className="text-center px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {months.map(m => {
              const key = `${m.year}-${m.month}`;
              const busy = busyKey === key;
              return (
                <tr key={key} className="border-t border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-800">{m.label}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{m.txCount}</td>
                  <td className="px-4 py-3 text-right text-income font-medium">{formatCurrency(m.income)}</td>
                  <td className="px-4 py-3 text-right text-expense font-medium">{formatCurrency(m.expense)}</td>
                  <td className="px-4 py-3 text-center">
                    {m.closed ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-gray-500 px-2.5 py-1 rounded-lg">
                        <Lock size={12} strokeWidth={2} /> Abgeschlossen
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg">
                        <LockOpen size={12} strokeWidth={2} /> Offen
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {busy ? (
                      <Loader2 size={16} strokeWidth={2} className="animate-spin text-gray-400 inline-block" />
                    ) : m.closed ? (
                      canReopen && (
                        <button
                          onClick={() => handleReopen(m)}
                          className="text-xs font-semibold text-gray-500 hover:text-brand transition-colors"
                        >
                          Wieder öffnen
                        </button>
                      )
                    ) : (
                      <button
                        onClick={() => handleClose(m)}
                        title={m.txCount === 0 ? 'Monat ohne Buchungen abschließen (Nullmonat)' : undefined}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-brand hover:bg-accent px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <CalendarCheck size={13} strokeWidth={2} />
                        Abschließen
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
