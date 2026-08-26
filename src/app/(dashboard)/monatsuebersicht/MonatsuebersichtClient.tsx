'use client';

import { useMemo, useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import { CalendarRange } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import ZeitraumWaehler from '@/components/ZeitraumWaehler';
import { BarChart, Card, CardHeader, Legend } from '@/components/ui';

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
      <PageHeader
        title="Monatsübersicht"
        subtitle="Einnahmen, Ausgaben und USt-Saldo je Monat"
        icon={CalendarRange}
      >
        <ZeitraumWaehler<number> werte={availableYears} wert={selectedYear} onChange={setSelectedYear} />
      </PageHeader>

      {/* Verlauf als Balken mit direkter Beschriftung (Welle 4) */}
      {(totalIncome > 0 || totalExpense > 0) && (
        <Card>
          <CardHeader title={`Verlauf ${selectedYear}`}>
            <Legend items={[{ color: 'bg-chart-1', label: 'Einnahmen' }, { color: 'bg-chart-2', label: 'Ausgaben' }]} />
          </CardHeader>
          <BarChart
            rows={monthly.filter(m => m.income > 0 || m.expense > 0).map(m => ({ label: m.label, value: m.income, value2: m.expense }))}
            format={v => formatCurrency(v)}
          />
        </Card>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="label-mono border-b border-line-2">
              <th className="text-left px-6 py-3">Monat</th>
              <th className="text-right px-4 py-3">Einnahmen</th>
              <th className="text-right px-4 py-3">Ausgaben</th>
              <th className="text-right px-4 py-3">Saldo</th>
              <th className="text-right px-6 py-3">USt-Saldo</th>
            </tr>
          </thead>
          <tbody>
            {monthly.map((m, i) => (
              <tr key={m.label} className={`border-t border-line hover:bg-row ${i % 2 === 0 ? '' : 'bg-row/30'}`}>
                <td className="px-6 py-3 font-medium text-ink">{m.label}</td>
                <td className="px-4 py-3 text-right text-income num">{m.income > 0 ? formatCurrency(m.income) : '—'}</td>
                <td className="px-4 py-3 text-right text-expense num">{m.expense > 0 ? formatCurrency(m.expense) : '—'}</td>
                <td className={`px-4 py-3 text-right font-medium ${m.balance >= 0 ? 'text-income' : 'text-expense'} num`}>
                  {m.income > 0 || m.expense > 0 ? formatCurrency(Math.abs(m.balance)) : '—'}
                </td>
                <td className={`px-6 py-3 text-right ${m.vat >= 0 ? 'text-expense' : 'text-income'} num`}>
                  {m.income > 0 || m.expense > 0 ? formatCurrency(Math.abs(m.vat)) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-line-2 bg-navy/5 font-semibold">
              <td className="px-6 py-3 text-navy">Jahrestotal</td>
              <td className="px-4 py-3 text-right text-income num">{formatCurrency(totalIncome)}</td>
              <td className="px-4 py-3 text-right text-expense num">{formatCurrency(totalExpense)}</td>
              <td className={`px-4 py-3 text-right ${totalIncome - totalExpense >= 0 ? 'text-income' : 'text-expense'} num`}>
                {formatCurrency(Math.abs(totalIncome - totalExpense))}
              </td>
              <td className={`px-6 py-3 text-right ${totalVat >= 0 ? 'text-expense' : 'text-income'} num`}>
                {formatCurrency(Math.abs(totalVat))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
