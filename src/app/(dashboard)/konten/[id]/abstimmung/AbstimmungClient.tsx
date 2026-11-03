'use client';

import { useMemo, useState } from 'react';
import { useServerState } from '@/lib/useServerState';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/utils';
import { Check, EyeOff, Eye, ArrowLeftRight, X } from 'lucide-react';
import { meldeFehler } from '@/lib/fehler';

type Row = {
  id: string;
  booking_date: string;
  created_at: string;
  description: string | null;
  type: 'income' | 'expense';
  amount_gross: number;
  is_private: boolean;
  is_reconciled: boolean;
  beleg_jahr: number | null;
  beleg_nr: number | null;
  category: { name: string } | null;
  /** 'buchung' = transactions-Zeile, 'umbuchung' = account_transfers (042) */
  kind: 'buchung' | 'umbuchung';
  /** Nur bei Umbuchungen: Sicht dieses Kontos (out = Quelle, in = Ziel) */
  richtung?: 'out' | 'in';
  gegenkonto?: string;
};

const belegNr = (r: Row) =>
  // Kurzform B-1, B-2 … – klar von Rechnungsnummern (AR-001/26)
  // unterscheidbar. Volle Form (2026/00001) traegt der BMD-Export.
  r.beleg_nr == null ? '—' : `B-${r.beleg_nr}`;

export default function AbstimmungClient({
  accountId, accountName, rows: initialRows, openingBalance, openingDate,
  imEroeffnungssaldo = 0,
}: {
  accountId: string;
  accountName: string;
  rows: Row[];
  openingBalance: number;
  openingDate: string | null;
  /** Bewegungen am oder vor dem Stichtag – stecken im Eröffnungssaldo */
  imEroeffnungssaldo?: number;
}) {
  const supabase = createClient();
  const [rows, setRows] = useServerState(initialRows);
  const [hidePrivate, setHidePrivate] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [fehler, setFehler] = useState('');

  // Chronologisch aufsteigend für den Saldenlauf, danach zur Anzeige
  // wieder neueste zuerst. Zweites Sortierkriterium ist der
  // Anlagezeitpunkt: ohne das stünden Buchungen desselben Tages in
  // beliebiger Reihenfolge, und damit wäre auch der Saldo je Zeile
  // beliebig.
  const withBalance = useMemo(() => {
    const asc = [...rows].sort((a, b) =>
      a.booking_date.localeCompare(b.booking_date)
      || String(a.created_at).localeCompare(String(b.created_at))
      || a.id.localeCompare(b.id)
    );
    // Der Saldenlauf startet auf dem Kontoauszugsstand, nicht bei null.
    let balance = Number(openingBalance) || 0;
    const withRunning: (typeof asc[number] & { balance: number })[] = [];
    for (const r of asc) {
      balance += r.type === 'income' ? Number(r.amount_gross) : -Number(r.amount_gross);
      withRunning.push({ ...r, balance });
    }
    return withRunning.reverse();
  }, [rows, openingBalance]);

  const visible = hidePrivate ? withBalance.filter(r => !r.is_private) : withBalance;
  const endBalance = withBalance[0]?.balance ?? (Number(openingBalance) || 0);
  const openCount = rows.filter(r => !r.is_reconciled).length;

  async function toggleReconciled(row: Row) {
    const { id } = row;
    const current = row.is_reconciled;
    setBusyId(id);
    setFehler('');
    // Umbuchungen haben je Seite ein eigenes Häkchen (Giro- und
    // Kreditkartenauszug werden getrennt geprüft).
    const { error } = row.kind === 'umbuchung'
      ? await supabase.from('account_transfers')
          .update(row.richtung === 'out' ? { is_reconciled_from: !current } : { is_reconciled_to: !current })
          .eq('id', id)
      : await supabase.from('transactions').update({ is_reconciled: !current }).eq('id', id);
    // Vorher wurde ein Fehler stillschweigend verschluckt: das Häkchen
    // erschien, verschwand aber beim nächsten Laden wieder.
    if (!meldeFehler('Abstimmung speichern', error, setFehler)) {
      setRows(prev => prev.map(r => r.id === id ? { ...r, is_reconciled: !current } : r));
    }
    setBusyId(null);
  }

  async function deleteUmbuchung(id: string) {
    if (!confirm('Umbuchung wirklich löschen? Sie verschwindet aus den Abstimmungen beider Konten.')) return;
    setBusyId(id);
    setFehler('');
    const { error } = await supabase.from('account_transfers').delete().eq('id', id);
    if (!meldeFehler('Umbuchung löschen', error, setFehler)) {
      setRows(prev => prev.filter(r => r.id !== id));
    }
    setBusyId(null);
  }

  async function togglePrivate(id: string, current: boolean) {
    setBusyId(id);
    setFehler('');
    const { error } = await supabase.from('transactions').update({ is_private: !current }).eq('id', id);
    if (!meldeFehler('Privatkennzeichen speichern', error, setFehler)) {
      setRows(prev => prev.map(r => r.id === id ? { ...r, is_private: !current } : r));
    }
    setBusyId(null);
  }

  return (
    <div className="space-y-4">
      {fehler && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">{fehler}</p>
      )}

      {openingDate && imEroeffnungssaldo > 0 && (
        <p className="text-sm text-ink-2 bg-row border border-line-2 px-4 py-3 rounded-lg leading-relaxed">
          {imEroeffnungssaldo === 1
            ? 'Eine Bewegung liegt'
            : `${imEroeffnungssaldo} Bewegungen liegen`}{' '}
          am oder vor dem Eröffnungsstichtag ({new Date(openingDate).toLocaleDateString('de-AT')})
          und {imEroeffnungssaldo === 1 ? 'steckt' : 'stecken'} bereits im Eröffnungssaldo –
          sie werden hier nicht einzeln angeführt. Soll auch Aktuelles einzeln
          erscheinen, das Eröffnungsdatum unter{' '}
          <a href={`/konten/${accountId}`} className="font-semibold underline underline-offset-2">
            Konto bearbeiten
          </a>{' '}
          auf den Tag des letzten Kontoauszugs zurücksetzen.
        </p>
      )}

      {!openingDate && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 px-4 py-3 rounded-lg leading-relaxed">
          Für dieses Konto ist kein Eröffnungssaldo hinterlegt. Der Saldo unten
          zählt daher nur die hier erfassten Buchungen und wird mit dem
          Kontoauszug nicht übereinstimmen.{' '}
          <a href={`/konten/${accountId}`} className="font-semibold underline underline-offset-2">
            Jetzt nachtragen
          </a>
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4">
          <p className="label-mono font-medium mb-1">Eröffnungssaldo</p>
          <p className="num text-[22px] font-semibold text-ink">{formatCurrency(Number(openingBalance) || 0)}</p>
          {openingDate && (
            <p className="text-[11px] text-ink-3 mt-0.5">
              per {new Date(openingDate).toLocaleDateString('de-AT')}
            </p>
          )}
        </div>
        <div className="card p-4">
          <p className="label-mono font-medium mb-1">Kontostand rechnerisch</p>
          <p className={`num text-[22px] font-semibold ${endBalance >= 0 ? 'text-navy' : 'text-expense'}`}>{formatCurrency(endBalance)}</p>
        </div>
        <div className="card p-4">
          <p className="label-mono font-medium mb-1">Buchungen</p>
          <p className="num text-[22px] font-semibold text-ink">{rows.length}</p>
        </div>
        <div className="card p-4">
          <p className="label-mono font-medium mb-1">Nicht abgestimmt</p>
          <p className={`num text-[22px] font-semibold ${openCount > 0 ? 'text-amber-600' : 'text-ink'}`}>{openCount}</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-2">{accountName}</p>
        <button
          onClick={() => setHidePrivate(v => !v)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-2 hover:text-navy bg-white border border-line-2 px-3 py-1.5 rounded-lg transition-colors"
        >
          {hidePrivate ? <EyeOff size={13} strokeWidth={2} /> : <Eye size={13} strokeWidth={2} />}
          Privatumsätze {hidePrivate ? 'ausgeblendet' : 'anzeigen'}
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-ink-2 text-sm">Diesem Konto sind noch keine Buchungen zugeordnet.</p>
          <p className="text-ink-3 text-xs mt-1">Buchungen erhalten beim Bank-Import automatisch ein Konto.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="label-mono border-b border-line-2">
                <th className="text-left px-4 py-3">Beleg-Nr</th>
                <th className="text-left px-4 py-3">Datum</th>
                <th className="text-left px-4 py-3">Beschreibung</th>
                <th className="text-left px-4 py-3">Kategorie</th>
                <th className="text-right px-4 py-3">Betrag</th>
                <th className="text-right px-4 py-3">Saldo</th>
                <th className="text-center px-4 py-3">Privat</th>
                <th className="text-center px-4 py-3">Abgestimmt</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(r => (
                <tr key={r.id} className={`border-t border-line hover:bg-row ${r.is_private ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 text-ink-3 font-mono text-[11px] whitespace-nowrap">
                    {belegNr(r)}
                  </td>
                  <td className="px-4 py-3 text-ink-2 whitespace-nowrap text-xs">
                    {new Date(r.booking_date).toLocaleDateString('de-AT')}
                  </td>
                  <td className="px-4 py-3 text-ink max-w-xs truncate" title={r.description ?? ''}>
                    {r.description ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-ink-2 text-xs whitespace-nowrap">
                    {r.kind === 'umbuchung' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-sm bg-accent/15 text-navy"
                        title="Umbuchung – keine Einnahme/Ausgabe, zählt nicht in UVA, E/A-Rechnung oder BMD-Export">
                        <ArrowLeftRight size={11} strokeWidth={2} />
                        {r.richtung === 'out' ? `an ${r.gegenkonto}` : `von ${r.gegenkonto}`}
                      </span>
                    ) : (
                      r.category?.name ?? '—'
                    )}
                  </td>
                  <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${r.type === 'income' ? 'text-income' : 'text-expense'} num`}>
                    {r.type === 'income' ? '+' : '−'}{formatCurrency(Number(r.amount_gross))}
                  </td>
                  <td className="px-4 py-3 text-right text-ink-2 whitespace-nowrap num">{formatCurrency(r.balance)}</td>
                  <td className="px-4 py-3 text-center">
                    {r.kind === 'umbuchung' ? (
                      // Umbuchungen können nicht privat sein – stattdessen löschen
                      <button
                        onClick={() => deleteUmbuchung(r.id)}
                        disabled={busyId === r.id}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md border border-line-2 text-ink-3 hover:text-expense hover:border-expense/30 hover:bg-expense/5 transition-colors disabled:opacity-50"
                        title="Umbuchung löschen (aus beiden Abstimmungen)"
                      >
                        <X size={11} strokeWidth={2} />
                        Löschen
                      </button>
                    ) : (
                      <button
                        onClick={() => togglePrivate(r.id, r.is_private)}
                        disabled={busyId === r.id}
                        className={`w-5 h-5 rounded-md border inline-flex items-center justify-center transition-colors disabled:opacity-50 ${
                          r.is_private ? 'bg-ink-3 border-line-2 text-white' : 'border-line-2 hover:border-line-2'
                        }`}
                        title="Als Privatumsatz markieren"
                      >
                        {r.is_private && <Check size={12} strokeWidth={2.5} />}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleReconciled(r)}
                      disabled={busyId === r.id}
                      className={`w-5 h-5 rounded-md border inline-flex items-center justify-center transition-colors disabled:opacity-50 ${
                        r.is_reconciled ? 'bg-navy border-navy text-white' : 'border-line-2 hover:border-line-2'
                      }`}
                      title="Mit Kontoauszug abgestimmt"
                    >
                      {r.is_reconciled && <Check size={12} strokeWidth={2.5} />}
                    </button>
                  </td>
                </tr>
              ))}
              {/* colSpan 4: Beleg-Nr, Datum, Beschreibung, Kategorie – der
                  Eröffnungssaldo steht damit in der Saldo-Spalte. */}
              <tr className="border-t-2 border-line-2 bg-row/60 text-ink-2">
                <td className="px-4 py-3 text-[11px]" colSpan={4}>
                  Eröffnungssaldo{openingDate && ` per ${new Date(openingDate).toLocaleDateString('de-AT')}`}
                </td>
                <td className="px-4 py-3 text-right text-ink-3 num">—</td>
                <td className="px-4 py-3 text-right font-medium whitespace-nowrap num">
                  {formatCurrency(Number(openingBalance) || 0)}
                </td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
