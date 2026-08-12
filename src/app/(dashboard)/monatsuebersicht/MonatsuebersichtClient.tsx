'use client';

import { useMemo, useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import { CalendarRange } from 'lucide-react';

/** Eine Zeile aus monatssummen() – bereits in der DB aggregiert */
type Monatssumme = {
  jahr: number;
  monat: number;
  einnahmen: number;
  ausgaben: number;
  ust: number;
  vst: number;
};

const MONTHS = [
  'Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

export default function MonatsuebersichtClient({
  monatssummen,
}: {
  monatssummen: Monatssumme[];
}) {
  const currentYear = new Date().getFullYear();

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand flex items-center gap-2">
            <CalendarRange size={22} strokeWidth={1.75} className="text-accent-dark" />
            Monatsübersicht
          </h1>
          <p className="text-gray-500 text-sm">Einnahmen, Ausgaben und USt-Saldo je Monat</p>
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
          <span className="font-bold text-brand text-lg w-16 text-center">{selectedYear}</span>
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

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <th className="text-left px-6 py-3">Monat</th>
              <th className="text-right px-4 py-3">Einnahmen</th>
              <th className="text-right px-4 py-3">Ausgaben</th>
              <th className="text-right px-4 py-3">Saldo</th>
              <th className="text-right px-6 py-3">USt-Saldo</th>
            </tr>
          </thead>
          <tbody>
            {monthly.map((m, i) => (
              <tr key={m.label} className={`border-t border-gray-50 hover:bg-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/30'}`}>
                <td className="px-6 py-3 font-medium text-gray-700">{m.label}</td>
                <td className="px-4 py-3 text-right text-income">{m.income > 0 ? formatCurrency(m.income) : '—'}</td>
                <td className="px-4 py-3 text-right text-expense">{m.expense > 0 ? formatCurrency(m.expense) : '—'}</td>
                <td className={`px-4 py-3 text-right font-medium ${m.balance >= 0 ? 'text-income' : 'text-expense'}`}>
                  {m.income > 0 || m.expense > 0 ? formatCurrency(Math.abs(m.balance)) : '—'}
                </td>
                <td className={`px-6 py-3 text-right ${m.vat >= 0 ? 'text-expense' : 'text-income'}`}>
                  {m.income > 0 || m.expense > 0 ? formatCurrency(Math.abs(m.vat)) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200 bg-brand/5 font-semibold">
              <td className="px-6 py-3 text-brand">Jahrestotal</td>
              <td className="px-4 py-3 text-right text-income">{formatCurrency(totalIncome)}</td>
              <td className="px-4 py-3 text-right text-expense">{formatCurrency(totalExpense)}</td>
              <td className={`px-4 py-3 text-right ${totalIncome - totalExpense >= 0 ? 'text-income' : 'text-expense'}`}>
                {formatCurrency(Math.abs(totalIncome - totalExpense))}
              </td>
              <td className={`px-6 py-3 text-right ${totalVat >= 0 ? 'text-expense' : 'text-income'}`}>
                {formatCurrency(Math.abs(totalVat))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
