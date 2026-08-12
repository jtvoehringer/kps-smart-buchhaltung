'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

const MONTHS = ['Jän','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

/** Eine Zeile aus monatssummen() – bereits in der DB aggregiert */
type Monatssumme = {
  jahr: number;
  monat: number;
  einnahmen: number;
  ausgaben: number;
  ust: number;
  vst: number;
};

type OpenInvoice = {
  id: string;
  invoice_number: string;
  due_date: string;
  total_gross: number;
  customers: { id: string; name: string; contact_person: string | null } | null;
};

type OpenIncoming = {
  id: string;
  vendor_name: string;
  invoice_number: string | null;
  due_date: string;
  amount_gross: number;
};

export default function DashboardClient({
  companyName,
  monatssummen,
  openInvoices,
  openIncoming,
}: {
  companyName: string;
  monatssummen: Monatssumme[];
  openInvoices: OpenInvoice[];
  openIncoming: OpenIncoming[];
}) {
  const currentYear = new Date().getFullYear();

  // Verfügbare Jahre aus den Buchungen ermitteln
  const availableYears = useMemo(() => {
    const years = new Set(monatssummen.map(m => Number(m.jahr)));
    years.add(currentYear);
    return Array.from(years).sort((a, b) => b - a);
  }, [monatssummen, currentYear]);

  const [selectedYear, setSelectedYear] = useState(currentYear);

  const monthly = useMemo(() => MONTHS.map((label, i) => {
    const month = i + 1;
    const z = monatssummen.find(m => Number(m.jahr) === selectedYear && Number(m.monat) === month);
    const income  = Number(z?.einnahmen ?? 0);
    const expense = Number(z?.ausgaben  ?? 0);
    const vat     = Number(z?.ust ?? 0) - Number(z?.vst ?? 0);
    return { label, month, income, expense, vat, balance: income - expense };
  }), [monatssummen, selectedYear]);

  const totalIncome  = monthly.reduce((s, m) => s + m.income,  0);
  const totalExpense = monthly.reduce((s, m) => s + m.expense, 0);
  const totalVat     = monthly.reduce((s, m) => s + m.vat,     0);
  const totalBalance = totalIncome - totalExpense;

  // Offene Posten + überfällige Rechnungen (Ausgang und Eingang gemeinsam)
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  const outOpenCount = openInvoices.length;
  const outOpenTotal = openInvoices.reduce((s, i) => s + Number(i.total_gross), 0);
  const inOpenCount  = openIncoming.length;
  const inOpenTotal  = openIncoming.reduce((s, i) => s + Number(i.amount_gross), 0);

  const overdueRows = useMemo(() => {
    type Row = { id: string; kind: 'out' | 'in'; label: string; dueDate: string; amount: number };
    const rows: Row[] = [
      ...openInvoices
        .filter(i => new Date(i.due_date) < today)
        .map(i => ({
          id: i.id,
          kind: 'out' as const,
          label: i.customers?.name || i.invoice_number || '—',
          dueDate: i.due_date,
          amount: Number(i.total_gross),
        })),
      ...openIncoming
        .filter(i => new Date(i.due_date) < today)
        .map(i => ({
          id: i.id,
          kind: 'in' as const,
          label: i.vendor_name || i.invoice_number || '—',
          dueDate: i.due_date,
          amount: Number(i.amount_gross),
        })),
    ];
    return rows.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [openInvoices, openIncoming, today]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#35609E]">{companyName}</h1>
          <p className="text-gray-500 text-sm">Jahresübersicht</p>
        </div>
        {/* Jahres-Selector */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedYear(y => {
              const idx = availableYears.indexOf(y);
              return availableYears[idx + 1] ?? y;
            })}
            disabled={selectedYear === availableYears[availableYears.length - 1]}
            className="w-8 h-8 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition-colors"
          >‹</button>
          <span className="font-bold text-[#35609E] text-lg w-16 text-center">{selectedYear}</span>
          <button
            onClick={() => setSelectedYear(y => {
              const idx = availableYears.indexOf(y);
              return availableYears[idx - 1] ?? y;
            })}
            disabled={selectedYear === availableYears[0]}
            className="w-8 h-8 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition-colors"
          >›</button>
        </div>
      </div>

      {/* Kacheln */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Einnahmen gesamt</p>
          <p className="text-2xl font-bold text-[#00897B]">{formatCurrency(totalIncome)}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Ausgaben gesamt</p>
          <p className="text-2xl font-bold text-[#C62828]">{formatCurrency(totalExpense)}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Saldo</p>
          <p className={`text-2xl font-bold ${totalBalance >= 0 ? 'text-[#00897B]' : 'text-[#C62828]'}`}>
            {formatCurrency(Math.abs(totalBalance))}
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">USt-Saldo</p>
          <p className={`text-2xl font-bold ${totalVat >= 0 ? 'text-[#C62828]' : 'text-[#00897B]'}`}>
            {formatCurrency(Math.abs(totalVat))}
          </p>
        </div>
      </div>

      {/* Offene Posten */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Offene Ausgangsrechnungen</p>
          <p className="text-2xl font-bold text-[#35609E]">{outOpenCount > 0 ? formatCurrency(outOpenTotal) : '—'}</p>
          <p className="text-xs text-gray-400 mt-1">{outOpenCount} {outOpenCount === 1 ? 'Rechnung' : 'Rechnungen'} offen</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Offene Eingangsrechnungen</p>
          <p className="text-2xl font-bold text-[#35609E]">{inOpenCount > 0 ? formatCurrency(inOpenTotal) : '—'}</p>
          <p className="text-xs text-gray-400 mt-1">{inOpenCount} {inOpenCount === 1 ? 'Rechnung' : 'Rechnungen'} offen</p>
        </div>
      </div>

      {/* Überfällige Rechnungen */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            {overdueRows.length > 0 && <AlertTriangle size={16} strokeWidth={2} className="text-[#C62828]" />}
            Überfällige Rechnungen
          </h2>
          <Link href="/offene-posten" className="text-xs text-[#35609E] hover:text-[#4F90E8] font-medium hover:underline">
            Alle offenen Posten →
          </Link>
        </div>
        {overdueRows.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p className="text-sm">Keine überfälligen Rechnungen</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {overdueRows.map(r => {
              const days = Math.floor((today.getTime() - new Date(r.dueDate).getTime()) / 86400000);
              return (
                <li key={`${r.kind}-${r.id}`} className="flex items-center gap-3 px-6 py-3">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                    r.kind === 'out' ? 'bg-[#00897B]/10 text-[#00897B]' : 'bg-[#C62828]/10 text-[#C62828]'
                  }`}>
                    {r.kind === 'out' ? 'Ausgang' : 'Eingang'}
                  </span>
                  <span className="flex-1 text-sm text-gray-700 truncate">{r.label}</span>
                  <span className="text-xs text-[#C62828] flex-shrink-0">{days} {days === 1 ? 'Tag' : 'Tage'} überfällig</span>
                  <span className="text-sm font-medium text-gray-800 flex-shrink-0 w-24 text-right">{formatCurrency(r.amount)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Die Monatstabelle ist auf ihre eigene Seite gezogen
          (/monatsuebersicht, Design-Review August 2026). */}
      <div className="text-right">
        <Link href="/monatsuebersicht" className="text-sm text-[#35609E] hover:underline underline-offset-2">
          Zur Monatsübersicht →
        </Link>
      </div>
    </div>
  );
}
