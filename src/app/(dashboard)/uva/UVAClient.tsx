'use client';

import { useState, useMemo } from 'react';
import { VAT_RATES, calculateUVA } from '@/lib/utils';

type Transaction = {
  id: string;
  type: 'income' | 'expense';
  amount_net: number;
  vat_rate: number;
  vat_amount: number;
  booking_date: string;
};

type Props = {
  companyName: string;
  vatLiable: boolean;
  vatPeriod: string;
  transactions: Transaction[];
};

// Fälligkeiten: Q1→15.Mai, Q2→15.Aug, Q3→15.Nov, Q4→15.Feb(+1)
const FAELLIGKEITEN: Record<number, string> = {
  1: '15. Mai',
  2: '15. August',
  3: '15. November',
  4: '15. Februar (Folgejahr)',
};

function getQuarterMonths(quarter: number): number[] {
  return [quarter * 3 - 2, quarter * 3 - 1, quarter * 3];
}

function formatEur(value: number): string {
  return new Intl.NumberFormat('de-AT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(value);
}

export default function UVAClient({ companyName, vatLiable, vatPeriod, transactions }: Props) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [quarter, setQuarter] = useState<number>(() => Math.ceil((new Date().getMonth() + 1) / 3));

  // Verfügbare Jahre aus Buchungen ableiten
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    years.add(currentYear);
    transactions.forEach(t => years.add(new Date(t.booking_date).getFullYear()));
    return Array.from(years).sort((a, b) => b - a);
  }, [transactions, currentYear]);

  // Buchungen für gewähltes Quartal filtern
  const quarterTransactions = useMemo(() => {
    const months = getQuarterMonths(quarter);
    return transactions.filter(t => {
      const d = new Date(t.booking_date);
      return d.getFullYear() === year && months.includes(d.getMonth() + 1);
    });
  }, [transactions, year, quarter]);

  // UVA-Berechnung
  const uvaData = useMemo(() => calculateUVA(quarterTransactions), [quarterTransactions]);

  const faelligkeit = FAELLIGKEITEN[quarter];
  const quartalLabel = `Q${quarter} ${year}`;

  function handlePrint() {
    window.open(`/uva/drucken?year=${year}&quarter=${quarter}`, '_blank');
  }

  if (!vatLiable) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-[#1B3A6B] mb-2">UVA</h1>
        <p className="text-gray-500 text-sm mb-6">{companyName}</p>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="text-4xl mb-3">ℹ️</div>
          <p className="text-gray-600">
            Dieses Unternehmen ist laut Einstellungen <strong>nicht umsatzsteuerpflichtig</strong> (Kleinunternehmerregelung).
          </p>
          <p className="text-sm text-gray-400 mt-2">
            UVA-Meldungen sind daher nicht erforderlich.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1B3A6B]">Umsatzsteuervoranmeldung</h1>
          <p className="text-gray-500 text-sm">{companyName}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* PDF-Drucken Button */}
          <button
            onClick={handlePrint}
            title="UVA als PDF drucken / speichern"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border-2 border-[#1B3A6B] text-[#1B3A6B] hover:bg-[#1B3A6B] hover:text-white transition-colors"
          >
            <span>🖨</span>
            <span>PDF / Drucken</span>
          </button>
          {/* Jahr-Selector */}
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/20"
          >
            {availableYears.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Quartals-Tabs */}
      <div className="flex gap-2 mb-6">
        {[1, 2, 3, 4].map(q => (
          <button
            key={q}
            onClick={() => setQuarter(q)}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              quarter === q
                ? 'bg-[#1B3A6B] text-white shadow-sm'
                : 'bg-white text-gray-500 border border-gray-200 hover:border-[#1B3A6B]/30 hover:text-[#1B3A6B]'
            }`}
          >
            Q{q}
          </button>
        ))}
      </div>

      {/* Fälligkeit-Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 mb-6 flex items-center gap-3">
        <span className="text-amber-500 text-lg">📅</span>
        <div>
          <span className="text-sm font-semibold text-amber-800">Fälligkeit {quartalLabel}:</span>
          <span className="text-sm text-amber-700 ml-2">{faelligkeit}</span>
        </div>
      </div>

      {/* Keine Buchungen */}
      {quarterTransactions.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center">
          <div className="text-3xl mb-3">📭</div>
          <p className="text-gray-500">Keine Buchungen im {quartalLabel} vorhanden.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Umsatzsteuer-Tabelle */}
          <UVATable
            title="Umsatzsteuer (Kennzahlen 000–072)"
            subtitle="Ausgangsleistungen / Einnahmen"
            color="blue"
            rows={VAT_RATES.map(rate => ({
              label: rate === 0
                ? 'Steuerfreie Umsätze (Kz 000)'
                : `Umsätze ${rate}% USt (Kz 0${rate < 10 ? '0' + rate : rate})`,
              bgl: uvaData.ustByRate[rate].bemessungsgrundlage,
              steuer: uvaData.ustByRate[rate].steuer,
              rate,
            }))}
            total={uvaData.totalUSt}
            totalLabel="Gesamte Umsatzsteuer"
          />

          {/* Vorsteuer-Tabelle */}
          <UVATable
            title="Vorsteuer (Kennzahl 060)"
            subtitle="Eingangsleistungen / Ausgaben"
            color="teal"
            rows={VAT_RATES.map(rate => ({
              label: rate === 0
                ? 'Steuerfreie Eingangsleistungen'
                : `Vorsteuern ${rate}%`,
              bgl: uvaData.vstByRate[rate].bemessungsgrundlage,
              steuer: uvaData.vstByRate[rate].steuer,
              rate,
            }))}
            total={uvaData.totalVSt}
            totalLabel="Gesamte Vorsteuer"
          />

          {/* Zahllast */}
          <ZahllastCard
            zahllast={uvaData.zahllast}
            totalUSt={uvaData.totalUSt}
            totalVSt={uvaData.totalVSt}
            quartalLabel={quartalLabel}
          />
        </div>
      )}

      {/* Hinweis */}
      <p className="mt-6 text-xs text-gray-400 text-center">
        Diese Berechnung dient als Orientierungshilfe. Maßgeblich ist die offizielle Erklärung über FinanzOnline.
      </p>
    </div>
  );
}

/* ── Subtabelle ─────────────────────────────────────────────────── */
type RowData = { label: string; bgl: number; steuer: number; rate: number };

function UVATable({
  title, subtitle, color, rows, total, totalLabel,
}: {
  title: string;
  subtitle: string;
  color: 'blue' | 'teal';
  rows: RowData[];
  total: number;
  totalLabel: string;
}) {
  const headerColor = color === 'blue' ? 'bg-[#1B3A6B]' : 'bg-[#00897B]';
  const activeRows = rows.filter(r => r.bgl > 0 || r.steuer > 0);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className={`${headerColor} px-5 py-3`}>
        <h2 className="text-white font-semibold text-sm">{title}</h2>
        <p className="text-white/60 text-xs">{subtitle}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Bezeichnung</th>
              <th className="text-right px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Bemessungsgrundlage</th>
              <th className="text-right px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Steuerbetrag</th>
            </tr>
          </thead>
          <tbody>
            {activeRows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-5 py-4 text-center text-gray-400 text-sm">Keine Buchungen in diesem Zeitraum</td>
              </tr>
            ) : (
              activeRows.map(row => (
                <tr key={row.rate} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-5 py-3 text-gray-700">{row.label}</td>
                  <td className="px-5 py-3 text-right text-gray-700 font-mono text-sm">
                    {formatEur(row.bgl)}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-sm">
                    {row.rate === 0
                      ? <span className="text-gray-400">–</span>
                      : <span className="text-gray-900 font-medium">{formatEur(row.steuer)}</span>
                    }
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t border-gray-200">
              <td className="px-5 py-3 font-semibold text-gray-700">{totalLabel}</td>
              <td className="px-5 py-3"></td>
              <td className="px-5 py-3 text-right font-bold text-gray-900 font-mono">{formatEur(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/* ── Zahllast-Karte ─────────────────────────────────────────────── */
function ZahllastCard({
  zahllast, totalUSt, totalVSt, quartalLabel,
}: {
  zahllast: number;
  totalUSt: number;
  totalVSt: number;
  quartalLabel: string;
}) {
  const isGutschrift = zahllast < 0;
  const bgColor = isGutschrift ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200';
  const labelColor = isGutschrift ? 'text-emerald-700' : 'text-red-700';
  const valueColor = isGutschrift ? 'text-emerald-800' : 'text-red-800';

  return (
    <div className={`rounded-2xl border ${bgColor} p-6`}>
      <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-4">
        Ergebnis {quartalLabel}
      </h2>
      <div className="flex flex-wrap gap-8 items-end">
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Umsatzsteuer</p>
          <p className="text-lg font-bold text-gray-800 font-mono">{formatEur(totalUSt)}</p>
        </div>
        <div className="text-gray-400 text-xl font-light">−</div>
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Vorsteuer</p>
          <p className="text-lg font-bold text-gray-800 font-mono">{formatEur(totalVSt)}</p>
        </div>
        <div className="text-gray-400 text-xl font-light">=</div>
        <div className="flex-1 min-w-[160px]">
          <p className={`text-xs font-semibold mb-0.5 uppercase tracking-wider ${labelColor}`}>
            {isGutschrift ? '✓ Gutschrift' : '⚠ Zahllast'}
          </p>
          <p className={`text-2xl font-black font-mono ${valueColor}`}>
            {formatEur(Math.abs(zahllast))}
          </p>
          {isGutschrift && (
            <p className="text-xs text-emerald-600 mt-1">
              Erstattung durch das Finanzamt
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
