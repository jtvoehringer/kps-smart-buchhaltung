'use client';

import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/utils';
import { Check, EyeOff, Eye } from 'lucide-react';

type Row = {
  id: string;
  booking_date: string;
  description: string | null;
  type: 'income' | 'expense';
  amount_gross: number;
  is_private: boolean;
  is_reconciled: boolean;
  category: { name: string } | null;
};

export default function AbstimmungClient({ accountName, rows: initialRows }: { accountName: string; rows: Row[] }) {
  const supabase = createClient();
  const [rows, setRows] = useState(initialRows);
  const [hidePrivate, setHidePrivate] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Chronologisch aufsteigend für den Saldenlauf, danach zur Anzeige wieder neueste zuerst.
  const withBalance = useMemo(() => {
    const asc = [...rows].sort((a, b) => a.booking_date.localeCompare(b.booking_date));
    let balance = 0;
    const withRunning = asc.map(r => {
      balance += r.type === 'income' ? Number(r.amount_gross) : -Number(r.amount_gross);
      return { ...r, balance };
    });
    return withRunning.reverse();
  }, [rows]);

  const visible = hidePrivate ? withBalance.filter(r => !r.is_private) : withBalance;
  const endBalance = withBalance[0]?.balance ?? 0;
  const openCount = rows.filter(r => !r.is_reconciled).length;

  async function toggleReconciled(id: string, current: boolean) {
    setBusyId(id);
    const { error } = await supabase.from('transactions').update({ is_reconciled: !current }).eq('id', id);
    if (!error) {
      setRows(prev => prev.map(r => r.id === id ? { ...r, is_reconciled: !current } : r));
    }
    setBusyId(null);
  }

  async function togglePrivate(id: string, current: boolean) {
    setBusyId(id);
    const { error } = await supabase.from('transactions').update({ is_private: !current }).eq('id', id);
    if (!error) {
      setRows(prev => prev.map(r => r.id === id ? { ...r, is_private: !current } : r));
    }
    setBusyId(null);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Kontostand (Buchungen)</p>
          <p className={`text-xl font-bold ${endBalance >= 0 ? 'text-[#35609E]' : 'text-expense'}`}>{formatCurrency(endBalance)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Buchungen</p>
          <p className="text-xl font-bold text-gray-700">{rows.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Nicht abgestimmt</p>
          <p className={`text-xl font-bold ${openCount > 0 ? 'text-amber-600' : 'text-gray-700'}`}>{openCount}</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{accountName}</p>
        <button
          onClick={() => setHidePrivate(v => !v)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 bg-white border border-gray-200 px-3 py-1.5 rounded-lg transition-colors"
        >
          {hidePrivate ? <EyeOff size={13} strokeWidth={2} /> : <Eye size={13} strokeWidth={2} />}
          Privatumsätze {hidePrivate ? 'ausgeblendet' : 'anzeigen'}
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
          <p className="text-gray-500 text-sm">Diesem Konto sind noch keine Buchungen zugeordnet.</p>
          <p className="text-gray-400 text-xs mt-1">Buchungen erhalten beim Bank-Import automatisch ein Konto.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                <th className="text-left px-4 py-3">Datum</th>
                <th className="text-left px-4 py-3">Beschreibung</th>
                <th className="text-left px-4 py-3">Kategorie</th>
                <th className="text-right px-4 py-3">Betrag</th>
                <th className="text-right px-4 py-3">Saldo</th>
                <th className="text-center px-4 py-3">Privat</th>
                <th className="text-center px-4 py-3">Abgestimmt</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(r => (
                <tr key={r.id} className={`border-t border-gray-50 hover:bg-gray-50/50 ${r.is_private ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                    {new Date(r.booking_date).toLocaleDateString('de-AT')}
                  </td>
                  <td className="px-4 py-3 text-gray-700 max-w-xs truncate" title={r.description ?? ''}>
                    {r.description ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{r.category?.name ?? '—'}</td>
                  <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${r.type === 'income' ? 'text-income' : 'text-expense'}`}>
                    {r.type === 'income' ? '+' : '−'}{formatCurrency(Number(r.amount_gross))}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500 whitespace-nowrap">{formatCurrency(r.balance)}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => togglePrivate(r.id, r.is_private)}
                      disabled={busyId === r.id}
                      className={`w-5 h-5 rounded-md border inline-flex items-center justify-center transition-colors disabled:opacity-50 ${
                        r.is_private ? 'bg-gray-400 border-gray-400 text-white' : 'border-gray-300 hover:border-gray-400'
                      }`}
                      title="Als Privatumsatz markieren"
                    >
                      {r.is_private && <Check size={12} strokeWidth={2.5} />}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleReconciled(r.id, r.is_reconciled)}
                      disabled={busyId === r.id}
                      className={`w-5 h-5 rounded-md border inline-flex items-center justify-center transition-colors disabled:opacity-50 ${
                        r.is_reconciled ? 'bg-[#35609E] border-[#35609E] text-white' : 'border-gray-300 hover:border-gray-400'
                      }`}
                      title="Mit Kontoauszug abgestimmt"
                    >
                      {r.is_reconciled && <Check size={12} strokeWidth={2.5} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
