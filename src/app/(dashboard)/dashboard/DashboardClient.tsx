'use client';

import { useState, useMemo } from 'react';
import { formatCurrency } from '@/lib/utils';

const MONTHS = ['Jän','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

type Transaction = {
  booking_date: string;
  type: string;
  amount_net: number;
  vat_amount: number;
  amount_gross: number;
};

export default function DashboardClient({
  companyName,
  transactions,
}: {
  companyName: string;
  transactions: Transaction[];
}) {
  const currentYear = new Date().getFullYear();

  // Verfügbare Jahre aus den Buchungen ermitteln
  const availableYears = useMemo(() => {
    const years = new Set(transactions.map(t => new Date(t.booking_date).getFullYear()));
    years.add(currentYear);
    return Array.from(years).sort((a, b) => b - a);
  }, [transactions, currentYear]);

  const [selectedYear, setSelectedYear] = useState(currentYear);

  const monthly = useMemo(() => MONTHS.map((label, i) => {
    const month = i + 1;
    const rows = transactions.filter(t => {
      const d = new Date(t.booking_date);
      return d.getFullYear() === selectedYear && d.getMonth() + 1 === month;
    });
    const income  = rows.filter(t => t.type === 'income' ).reduce((s, t) => s + Number(t.amount_gross), 0);
    const expense = rows.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount_gross), 0);
    const vat     = rows.filter(t => t.type === 'income' ).reduce((s, t) => s + Number(t.vat_amount), 0)
                  - rows.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.vat_amount), 0);
    return { label, month, income, expense, vat, balance: income - expense };
  }), [transactions, selectedYear]);

  const totalIncome  = monthly.reduce((s, m) => s + m.income,  0);
  const totalExpense = monthly.reduce((s, m) => s + m.expense, 0);
  const totalVat     = monthly.reduce((s, m) => s + m.vat,     0);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1B3A6B]">{companyName}</h1>
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
          <span className="font-bold text-[#1B3A6B] text-lg w-16 text-center">{selectedYear}</span>
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
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Einnahmen gesamt</p>
          <p className="text-2xl font-bold text-[#00897B]">{formatCurrency(totalIncome)}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Ausgaben gesamt</p>
          <p className="text-2xl font-bold text-[#C62828]">{formatCurrency(totalExpense)}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">USt-Saldo</p>
          <p className={`text-2xl font-bold ${totalVat >= 0 ? 'text-[#C62828]' : 'text-[#00897B]'}`}>
            {formatCurrency(Math.abs(totalVat))}
          </p>
        </div>
      </div>

      {/* Monatstabelle */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Monatsübersicht {selectedYear}</h2>
        </div>
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
                <td className="px-4 py-3 text-right text-[#00897B]">{m.income > 0 ? formatCurrency(m.income) : '—'}</td>
                <td className="px-4 py-3 text-right text-[#C62828]">{m.expense > 0 ? formatCurrency(m.expense) : '—'}</td>
                <td className={`px-4 py-3 text-right font-medium ${m.balance >= 0 ? 'text-[#00897B]' : 'text-[#C62828]'}`}>
                  {m.income > 0 || m.expense > 0 ? formatCurrency(Math.abs(m.balance)) : '—'}
                </td>
                <td className={`px-6 py-3 text-right ${m.vat >= 0 ? 'text-[#C62828]' : 'text-[#00897B]'}`}>
                  {m.income > 0 || m.expense > 0 ? formatCurrency(Math.abs(m.vat)) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200 bg-[#1B3A6B]/5 font-semibold">
              <td className="px-6 py-3 text-[#1B3A6B]">Jahrestotal</td>
              <td className="px-4 py-3 text-right text-[#00897B]">{formatCurrency(totalIncome)}</td>
              <td className="px-4 py-3 text-right text-[#C62828]">{formatCurrency(totalExpense)}</td>
              <td className={`px-4 py-3 text-right ${totalIncome - totalExpense >= 0 ? 'text-[#00897B]' : 'text-[#C62828]'}`}>
                {formatCurrency(Math.abs(totalIncome - totalExpense))}
              </td>
              <td className={`px-6 py-3 text-right ${totalVat >= 0 ? 'text-[#C62828]' : 'text-[#00897B]'}`}>
                {formatCurrency(Math.abs(totalVat))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
