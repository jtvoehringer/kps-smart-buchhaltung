'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/utils';
import {
  ChevronLeft, ChevronRight, Download, Inbox, Pencil, X, Lock,
  ArrowUpCircle, ArrowDownCircle,
} from 'lucide-react';

type Transaction = {
  id: string;
  type: 'income' | 'expense';
  amount_net: number;
  vat_rate: number;
  vat_amount: number;
  amount_gross: number;
  booking_date: string;
  description: string | null;
  is_locked: boolean;
  is_private: boolean;
  is_eauto: boolean;
  categories: { name: string } | null;
};

const MONTHS = ['Alle','Jän','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

export default function BuchungslisteClient({
  transactions,
  year,
  availableYears,
}: {
  transactions: Transaction[];
  year: number;
  availableYears: number[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [filterMonth, setFilterMonth] = useState(0);
  const [filterType,  setFilterType]  = useState<'all' | 'income' | 'expense'>('all');
  const [deletingId,  setDeletingId]  = useState<string | null>(null);

  // Jahr-Wechsel über URL → Server lädt nur das gewählte Jahr
  function setFilterYear(newYear: number) {
    router.push(`/buchungen?year=${newYear}`);
  }

  const filtered = useMemo(() => transactions.filter(t => {
    const d = new Date(t.booking_date);
    const month = d.getMonth() + 1;
    if (filterMonth > 0 && month !== filterMonth) return false;
    if (filterType !== 'all' && t.type !== filterType) return false;
    return true;
  }), [transactions, filterMonth, filterType]);

  const totalIncome  = filtered.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount_gross), 0);
  const totalExpense = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount_gross), 0);

  function handleExport() {
    const BOM = '﻿';
    const headers = ['Datum', 'Typ', 'Kategorie', 'Beschreibung', 'Netto (EUR)', 'USt %', 'USt-Betrag (EUR)', 'Brutto (EUR)'];
    const rows = filtered.map(t => [
      new Date(t.booking_date).toLocaleDateString('de-AT'),
      t.type === 'income' ? 'Einnahme' : 'Ausgabe',
      t.categories?.name ?? '',
      t.description ?? '',
      Number(t.amount_net).toFixed(2).replace('.', ','),
      t.vat_rate.toString(),
      Number(t.vat_amount).toFixed(2).replace('.', ','),
      Number(t.amount_gross).toFixed(2).replace('.', ','),
    ]);
    const csv = BOM + [headers, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const monthStr = filterMonth > 0 ? `_${String(filterMonth).padStart(2, '0')}` : '';
    a.download = `buchungen_${year}${monthStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleDelete(id: string) {
    if (!confirm('Buchung wirklich löschen?')) return;
    setDeletingId(id);
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) {
      alert(`Fehler: ${error.message}`);
    } else {
      router.refresh();
    }
    setDeletingId(null);
  }

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-1">
          <button onClick={() => setFilterYear(availableYears[availableYears.indexOf(year) + 1] ?? year)}
            disabled={year === availableYears[availableYears.length - 1]}
            className="w-7 h-7 flex items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-30">
            <ChevronLeft size={14} strokeWidth={2} />
          </button>
          <span className="font-bold text-[#35609E] w-12 text-center text-sm">{year}</span>
          <button onClick={() => setFilterYear(availableYears[availableYears.indexOf(year) - 1] ?? year)}
            disabled={year === availableYears[0]}
            className="w-7 h-7 flex items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-30">
            <ChevronRight size={14} strokeWidth={2} />
          </button>
        </div>
        <div>
          <label className="text-sm text-gray-600 font-medium mr-2">Monat</label>
          <select
            value={filterMonth}
            onChange={e => setFilterMonth(Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E]"
          >
            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          {(['all','income','expense'] as const).map(t => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filterType === t
                  ? t === 'income' ? 'bg-income text-white'
                  : t === 'expense' ? 'bg-expense text-white'
                  : 'bg-[#35609E] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t === 'income' && <ArrowUpCircle size={14} strokeWidth={2} />}
              {t === 'expense' && <ArrowDownCircle size={14} strokeWidth={2} />}
              {t === 'all' ? 'Alle' : t === 'income' ? 'Einnahmen' : 'Ausgaben'}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-gray-500">
            {filtered.length} Buchung{filtered.length !== 1 ? 'en' : ''}
          </span>
          <button
            onClick={handleExport}
            disabled={filtered.length === 0}
            title="Gefilterte Buchungen als CSV exportieren"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40 transition-colors"
          >
            <Download size={14} strokeWidth={2} /> CSV
          </button>
        </div>
      </div>

      {/* Tabelle */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400 flex flex-col items-center gap-2">
            <Inbox size={32} strokeWidth={1.5} className="text-gray-300" />
            <p className="text-sm">Keine Buchungen gefunden</p>
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs font-semibold text-gray-600 uppercase tracking-wide border-b border-gray-100">
                  <th className="text-left px-4 py-3">Datum</th>
                  <th className="text-left px-4 py-3">Kategorie</th>
                  <th className="text-left px-4 py-3">Beschreibung</th>
                  <th className="text-right px-4 py-3">Netto</th>
                  <th className="text-right px-4 py-3">USt %</th>
                  <th className="text-right px-4 py-3">Brutto</th>
                  <th className="text-center px-4 py-3">Typ</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {new Date(t.booking_date).toLocaleDateString('de-AT')}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {t.categories?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 max-w-xs">
                      <div className="flex items-center gap-1.5">
                        {t.is_private && (
                          <span
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 flex-shrink-0"
                            title="Privat – zählt nicht in UVA, Dashboard und BMD-Export"
                          >
                            Privat
                          </span>
                        )}
                        {t.is_eauto && (
                          <span
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 flex-shrink-0"
                            title="E-Auto – Vorsteuer auf die Angemessenheitsgrenze gedeckelt"
                          >
                            E-Auto
                          </span>
                        )}
                        <span className="truncate">{t.description ?? '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {formatCurrency(Number(t.amount_net))}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">
                      {t.vat_rate} %
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${t.type === 'income' ? 'text-income' : 'text-expense'}`}>
                      {formatCurrency(Number(t.amount_gross))}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                        t.type === 'income'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {t.type === 'income'
                          ? <ArrowUpCircle size={12} strokeWidth={2} />
                          : <ArrowDownCircle size={12} strokeWidth={2} />}
                        {t.type === 'income' ? 'Einnahme' : 'Ausgabe'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!t.is_locked && (
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/buchungen/${t.id}/bearbeiten`}
                            className="text-gray-300 hover:text-[#35609E] transition-colors"
                            title="Buchung bearbeiten"
                          >
                            <Pencil size={14} strokeWidth={2} />
                          </Link>
                          <button
                            onClick={() => handleDelete(t.id)}
                            disabled={deletingId === t.id}
                            className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-50"
                            title="Buchung löschen"
                          >
                            <X size={16} strokeWidth={2} />
                          </button>
                        </div>
                      )}
                      {t.is_locked && (
                        <span className="text-gray-300 inline-flex" title="Gesperrt – UVA bereits übermittelt">
                          <Lock size={14} strokeWidth={2} />
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Summenzeile */}
            <div className="border-t-2 border-gray-200 bg-gray-50 px-4 py-3 flex justify-end gap-8 text-sm font-semibold">
              <span className="text-income">Einnahmen: {formatCurrency(totalIncome)}</span>
              <span className="text-expense">Ausgaben: {formatCurrency(totalExpense)}</span>
              <span className={totalIncome - totalExpense >= 0 ? 'text-income' : 'text-expense'}>
                Saldo: {formatCurrency(Math.abs(totalIncome - totalExpense))}
              </span>
            </div>

            {filtered.some(t => t.is_private) && (
              <p className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100">
                Die Summen oben enthalten auch als <strong>Privat</strong> gekennzeichnete Buchungen.
                In UVA, Dashboard und BMD-Export bleiben diese unberücksichtigt.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
