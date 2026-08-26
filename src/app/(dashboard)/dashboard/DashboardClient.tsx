'use client';

// Dashboard – Design-Review Welle 3: Fokus auf den AKTUELLEN MONAT plus
// eine Aufgabenliste mit konkreter nächster Aktion (Muster M2: kein
// Zustand ohne Ausweg). Die Jahres-/Monatstabelle lebt auf
// /monatsuebersicht, das Jahr wird hier nicht mehr gewählt.

import { useMemo } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, FileText, Landmark, Plus, Receipt } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Tile } from '@/components/ui';
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
  const dringende = aufgaben.filter(a => a.dringend).length;

  return (
    <div className="px-6 py-7 pb-16 max-w-6xl mx-auto">
      {/* Kopfzeile mit direkter nächster Aktion */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-navy tracking-[-0.01em] truncate">{companyName}</h1>
          <p className="text-ink-2 text-[14.5px] mt-1">
            {MONATE[monat - 1]} {jahr}
            {aufgaben.length > 0 && (
              <> · {aufgaben.length} {aufgaben.length === 1 ? 'Aufgabe' : 'Aufgaben'}{dringende > 0 ? `, ${dringende} dringend` : ''}</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button href="/rechnungen/neu" variant="secondary">Rechnung schreiben</Button>
          <Button href="/buchungen/neu">
            <Plus size={16} strokeWidth={2.5} />
            Buchung erfassen
          </Button>
        </div>
      </div>

      {/* Kennzahlen: aktueller Monat, Vormonat als Bezugsgröße */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile
          label="Einnahmen im Monat"
          value={formatCurrency(kpi.einnahmen)}
          detail={<>Vormonat <span className="num">{formatCurrency(kpiVm.einnahmen)}</span></>}
        />
        <Tile
          label="Ausgaben im Monat"
          tone="ink"
          value={formatCurrency(kpi.ausgaben)}
          detail={<>Vormonat <span className="num">{formatCurrency(kpiVm.ausgaben)}</span></>}
        />
        <Tile
          label="Saldo im Monat"
          tone={saldo >= 0 ? 'navy' : 'ink'}
          value={<>{saldo < 0 && '−'}{formatCurrency(Math.abs(saldo))}</>}
          detail={<>Vormonat <span className="num">{saldoVm < 0 && '−'}{formatCurrency(Math.abs(saldoVm))}</span></>}
        />
        <Tile
          label="USt-Saldo im Monat"
          tone="ink"
          value={formatCurrency(Math.abs(kpi.ust))}
          detail={kpi.ust >= 0 ? 'Zahllast' : 'Gutschrift'}
        />
      </div>

      {/* Offene Posten kompakt */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <Tile
          href="/offene-posten"
          label="Offene Ausgangsrechnungen"
          value={outOpenCount > 0 ? formatCurrency(outOpenTotal) : '—'}
          detail={`${outOpenCount} ${outOpenCount === 1 ? 'Rechnung' : 'Rechnungen'} offen`}
        />
        <Tile
          href="/offene-posten"
          label="Offene Eingangsrechnungen"
          tone="ink"
          value={inOpenCount > 0 ? formatCurrency(inOpenTotal) : '—'}
          detail={`${inOpenCount} ${inOpenCount === 1 ? 'Rechnung' : 'Rechnungen'} offen`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        {/* Aufgaben – jede Zeile hat eine nächste Aktion */}
        <Card padded={false}>
          <CardHeader title="Nächste Schritte" border>
            {aufgaben.length > 0 && <Badge tone={dringende > 0 ? 'warn' : 'gray'}>{aufgaben.length} offen</Badge>}
          </CardHeader>
          {aufgaben.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <CheckCircle2 size={28} strokeWidth={1.75} className="mx-auto text-good mb-2" />
              <p className="text-sm text-ink font-medium">Alles erledigt – keine Aufgaben offen.</p>
              <p className="text-[12.5px] text-ink-3 mt-1">
                Neue Belege kannst du jederzeit unter{' '}
                <Link href="/buchungen/neu" className="text-navy hover:underline">Buchung erfassen</Link> eintragen.
              </p>
            </div>
          ) : (
            <ul>
              {aufgaben.map(a => (
                <li key={a.key} className="flex items-center gap-3 px-5 py-3 border-b border-line last:border-b-0">
                  <span className={`shrink-0 ${a.dringend ? 'text-warn' : 'text-ink-3'}`}>
                    {AUFGABEN_ICONS[a.icon]}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-ink">{a.text}</span>
                    {a.detail && <span className="block text-[12.5px] text-ink-3 num">{a.detail}</span>}
                  </span>
                  {a.dringend && <Badge tone="warn" className="hidden sm:inline-flex">Dringend</Badge>}
                  <Button href={a.href} variant="ghost" size="sm">{a.cta}</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Überfällige Rechnungen im Detail */}
        <Card padded={false}>
          <CardHeader title="Überfällige Rechnungen" border>
            <Link href="/offene-posten" className="text-[12.5px] text-navy font-medium hover:underline underline-offset-2">
              Alle offenen Posten →
            </Link>
          </CardHeader>
          {overdueRows.length === 0 ? (
            <div className="text-center py-8 text-ink-3">
              <p className="text-sm">Keine überfälligen Rechnungen</p>
            </div>
          ) : (
            <>
              <ul>
                {zeigeUeberfaellige.map(r => {
                  const days = Math.floor((today.getTime() - new Date(r.dueDate).getTime()) / 86400000);
                  return (
                    <li key={`${r.kind}-${r.id}`} className="flex items-center gap-3 px-5 py-3 border-b border-line last:border-b-0">
                      <Badge tone={r.kind === 'out' ? 'navy' : 'gray'}>{r.kind === 'out' ? 'Ausgang' : 'Eingang'}</Badge>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm text-ink truncate">{r.label}</span>
                        <span className="block text-[12.5px] text-crit">{days} {days === 1 ? 'Tag' : 'Tage'} überfällig</span>
                      </span>
                      <span className="num text-[13px] font-semibold text-ink shrink-0 text-right">{formatCurrency(r.amount)}</span>
                    </li>
                  );
                })}
              </ul>
              {overdueRows.length > zeigeUeberfaellige.length && (
                <div className="px-5 py-3 border-t border-line text-center">
                  <Link href="/offene-posten" className="text-[12.5px] text-navy hover:underline">
                    + {overdueRows.length - zeigeUeberfaellige.length} weitere anzeigen
                  </Link>
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      {/* Auswertung */}
      <div className="text-right mt-4">
        <Link href="/monatsuebersicht" className="text-[13px] text-navy hover:underline underline-offset-2">
          Zur Monatsübersicht →
        </Link>
      </div>
    </div>
  );
}
