'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { VAT_RATES, calculateUVA, type UVATransaction } from '@/lib/utils';
import { baueUvaAufstellung, type UstKennzeichen } from '@/lib/steuer/uva-kennzahlen';
import {
  Printer, CalendarClock, Inbox, Info, Lock, CheckCircle2, AlertTriangle,
  Calculator, Send, Loader2,
} from 'lucide-react';

type TaxReturn = {
  id: string;
  period_year: number;
  period_month: number;
  status: 'draft' | 'signed' | 'submitted';
  submitted_at: string | null;
};

type Props = {
  clientId: string;
  companyName: string;
  vatLiable: boolean;
  vatPeriod: string; // 'monthly' | 'quarterly'
  /** Jahre mit Buchungen – aus buchungsjahre() */
  jahre: number[];
  taxReturns: TaxReturn[];
};

/** Eine Zeile aus uva_summe() */
type SummenZeile = {
  typ: 'income' | 'expense';
  ust_kennzeichen: string;
  vat_rate: number;
  bemessungsgrundlage: number;
  steuer: number;
  anzahl: number;
};

const MONATE = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

// Fälligkeiten Quartal: Q1→15.Mai, Q2→15.Aug, Q3→15.Nov, Q4→15.Feb(+1)
const QUARTAL_FAELLIGKEIT: Record<number, string> = {
  1: '15. Mai',
  2: '15. August',
  3: '15. November',
  4: '15. Februar (Folgejahr)',
};

function pad(n: number) { return String(n).padStart(2, '0'); }
function lastDayOfMonth(year: number, month: number) { return new Date(year, month, 0).getDate(); }

function formatEur(value: number): string {
  return new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(value);
}

function formatDateTime(ts: string | null) {
  return ts ? new Date(ts).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;
}

export default function UVAClient({ clientId, companyName, vatLiable, vatPeriod, jahre, taxReturns }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const isQuarterly = vatPeriod !== 'monthly';

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [periodNum, setPeriodNum] = useState<number>(() =>
    isQuarterly ? Math.ceil((new Date().getMonth() + 1) / 3) : new Date().getMonth() + 1
  );
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const availableYears = useMemo(() => {
    const years = new Set<number>(jahre);
    years.add(currentYear);
    return Array.from(years).sort((a, b) => b - a);
  }, [jahre, currentYear]);

  const periodMonth = isQuarterly ? periodNum * 3 : periodNum;
  const periodStartMonth = isQuarterly ? periodNum * 3 - 2 : periodNum;
  const dateFrom = `${year}-${pad(periodStartMonth)}-01`;
  const dateTo = `${year}-${pad(periodMonth)}-${pad(lastDayOfMonth(year, periodMonth))}`;

  // Summen kommen aus der Datenbank, nicht mehr aus einer im Browser
  // gefilterten Gesamtliste. Damit gibt es keine stille Obergrenze.
  const [summen, setSummen] = useState<SummenZeile[]>([]);
  const [ladeSummen, setLadeSummen] = useState(true);
  const [ladeFehler, setLadeFehler] = useState('');

  const summenLaden = useCallback(async () => {
    setLadeSummen(true);
    setLadeFehler('');
    const { data, error: err } = await supabase.rpc('uva_summe', {
      p_client_id: clientId,
      p_von: dateFrom,
      p_bis: dateTo,
    });
    if (err) {
      console.error('uva_summe fehlgeschlagen:', err);
      setLadeFehler(`Die Summen konnten nicht geladen werden: ${err.message}`);
      setSummen([]);
    } else {
      setSummen((data ?? []) as SummenZeile[]);
    }
    setLadeSummen(false);
  }, [supabase, clientId, dateFrom, dateTo]);

  useEffect(() => { void summenLaden(); }, [summenLaden]);

  // Die Summenzeilen in dieselbe Form bringen, die calculateUVA erwartet.
  // So bleibt die Kennzahlenzuordnung an einer Stelle und ist getestet.
  // Zuordnung zu den amtlichen Kennzahlen liegt in @/lib/steuer und ist
  // dort getestet – inklusive Reverse Charge und ig. Erwerb.
  const aufstellung = useMemo(() => baueUvaAufstellung(summen.map(s => ({
    typ: s.typ,
    ust_kennzeichen: (s.ust_kennzeichen ?? 'normal') as UstKennzeichen,
    vat_rate: Number(s.vat_rate),
    bemessungsgrundlage: Number(s.bemessungsgrundlage),
    steuer: Number(s.steuer),
  }))), [summen]);

  // Für die gespeicherte tax_returns-Zeile weiterhin die Aufteilung
  // nach Steuersatz – das Formular kennt nur diese Felder.
  const uvaData = useMemo(() => {
    const alsBuchungen: UVATransaction[] = summen.map(s => ({
      type: s.typ,
      amount_net: Number(s.bemessungsgrundlage),
      vat_rate: Number(s.vat_rate),
      vat_amount: Number(s.steuer),
    }));
    return calculateUVA(alsBuchungen);
  }, [summen]);

  const anzahlBuchungen = useMemo(
    () => summen.reduce((s, z) => s + Number(z.anzahl), 0),
    [summen],
  );

  const existingRow = taxReturns.find(tr => tr.period_year === year && tr.period_month === periodMonth) ?? null;
  const isSubmitted = existingRow?.status === 'submitted';

  const periodenMitStatus = useMemo(() => {
    const nums = isQuarterly ? [1, 2, 3, 4] : Array.from({ length: 12 }, (_, i) => i + 1);
    return nums.map(n => {
      const pm = isQuarterly ? n * 3 : n;
      const row = taxReturns.find(tr => tr.period_year === year && tr.period_month === pm);
      return { n, submitted: row?.status === 'submitted' };
    });
  }, [isQuarterly, taxReturns, year]);

  const periodLabel = isQuarterly ? `Q${periodNum} ${year}` : `${MONATE[periodNum - 1]} ${year}`;

  const faelligkeit = useMemo(() => {
    if (isQuarterly) return QUARTAL_FAELLIGKEIT[periodNum];
    let dueMonth = periodNum + 2;
    let dueYear = year;
    if (dueMonth > 12) { dueMonth -= 12; dueYear += 1; }
    return `15. ${MONATE[dueMonth - 1]}${dueYear !== year ? ` ${dueYear}` : ''}`;
  }, [isQuarterly, periodNum, year]);

  function handlePrint() {
    const params = isQuarterly ? `year=${year}&quarter=${periodNum}` : `year=${year}&month=${periodNum}`;
    window.open(`/uva/drucken?${params}`, '_blank');
  }

  async function handleBerechnen() {
    setSaving(true);
    setError('');
    const { error: upsertError } = await supabase
      .from('tax_returns')
      .upsert({
        client_id:    clientId,
        period_year:  year,
        period_month: periodMonth,
        tax_base_20:  uvaData.ustByRate[20].bemessungsgrundlage,
        tax_base_13:  uvaData.ustByRate[13].bemessungsgrundlage,
        tax_base_10:  uvaData.ustByRate[10].bemessungsgrundlage,
        tax_base_0:   uvaData.ustByRate[0].bemessungsgrundlage,
        vat_20:       uvaData.ustByRate[20].steuer,
        vat_13:       uvaData.ustByRate[13].steuer,
        vat_10:       uvaData.ustByRate[10].steuer,
        input_tax:    uvaData.totalVSt,
        vat_payable:  uvaData.zahllast,
        status:       'draft',
      }, { onConflict: 'client_id,period_year,period_month' });

    if (upsertError) {
      setError(`Fehler: ${upsertError.message}`);
    } else {
      router.refresh();
    }
    setSaving(false);
  }

  async function handleUebermitteln() {
    if (!existingRow) return;
    const ok = confirm(
      `UVA-Meldung ${periodLabel} als übermittelt markieren? Dies ist nicht rückgängig zu machen und sperrt alle Buchungen dieses Zeitraums gegen weitere Änderungen.`
    );
    if (!ok) return;
    setSubmitting(true);
    setError('');
    const { error: rpcError } = await supabase.rpc('uva_uebermitteln', { p_tax_return_id: existingRow.id });
    if (rpcError) {
      setError(`Fehler: ${rpcError.message}`);
    } else {
      router.refresh();
    }
    setSubmitting(false);
  }

  if (!vatLiable) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-[#35609E] mb-2">UVA-Meldung</h1>
        <p className="text-gray-500 text-sm mb-6">{companyName}</p>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <Info size={32} strokeWidth={1.5} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600">
            Dieses Unternehmen ist laut Einstellungen <strong>nicht umsatzsteuerpflichtig</strong> (Kleinunternehmerregelung).
          </p>
          <p className="text-sm text-gray-400 mt-2">UVA-Meldungen sind daher nicht erforderlich.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#35609E]">Umsatzsteuervoranmeldung</h1>
          <p className="text-gray-500 text-sm">{companyName}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handlePrint}
            title="UVA als PDF drucken / speichern"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border-2 border-[#35609E] text-[#35609E] hover:bg-[#35609E] hover:text-white transition-colors"
          >
            <Printer size={15} strokeWidth={2} />
            PDF / Drucken
          </button>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#35609E]/20"
          >
            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Zeitraum-Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {periodenMitStatus.map(({ n, submitted }) => (
          <button
            key={n}
            onClick={() => setPeriodNum(n)}
            className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              periodNum === n
                ? 'bg-[#35609E] text-white shadow-sm'
                : 'bg-white text-gray-500 border border-gray-200 hover:border-[#35609E]/30 hover:text-[#35609E]'
            }`}
          >
            {submitted && <Lock size={12} strokeWidth={2} />}
            {isQuarterly ? `Q${n}` : MONATE[n - 1]}
          </button>
        ))}
      </div>

      {/* Status-Banner */}
      <div className={`rounded-xl px-5 py-3 mb-6 flex items-center gap-3 border ${
        isSubmitted ? 'bg-gray-50 border-gray-200' : 'bg-amber-50 border-amber-200'
      }`}>
        {isSubmitted ? (
          <>
            <Lock size={18} strokeWidth={2} className="text-gray-400 flex-shrink-0" />
            <div>
              <span className="text-sm font-semibold text-gray-700">Übermittelt</span>
              {formatDateTime(existingRow?.submitted_at ?? null) && (
                <span className="text-sm text-gray-500 ml-2">am {formatDateTime(existingRow!.submitted_at)}</span>
              )}
              <span className="text-sm text-gray-400 ml-2">· Buchungen dieses Zeitraums sind gesperrt</span>
            </div>
          </>
        ) : (
          <>
            <CalendarClock size={18} strokeWidth={2} className="text-amber-500 flex-shrink-0" />
            <div>
              <span className="text-sm font-semibold text-amber-800">Fälligkeit {periodLabel}:</span>
              <span className="text-sm text-amber-700 ml-2">{faelligkeit}</span>
              {existingRow && (
                <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Entwurf gespeichert</span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Berechnen / Übermitteln */}
      {!isSubmitted && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6 flex flex-wrap items-center gap-3 justify-between">
          <p className="text-xs text-gray-500 max-w-md">
            Berechnet USt und VSt aus den Buchungen dieses Zeitraums und speichert die Meldung als Entwurf
            (kann beliebig oft wiederholt werden, solange sie nicht übermittelt ist).
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBerechnen}
              disabled={saving || ladeSummen || anzahlBuchungen === 0}
              className="inline-flex items-center gap-1.5 bg-[#35609E] hover:bg-[#4F90E8] text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} strokeWidth={2} className="animate-spin" /> : <Calculator size={14} strokeWidth={2} />}
              Berechnen &amp; Speichern
            </button>
            {existingRow && (
              <button
                onClick={handleUebermitteln}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 bg-white border-2 border-income text-income hover:bg-income hover:text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {submitting ? <Loader2 size={14} strokeWidth={2} className="animate-spin" /> : <Send size={14} strokeWidth={2} />}
                Als übermittelt markieren
              </button>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg mb-6">{error}</p>}

      {/* Keine Buchungen */}
      {ladeSummen ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center text-gray-400 text-sm">
          Summen werden geladen…
        </div>
      ) : ladeFehler ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-700">
          {ladeFehler}
        </div>
      ) : anzahlBuchungen === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center">
          <Inbox size={32} strokeWidth={1.5} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Keine Buchungen im {periodLabel} vorhanden.</p>
        </div>
      ) : (
        <div className="space-y-5">
          <UVATable
            title="1. Umsätze (Kz 000)"
            subtitle="Ausgangsleistungen / Einnahmen"
            color="blue"
            rows={[
              ...aufstellung.umsatz.map(z => ({
                label: `${z.label} (Kz ${z.kz})`,
                bgl: z.bemessungsgrundlage,
                steuer: z.steuer,
                rate: 0,
              })),
            ]}
            total={aufstellung.umsatz.reduce((s, z) => s + z.steuer, 0)}
            totalLabel={`Summe Bemessungsgrundlagen (Kz 000): ${formatEur(aufstellung.gesamtBemessungsgrundlage)} · Umsatzsteuer`}
          />

          {aufstellung.erwerb.length > 0 && (
            <UVATable
              title="2. Innergemeinschaftliche Erwerbe und Steuerschuld gemäß § 19"
              subtitle="Erwerbsteuer – im selben Zeitraum als Vorsteuer abziehbar"
              color="blue"
              rows={aufstellung.erwerb.map(z => ({
                label: `${z.label} (Kz ${z.kz})`,
                bgl: z.bemessungsgrundlage,
                steuer: z.steuer,
                rate: 0,
              }))}
              total={aufstellung.erwerb.reduce((s, z) => s + z.steuer, 0)}
              totalLabel="Geschuldete Erwerb- bzw. Reverse-Charge-Steuer"
            />
          )}

          <UVATable
            title={`${aufstellung.erwerb.length > 0 ? '3' : '2'}. Abziehbare Vorsteuer (Kz 060)`}
            subtitle="Eingangsleistungen / Ausgaben"
            color="teal"
            rows={aufstellung.vorsteuer.map(z => ({
              label: `${z.label} (Kz ${z.kz})`,
              bgl: z.bemessungsgrundlage,
              steuer: z.steuer,
              rate: 0,
            }))}
            total={aufstellung.gesamtVorsteuer}
            totalLabel="Gesamtbetrag der abziehbaren Vorsteuer"
          />

          <ZahllastCard
            zahllast={aufstellung.zahllast}
            totalUSt={aufstellung.gesamtUst}
            totalVSt={aufstellung.gesamtVorsteuer}
            periodLabel={periodLabel}
          />
        </div>
      )}

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
  title: string; subtitle: string; color: 'blue' | 'teal'; rows: RowData[]; total: number; totalLabel: string;
}) {
  const headerColor = color === 'blue' ? 'bg-[#35609E]' : 'bg-[#00897B]';
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
              <tr><td colSpan={3} className="px-5 py-4 text-center text-gray-400 text-sm">Keine Buchungen in diesem Zeitraum</td></tr>
            ) : (
              activeRows.map(row => (
                <tr key={row.label} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-5 py-3 text-gray-700">{row.label}</td>
                  <td className="px-5 py-3 text-right text-gray-700 font-mono text-sm">{formatEur(row.bgl)}</td>
                  <td className="px-5 py-3 text-right font-mono text-sm">
                    {row.rate === 0 ? <span className="text-gray-400">–</span> : <span className="text-gray-900 font-medium">{formatEur(row.steuer)}</span>}
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

/* ── Zahllast-Karte (Kz 095) ───────────────────────────────────────── */
function ZahllastCard({
  zahllast, totalUSt, totalVSt, periodLabel,
}: {
  zahllast: number; totalUSt: number; totalVSt: number; periodLabel: string;
}) {
  const isGutschrift = zahllast < 0;
  const bgColor = isGutschrift ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200';
  const labelColor = isGutschrift ? 'text-emerald-700' : 'text-red-700';
  const valueColor = isGutschrift ? 'text-emerald-800' : 'text-red-800';

  return (
    <div className={`rounded-2xl border ${bgColor} p-6`}>
      <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-4">Ergebnis {periodLabel} (Kz 095)</h2>
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
          <p className={`inline-flex items-center gap-1.5 text-xs font-semibold mb-0.5 uppercase tracking-wider ${labelColor}`}>
            {isGutschrift ? <CheckCircle2 size={13} strokeWidth={2.5} /> : <AlertTriangle size={13} strokeWidth={2.5} />}
            {isGutschrift ? 'Gutschrift' : 'Zahllast'}
          </p>
          <p className={`text-2xl font-black font-mono ${valueColor}`}>{formatEur(Math.abs(zahllast))}</p>
          {isGutschrift && <p className="text-xs text-emerald-600 mt-1">Erstattung durch das Finanzamt</p>}
        </div>
      </div>
    </div>
  );
}
