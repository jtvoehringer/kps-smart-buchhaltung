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
  beleg_jahr: number | null;
  beleg_nr: number | null;
  categories: { name: string } | null;
};

/** Belegnummer wie im BMD-Export – die Klammer zum Papierbeleg. */
const belegNr = (t: { beleg_jahr: number | null; beleg_nr: number | null }) =>
  // Kurzform B-1, B-2 … – klar von Rechnungsnummern (AR-001/26)
  // unterscheidbar. Volle Form (2026/00001) traegt der BMD-Export.
  t.beleg_nr == null ? '—' : `B-${t.beleg_nr}`;

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
    const headers = ['Beleg-Nr', 'Datum', 'Typ', 'Kategorie', 'Beschreibung', 'Netto (EUR)', 'USt %', 'USt-Betrag (EUR)', 'Brutto (EUR)'];
    const rows = filtered.map(t => [
      belegNr(t),
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
          <span className="font-bold text-brand w-12 text-center text-sm">{year}</span>
          <button onClick={() => setFilterYear(availableYears[availableYears.indexOf(year) - 1] ?? year)}
            disabled={year === availableYears[0]}
            className="w-7 h-7 flex items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-30">
            <ChevronRight size={14} strokeWidth={2} />
          </button>
        </div>
        <div>
          <label htmlFor="buchungslisteClient-0" className="text-sm text-gray-600 font-medium mr-2">Monat</label>
          <select id="buchungslisteClient-0"
            value={filterMonth}
            onChange={e => setFilterMonth(Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
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
                  : 'bg-brand text-white'
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
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400 flex flex-col items-center gap-2">
            <Inbox size={32} strokeWidth={1.5} className="text-gray-300" />
            <p className="text-sm">Keine Buchungen gefunden</p>
          </div>
        ) : (
          <>
            {/* Mobile: Kartenliste statt breiter Tabelle (Welle 3) */}
            <ul className="md:hidden divide-y divide-gray-50">
              {filtered.map(t => (
                <li key={t.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {t.categories?.name ?? '—'}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {t.is_private && <span className="font-semibold text-gray-600">Privat · </span>}
                        {t.is_eauto && <span className="font-semibold text-accent-dark">E-Auto · </span>}
                        {t.description ?? '—'}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(t.booking_date).toLocaleDateString('de-AT')}
                        {' · '}{belegNr(t)}{' · '}{t.vat_rate} % USt
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-sm font-semibold tabular-nums ${t.type === 'income' ? 'text-income' : 'text-expense'}`}>
                        {formatCurrency(Number(t.amount_gross))}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {t.type === 'income' ? 'Einnahme' : 'Ausgabe'}
                      </p>
                    </div>
                  </div>
                  {!t.is_locked ? (
                    <div className="flex justify-end gap-2 mt-2">
                      <Link
                        href={`/buchungen/${t.id}/bearbeiten`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        <Pencil size={13} strokeWidth={2} />
                        Bearbeiten
                      </Link>
                      <button
                        onClick={() => handleDelete(t.id)}
                        disabled={deletingId === t.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-500 hover:text-expense hover:border-expense/30 hover:bg-expense/5 transition-colors disabled:opacity-50"
                      >
                        <X size={13} strokeWidth={2} />
                        Löschen
                      </button>
                    </div>
                  ) : (
                    <p className="flex items-center justify-end gap-1 mt-2 text-[11px] text-gray-300">
                      <Lock size={11} strokeWidth={2} /> Gesperrt – UVA bereits übermittelt
                    </p>
                  )}
                </li>
              ))}
            </ul>

            <table className="w-full min-w-[820px] text-sm hidden md:table">
              <thead>
                <tr className="bg-gray-50 text-xs font-semibold text-gray-600 uppercase tracking-wide border-b border-gray-100">
                  <th className="text-left px-3 py-3">Beleg-Nr</th>
                  <th className="text-left px-3 py-3">Datum</th>
                  <th className="text-left px-3 py-3">Kategorie</th>
                  <th className="text-left px-3 py-3">Beschreibung</th>
                  <th className="text-right px-3 py-3">Netto</th>
                  <th className="text-right px-3 py-3">Brutto</th>
                  <th className="text-center px-3 py-3">Typ</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                    <td
                      className="px-3 py-3 text-gray-400 font-mono text-[11px] whitespace-nowrap"
                      title={t.beleg_nr == null ? undefined : `Beleg ${t.beleg_jahr}/${String(t.beleg_nr).padStart(5, '0')} – so steht er auch im BMD-Export`}
                    >
                      {belegNr(t)}
                    </td>
                    <td className="px-3 py-3 text-gray-600 whitespace-nowrap">
                      {new Date(t.booking_date).toLocaleDateString('de-AT')}
                    </td>
                    <td className="px-3 py-3 text-gray-700">
                      {t.categories?.name ?? '—'}
                    </td>
                    <td className="px-3 py-3 text-gray-500 max-w-[240px]">
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
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-accent/15 text-accent-dark flex-shrink-0"
                            title="E-Auto – Vorsteuer auf die Angemessenheitsgrenze gedeckelt"
                          >
                            E-Auto
                          </span>
                        )}
                        <span className="truncate">{t.description ?? '—'}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right text-gray-700 whitespace-nowrap">
                      {formatCurrency(Number(t.amount_net))}
                      <span className="block text-[11px] text-gray-400">{t.vat_rate} % USt</span>
                    </td>
                    <td className={`px-3 py-3 text-right font-medium ${t.type === 'income' ? 'text-income' : 'text-expense'}`}>
                      {formatCurrency(Number(t.amount_gross))}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {/* Token-Farben statt Ampel (Design-Review M1) */}
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                        t.type === 'income'
                          ? 'bg-income/10 text-income'
                          : 'bg-expense/10 text-expense'
                      }`}>
                        {t.type === 'income' ? 'Einnahme' : 'Ausgabe'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {/* Aktionen mit Text statt reiner Icons (Design-Review Welle 3) */}
                      {!t.is_locked && (
                        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                          <Link
                            href={`/buchungen/${t.id}/bearbeiten`}
                            className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors whitespace-nowrap"
                          >
                            <Pencil size={13} strokeWidth={2} />
                            Bearbeiten
                          </Link>
                          <button
                            onClick={() => handleDelete(t.id)}
                            disabled={deletingId === t.id}
                            className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-500 hover:text-expense hover:border-expense/30 hover:bg-expense/5 transition-colors disabled:opacity-50 whitespace-nowrap"
                          >
                            <X size={13} strokeWidth={2} />
                            Löschen
                          </button>
                        </div>
                      )}
                      {t.is_locked && (
                        <span className="text-gray-300 inline-flex items-center gap-1 text-[11px] whitespace-nowrap" title="Gesperrt – UVA bereits übermittelt">
                          <Lock size={13} strokeWidth={2} /> Gesperrt
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Summenzeile */}
            <div className="border-t-2 border-gray-200 bg-gray-50 px-4 py-3 flex flex-wrap justify-end gap-x-8 gap-y-1 text-sm font-semibold">
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
