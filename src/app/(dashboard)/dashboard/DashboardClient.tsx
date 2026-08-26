'use client';

// Dashboard – Design-Review Welle 3: Fokus auf den AKTUELLEN MONAT plus
// eine Aufgabenliste mit konkreter nächster Aktion (Muster M2: kein
// Zustand ohne Ausweg). Die Jahres-/Monatstabelle lebt auf
// /monatsuebersicht, das Jahr wird hier nicht mehr gewählt.

import { useMemo } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, FileText, Landmark, Plus, Receipt } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { offeneUvaPerioden, type EingereichtePeriode } from '@/lib/steuer/uva-faelligkeit';

const MONATE = [
  'Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

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

type Aufgabe = {
  key: string;
  icon: 'ueberfaellig' | 'uva' | 'entwurf' | 'faellig';
  text: string;
  detail?: string;
  href: string;
  cta: string;
  dringend: boolean;
};

export default function DashboardClient({
  companyName,
  monatssummen,
  openInvoices,
  openIncoming,
  draftCount,
  vatLiable,
  vatPeriod,
  taxReturns,
  betriebsbeginn,
}: {
  companyName: string;
  monatssummen: Monatssumme[];
  openInvoices: OpenInvoice[];
  openIncoming: OpenIncoming[];
  draftCount: number;
  vatLiable: boolean;
  vatPeriod: 'monthly' | 'quarterly';
  taxReturns: EingereichtePeriode[];
  betriebsbeginn: string | null;
}) {
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const jahr  = today.getFullYear();
  const monat = today.getMonth() + 1;

  // ── Kennzahlen: aktueller Monat + Vormonat als Bezug ──────────────
  const vmJahr  = monat === 1 ? jahr - 1 : jahr;
  const vmMonat = monat === 1 ? 12 : monat - 1;

  const summe = (j: number, m: number) =>
    monatssummen.find(z => Number(z.jahr) === j && Number(z.monat) === m);

  const dm = summe(jahr, monat);
  const vm = summe(vmJahr, vmMonat);

  const kpi = {
    einnahmen: Number(dm?.einnahmen ?? 0),
    ausgaben:  Number(dm?.ausgaben  ?? 0),
    ust:       Number(dm?.ust ?? 0) - Number(dm?.vst ?? 0),
  };
  const kpiVm = {
    einnahmen: Number(vm?.einnahmen ?? 0),
    ausgaben:  Number(vm?.ausgaben  ?? 0),
    ust:       Number(vm?.ust ?? 0) - Number(vm?.vst ?? 0),
  };
  const saldo   = kpi.einnahmen - kpi.ausgaben;
  const saldoVm = kpiVm.einnahmen - kpiVm.ausgaben;

  // ── Offene Posten ─────────────────────────────────────────────────
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

  // Demnächst fällig: offen, noch nicht überfällig, in den nächsten 7 Tagen
  const baldFaellig = useMemo(() => {
    const in7 = new Date(today); in7.setDate(in7.getDate() + 7);
    const zaehle = (due: string) => { const d = new Date(due); return d >= today && d <= in7; };
    const out = openInvoices.filter(i => zaehle(i.due_date));
    const inc = openIncoming.filter(i => zaehle(i.due_date));
    return {
      count: out.length + inc.length,
      total: out.reduce((s, i) => s + Number(i.total_gross), 0)
           + inc.reduce((s, i) => s + Number(i.amount_gross), 0),
    };
  }, [openInvoices, openIncoming, today]);

  // ── Aufgabenliste ─────────────────────────────────────────────────
  const aufgaben = useMemo<Aufgabe[]>(() => {
    const liste: Aufgabe[] = [];

    const outUeberfaellig = overdueRows.filter(r => r.kind === 'out');
    if (outUeberfaellig.length > 0) {
      liste.push({
        key: 'out-ueberfaellig',
        icon: 'ueberfaellig',
        text: outUeberfaellig.length === 1
          ? '1 Ausgangsrechnung ist überfällig'
          : `${outUeberfaellig.length} Ausgangsrechnungen sind überfällig`,
        detail: formatCurrency(outUeberfaellig.reduce((s, r) => s + r.amount, 0)),
        href: '/offene-posten',
        cta: 'Offene Posten',
        dringend: true,
      });
    }

    const inUeberfaellig = overdueRows.filter(r => r.kind === 'in');
    if (inUeberfaellig.length > 0) {
      liste.push({
        key: 'in-ueberfaellig',
        icon: 'ueberfaellig',
        text: inUeberfaellig.length === 1
          ? '1 Eingangsrechnung ist zu bezahlen (überfällig)'
          : `${inUeberfaellig.length} Eingangsrechnungen sind zu bezahlen (überfällig)`,
        detail: formatCurrency(inUeberfaellig.reduce((s, r) => s + r.amount, 0)),
        href: '/offene-posten',
        cta: 'Offene Posten',
        dringend: true,
      });
    }

    if (vatLiable) {
      for (const p of offeneUvaPerioden(today, vatPeriod, taxReturns, undefined, betriebsbeginn)) {
        const ueberfaellig = p.tageBisFaellig < 0;
        const knapp = p.tageBisFaellig >= 0 && p.tageBisFaellig <= 7;
        liste.push({
          key: `uva-${p.jahr}-${p.periodMonth}`,
          icon: 'uva',
          text: `UVA ${p.label} einreichen`,
          detail: ueberfaellig
            ? `war am ${p.faelligAm.toLocaleDateString('de-AT')} fällig`
            : `fällig am ${p.faelligAm.toLocaleDateString('de-AT')}`,
          href: '/uva',
          cta: 'Zur UVA',
          dringend: ueberfaellig || knapp,
        });
      }
    }

    if (draftCount > 0) {
      liste.push({
        key: 'entwuerfe',
        icon: 'entwurf',
        text: draftCount === 1
          ? '1 Rechnungsentwurf fertigstellen'
          : `${draftCount} Rechnungsentwürfe fertigstellen`,
        href: '/rechnungen',
        cta: 'Fakturierung',
        dringend: false,
      });
    }

    if (baldFaellig.count > 0) {
      liste.push({
        key: 'bald-faellig',
        icon: 'faellig',
        text: baldFaellig.count === 1
          ? '1 Rechnung wird in den nächsten 7 Tagen fällig'
          : `${baldFaellig.count} Rechnungen werden in den nächsten 7 Tagen fällig`,
        detail: formatCurrency(baldFaellig.total),
        href: '/offene-posten',
        cta: 'Offene Posten',
        dringend: false,
      });
    }

    // Dringendes zuerst, Reihenfolge innerhalb der Gruppen bleibt stabil
    return [...liste.filter(a => a.dringend), ...liste.filter(a => !a.dringend)];
  }, [overdueRows, vatLiable, vatPeriod, taxReturns, betriebsbeginn, draftCount, baldFaellig, today]);

  const AUFGABEN_ICONS = {
    ueberfaellig: <AlertTriangle size={18} strokeWidth={2} />,
    uva:          <Landmark size={18} strokeWidth={2} />,
    entwurf:      <FileText size={18} strokeWidth={2} />,
    faellig:      <Receipt size={18} strokeWidth={2} />,
  } as const;

  const zeigeUeberfaellige = overdueRows.slice(0, 6);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Kopfzeile mit direkter nächster Aktion */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand">{companyName}</h1>
          <p className="text-gray-500 text-sm">{MONATE[monat - 1]} {jahr}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/rechnungen/neu"
            className="px-4 py-2 text-sm border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
          >
            Rechnung schreiben
          </Link>
          <Link
            href="/buchungen/neu"
            className="px-4 py-2 text-sm bg-brand text-white rounded-lg hover:bg-accent transition-colors font-medium inline-flex items-center gap-1.5"
          >
            <Plus size={16} strokeWidth={2.5} />
            Buchung erfassen
          </Link>
        </div>
      </div>

      {/* Kennzahlen: aktueller Monat, Vormonat als Bezugsgröße */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Einnahmen im Monat</p>
          <p className="text-2xl font-bold text-income tabular-nums">{formatCurrency(kpi.einnahmen)}</p>
          <p className="text-xs text-gray-400 mt-1 tabular-nums">Vormonat: {formatCurrency(kpiVm.einnahmen)}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Ausgaben im Monat</p>
          <p className="text-2xl font-bold text-expense tabular-nums">{formatCurrency(kpi.ausgaben)}</p>
          <p className="text-xs text-gray-400 mt-1 tabular-nums">Vormonat: {formatCurrency(kpiVm.ausgaben)}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Saldo im Monat</p>
          <p className={`text-2xl font-bold tabular-nums ${saldo >= 0 ? 'text-income' : 'text-expense'}`}>
            {formatCurrency(Math.abs(saldo))}
          </p>
          <p className="text-xs text-gray-400 mt-1 tabular-nums">Vormonat: {formatCurrency(Math.abs(saldoVm))}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">USt-Saldo im Monat</p>
          <p className={`text-2xl font-bold tabular-nums ${kpi.ust >= 0 ? 'text-expense' : 'text-income'}`}>
            {formatCurrency(Math.abs(kpi.ust))}
          </p>
          <p className="text-xs text-gray-400 mt-1 tabular-nums">Vormonat: {formatCurrency(Math.abs(kpiVm.ust))}</p>
        </div>
      </div>

      {/* Offene Posten kompakt */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Link href="/offene-posten" className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm hover:border-accent/40 transition-colors block">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Offene Ausgangsrechnungen</p>
          <p className="text-2xl font-bold text-brand tabular-nums">{outOpenCount > 0 ? formatCurrency(outOpenTotal) : '—'}</p>
          <p className="text-xs text-gray-400 mt-1">{outOpenCount} {outOpenCount === 1 ? 'Rechnung' : 'Rechnungen'} offen</p>
        </Link>
        <Link href="/offene-posten" className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm hover:border-accent/40 transition-colors block">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Offene Eingangsrechnungen</p>
          <p className="text-2xl font-bold text-brand tabular-nums">{inOpenCount > 0 ? formatCurrency(inOpenTotal) : '—'}</p>
          <p className="text-xs text-gray-400 mt-1">{inOpenCount} {inOpenCount === 1 ? 'Rechnung' : 'Rechnungen'} offen</p>
        </Link>
      </div>

      {/* Aufgaben – jede Zeile hat eine nächste Aktion */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-4">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Aufgaben</h2>
        </div>
        {aufgaben.length === 0 ? (
          <div className="px-6 py-8 text-center">
            <CheckCircle2 size={28} strokeWidth={1.75} className="mx-auto text-income mb-2" />
            <p className="text-sm text-gray-600 font-medium">Alles erledigt – keine Aufgaben offen.</p>
            <p className="text-xs text-gray-400 mt-1">
              Neue Belege kannst du jederzeit unter{' '}
              <Link href="/buchungen/neu" className="text-brand hover:underline">Buchung erfassen</Link> eintragen.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {aufgaben.map(a => (
              <li key={a.key} className="flex items-center gap-3 px-6 py-3.5">
                <span className={`flex-shrink-0 ${a.dringend ? 'text-expense' : 'text-gray-400'}`}>
                  {AUFGABEN_ICONS[a.icon]}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-gray-700">{a.text}</span>
                  {a.detail && <span className="block text-xs text-gray-400 tabular-nums">{a.detail}</span>}
                </span>
                <Link
                  href={a.href}
                  className={`flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    a.dringend
                      ? 'border-expense/30 text-expense hover:bg-expense/5'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {a.cta}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Überfällige Rechnungen im Detail */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            {overdueRows.length > 0 && <AlertTriangle size={16} strokeWidth={2} className="text-expense" />}
            Überfällige Rechnungen
          </h2>
          <Link href="/offene-posten" className="text-xs text-brand hover:text-accent font-medium hover:underline">
            Alle offenen Posten →
          </Link>
        </div>
        {overdueRows.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p className="text-sm">Keine überfälligen Rechnungen</p>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-gray-50">
              {zeigeUeberfaellige.map(r => {
                const days = Math.floor((today.getTime() - new Date(r.dueDate).getTime()) / 86400000);
                return (
                  <li key={`${r.kind}-${r.id}`} className="flex items-center gap-3 px-6 py-3">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                      r.kind === 'out' ? 'bg-income/10 text-income' : 'bg-expense/10 text-expense'
                    }`}>
                      {r.kind === 'out' ? 'Ausgang' : 'Eingang'}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-gray-700 truncate">{r.label}</span>
                      <span className="block text-xs text-expense">{days} {days === 1 ? 'Tag' : 'Tage'} überfällig</span>
                    </span>
                    <span className="text-sm font-medium text-gray-800 flex-shrink-0 text-right tabular-nums">{formatCurrency(r.amount)}</span>
                  </li>
                );
              })}
            </ul>
            {overdueRows.length > zeigeUeberfaellige.length && (
              <div className="px-6 py-3 border-t border-gray-50 text-center">
                <Link href="/offene-posten" className="text-xs text-brand hover:underline">
                  + {overdueRows.length - zeigeUeberfaellige.length} weitere anzeigen
                </Link>
              </div>
            )}
          </>
        )}
      </div>

      {/* Auswertung */}
      <div className="text-right">
        <Link href="/monatsuebersicht" className="text-sm text-brand hover:underline underline-offset-2">
          Zur Monatsübersicht →
        </Link>
      </div>
    </div>
  );
}
