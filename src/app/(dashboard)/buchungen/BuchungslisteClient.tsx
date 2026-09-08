'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/utils';
import { Badge, Button, Card, Td, Th, Tr } from '@/components/ui';
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
  categories: { name: string; konto_nr?: string | null } | null;
};

/** Belegnummer wie im BMD-Export – die Klammer zum Papierbeleg. */
const belegNr = (t: { beleg_jahr: number | null; beleg_nr: number | null }) =>
  // Kurzform B-1, B-2 … – klar von Rechnungsnummern (AR-001/26)
  // unterscheidbar. Volle Form (2026/00001) traegt der BMD-Export.
  t.beleg_nr == null ? '—' : `B-${t.beleg_nr}`;

const MONTHS = ['Alle','Jän','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

export default function BuchungslisteClient({
  transactions,
  anlageJeBuchung = {},
  year,
  availableYears,
}: {
  transactions: Transaction[];
  /** Buchungs-ID → Anlagen-ID (verknüpfte Anschaffungen, Welle 7b) */
  anlageJeBuchung?: Record<string, string>;
  year: number;
  availableYears: number[];
}) {
  const istAnlagenkauf = (t: Transaction) => t.type === 'expense' && (t.categories?.konto_nr ?? '').startsWith('0');
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
      <Card className="p-3 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-1">
          <button onClick={() => setFilterYear(availableYears[availableYears.indexOf(year) + 1] ?? year)}
            disabled={year === availableYears[availableYears.length - 1]}
            aria-label="Früheres Jahr"
            className="w-7 h-7 flex items-center justify-center rounded-md border border-line-2 text-ink-2 hover:bg-row hover:text-navy disabled:opacity-30 transition-colors">
            <ChevronLeft size={14} strokeWidth={2} />
          </button>
          <span className="num font-semibold text-navy w-12 text-center text-[13.5px]">{year}</span>
          <button onClick={() => setFilterYear(availableYears[availableYears.indexOf(year) - 1] ?? year)}
            disabled={year === availableYears[0]}
            aria-label="Späteres Jahr"
            className="w-7 h-7 flex items-center justify-center rounded-md border border-line-2 text-ink-2 hover:bg-row hover:text-navy disabled:opacity-30 transition-colors">
            <ChevronRight size={14} strokeWidth={2} />
          </button>
        </div>
        <div className="flex items-center">
          <label htmlFor="buchungslisteClient-0" className="text-[13px] text-ink-2 font-medium mr-2">Monat</label>
          <select id="buchungslisteClient-0"
            value={filterMonth}
            onChange={e => setFilterMonth(Number(e.target.value))}
            className="border border-line-2 rounded-md px-2.5 py-1.5 text-[13px] text-ink focus:outline-hidden focus:border-signal"
          >
            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
        </div>
        <div className="flex gap-1 p-0.5 rounded-lg bg-well">
          {(['all','income','expense'] as const).map(t => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[13px] font-medium transition-colors ${
                filterType === t
                  ? 'bg-card text-navy border border-line-2'
                  : 'text-ink-2 hover:text-navy border border-transparent'
              }`}
            >
              {t === 'income' && <ArrowUpCircle size={14} strokeWidth={2} />}
              {t === 'expense' && <ArrowDownCircle size={14} strokeWidth={2} />}
              {t === 'all' ? 'Alle' : t === 'income' ? 'Einnahmen' : 'Ausgaben'}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="font-mono text-[11px] text-ink-3">
            {filtered.length} Buchung{filtered.length !== 1 ? 'en' : ''}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExport}
            disabled={filtered.length === 0}
            title="Gefilterte Buchungen als CSV exportieren"
          >
            <Download size={14} strokeWidth={2} /> CSV
          </Button>
        </div>
      </Card>

      {/* Tabelle */}
      <Card padded={false} className="overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-ink-3 flex flex-col items-center gap-2">
            <Inbox size={32} strokeWidth={1.5} />
            <p className="text-sm">Keine Buchungen gefunden</p>
          </div>
        ) : (
          <>
            {/* Mobile: Kartenliste statt breiter Tabelle (Welle 3) */}
            <ul className="md:hidden divide-y divide-line">
              {filtered.map(t => (
                <li key={t.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink truncate">
                        {t.categories?.name ?? '—'}
                      </p>
                      <p className="text-[12.5px] text-ink-2 truncate">
                        {t.is_private && <span className="font-semibold">Privat · </span>}
                        {t.is_eauto && <span className="font-semibold text-info">E-Auto · </span>}
                        {istAnlagenkauf(t) && (anlageJeBuchung[t.id]
                          ? <Link href={`/anlagen/${anlageJeBuchung[t.id]}`} className="font-semibold text-good">Anlage · </Link>
                          : <Link href={`/anlagen/neu?buchung=${t.id}`} className="font-semibold text-warn">Anlage anlegen · </Link>)}
                        {t.description ?? '—'}
                      </p>
                      <p className="num text-[11px] text-ink-3 mt-0.5">
                        {new Date(t.booking_date).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        {' · '}{belegNr(t)}{' · '}{t.vat_rate} % USt
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`num text-sm font-semibold ${t.type === 'income' ? 'text-navy' : 'text-ink-2'}`}>
                        {formatCurrency(Number(t.amount_gross))}
                      </p>
                      <Badge tone={t.type === 'income' ? 'navy' : 'gray'} className="mt-1">
                        {t.type === 'income' ? 'Einnahme' : 'Ausgabe'}
                      </Badge>
                    </div>
                  </div>
                  {!t.is_locked ? (
                    <div className="flex justify-end gap-2 mt-2">
                      <Button href={`/buchungen/${t.id}/bearbeiten`} variant="ghost" size="sm">
                        <Pencil size={13} strokeWidth={2} />
                        Bearbeiten
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => handleDelete(t.id)} disabled={deletingId === t.id}>
                        <X size={13} strokeWidth={2} />
                        Löschen
                      </Button>
                    </div>
                  ) : (
                    <p className="flex items-center justify-end gap-1 mt-2 font-mono text-[11px] text-ink-3">
                      <Lock size={11} strokeWidth={2} /> Gesperrt – UVA bereits übermittelt
                    </p>
                  )}
                </li>
              ))}
            </ul>

            <table className="w-full min-w-[820px] text-sm hidden md:table">
              <thead>
                <tr>
                  <Th>Beleg-Nr</Th>
                  <Th>Datum</Th>
                  <Th>Kategorie</Th>
                  <Th>Beschreibung</Th>
                  <Th num>Netto</Th>
                  <Th num>Brutto</Th>
                  <Th className="text-center">Typ</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <Tr key={t.id}>
                    <Td
                      className="num text-[12px] text-ink-3 whitespace-nowrap"
                      title={t.beleg_nr == null ? undefined : `Beleg ${t.beleg_jahr}/${String(t.beleg_nr).padStart(5, '0')} – so steht er auch im BMD-Export`}
                    >
                      {belegNr(t)}
                    </Td>
                    <Td className="num text-[13px] text-ink-2 whitespace-nowrap">
                      {new Date(t.booking_date).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </Td>
                    <Td className="text-ink font-medium">
                      {t.categories?.name ?? '—'}
                    </Td>
                    <Td className="text-ink-2 max-w-[260px]">
                      <div className="flex items-center gap-1.5">
                        {t.is_private && (
                          <Badge tone="gray" title="Privat – zählt nicht in UVA, Dashboard und BMD-Export">Privat</Badge>
                        )}
                        {t.is_eauto && (
                          <Badge tone="info" title="E-Auto – Vorsteuer auf die Angemessenheitsgrenze gedeckelt">E-Auto</Badge>
                        )}
                        {istAnlagenkauf(t) && (anlageJeBuchung[t.id]
                          ? <Link href={`/anlagen/${anlageJeBuchung[t.id]}`} title="Im Anlagenverzeichnis öffnen"><Badge tone="good">Anlage</Badge></Link>
                          : <Link href={`/anlagen/neu?buchung=${t.id}`} title="Anschaffung ins Anlagenverzeichnis aufnehmen"><Badge tone="warn">Anlage anlegen</Badge></Link>)}
                        <span className="truncate">{t.description ?? '—'}</span>
                      </div>
                    </Td>
                    <Td num className="text-ink-2 whitespace-nowrap">
                      {formatCurrency(Number(t.amount_net))}
                      <span className="block text-[11px] text-ink-3">{t.vat_rate} % USt</span>
                    </Td>
                    <Td num className={`font-semibold whitespace-nowrap ${t.type === 'income' ? 'text-navy' : 'text-ink-2'}`}>
                      {formatCurrency(Number(t.amount_gross))}
                    </Td>
                    <Td className="text-center">
                      {/* Token-Farben statt Ampel (Design-Review M1) */}
                      <Badge tone={t.type === 'income' ? 'navy' : 'gray'}>
                        {t.type === 'income' ? 'Einnahme' : 'Ausgabe'}
                      </Badge>
                    </Td>
                    <Td className="text-right">
                      {/* Aktionen mit Text statt reiner Icons (Design-Review Welle 3) */}
                      {!t.is_locked && (
                        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                          <Button href={`/buchungen/${t.id}/bearbeiten`} variant="ghost" size="sm">
                            <Pencil size={13} strokeWidth={2} />
                            Bearbeiten
                          </Button>
                          <Button variant="danger" size="sm" onClick={() => handleDelete(t.id)} disabled={deletingId === t.id}>
                            <X size={13} strokeWidth={2} />
                            Löschen
                          </Button>
                        </div>
                      )}
                      {t.is_locked && (
                        <span className="font-mono text-[11px] text-ink-3 inline-flex items-center gap-1 whitespace-nowrap" title="Gesperrt – UVA bereits übermittelt">
                          <Lock size={13} strokeWidth={2} /> Gesperrt
                        </span>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </table>

            {/* Summenzeile */}
            <div className="border-t border-line-2 bg-row px-4 py-3 flex flex-wrap justify-end gap-x-8 gap-y-1 text-[13px]">
              <span className="text-ink-2">Einnahmen <span className="num font-semibold text-navy ml-1">{formatCurrency(totalIncome)}</span></span>
              <span className="text-ink-2">Ausgaben <span className="num font-semibold text-ink-2 ml-1">{formatCurrency(totalExpense)}</span></span>
              <span className="text-ink-2">Saldo <span className={`num font-semibold ml-1 ${totalIncome - totalExpense >= 0 ? 'text-navy' : 'text-crit'}`}>
                {totalIncome - totalExpense < 0 && '−'}{formatCurrency(Math.abs(totalIncome - totalExpense))}
              </span></span>
            </div>

            {filtered.some(t => t.is_private) && (
              <p className="px-4 py-2 text-[12px] text-ink-3 border-t border-line">
                Die Summen oben enthalten auch als <strong>Privat</strong> gekennzeichnete Buchungen.
                In UVA, Dashboard und BMD-Export bleiben diese unberücksichtigt.
              </p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
