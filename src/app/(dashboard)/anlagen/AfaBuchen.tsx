'use client';

// AfA-Buchung am Jahresende (Welle 8)
// Vergleicht die AfA laut Verzeichnis mit den gebuchten AfA-Buchungen
// des Jahres und bucht fehlende bzw. abweichende Beträge als Ausgabe
// "Abschreibung (AfA)" per 31.12. – ohne Zahlungskonto, 0 % USt.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CalendarCheck, RotateCcw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/utils';
import type { AfaBuchungsStatus } from '@/lib/anlagen';
import { Badge, Button, Card, CardHeader, Note } from '@/components/ui';

const STATUS: Record<string, { label: string; tone: 'good' | 'warn' | 'crit' | 'gray' }> = {
  gebucht:       { label: 'gebucht',      tone: 'good' },
  offen:         { label: 'offen',        tone: 'warn' },
  abweichend:    { label: 'abweichend',   tone: 'crit' },
  ueberfluessig: { label: 'zu viel',      tone: 'crit' },
};

export default function AfaBuchen({
  status, clientId, kategorieId, dezemberGesperrt, laufend,
}: {
  status: AfaBuchungsStatus;
  clientId: string;
  /** Systemkategorie "Abschreibung (AfA)" – null, wenn Migration 046 fehlt */
  kategorieId: string | null;
  /** Dezember des Jahres ist abgeschlossen – keine Buchung möglich */
  dezemberGesperrt: boolean;
  /** Jahr läuft noch (AfA üblicherweise erst nach Jahresende buchen) */
  laufend: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offenZeigen, setOffenZeigen] = useState(false);
  const { jahr, zeilen } = status;
  const stichtag = `${jahr}-12-31`;

  const zuBuchen = zeilen.filter(z => z.status !== 'gebucht' && !z.gesperrt);
  const gebuchte = zeilen.filter(z => z.buchungId && !z.gesperrt);
  const blockiert = dezemberGesperrt || !kategorieId;

  async function buchen() {
    if (!kategorieId || zuBuchen.length === 0) return;
    const text = zuBuchen.length === 1
      ? `AfA ${jahr} für „${zuBuchen[0].anlage.name}“ (${formatCurrency(zuBuchen[0].soll)}) per 31.12.${jahr} buchen?`
      : `AfA ${jahr} für ${zuBuchen.length} Anlagen (${formatCurrency(zuBuchen.reduce((s, z) => s + z.soll, 0))}) per 31.12.${jahr} buchen?`;
    if (!confirm(text)) return;
    setLoading(true); setError(null);

    // Abweichende / überflüssige Buchungen zuerst entfernen
    const alt = zuBuchen.filter(z => z.buchungId).map(z => z.buchungId as string);
    if (alt.length > 0) {
      const { error: delErr } = await supabase.from('transactions').delete().in('id', alt);
      if (delErr) { setError(delErr.message); setLoading(false); return; }
    }
    const neu = zuBuchen.filter(z => z.soll > 0).map(z => ({
      client_id: clientId,
      category_id: kategorieId,
      type: 'expense' as const,
      amount_net: z.soll,
      vat_rate: 0 as const,
      vat_amount: 0,
      booking_date: stichtag,
      description: `AfA ${jahr}: ${z.anlage.name}`,
      account_id: null,
      is_private: false,
      ust_kennzeichen: 'normal',
      asset_id: z.anlage.id,
    }));
    if (neu.length > 0) {
      const { error: insErr } = await supabase.from('transactions').insert(neu);
      if (insErr) { setError(insErr.message); setLoading(false); return; }
    }
    setLoading(false);
    router.refresh();
  }

  async function zuruecknehmen() {
    if (gebuchte.length === 0) return;
    if (!confirm(`Alle ${gebuchte.length} AfA-Buchungen ${jahr} löschen? Das Anlagenverzeichnis bleibt unverändert.`)) return;
    setLoading(true); setError(null);
    const { error: delErr } = await supabase.from('transactions').delete().in('id', gebuchte.map(z => z.buchungId as string));
    if (delErr) { setError(delErr.message); setLoading(false); return; }
    setLoading(false);
    router.refresh();
  }

  if (zeilen.length === 0) return null;

  return (
    <Card className="mt-4">
      <CardHeader title={`AfA ${jahr} buchen`}>
        {status.komplett
          ? <Badge tone="good">gebucht · {formatCurrency(status.ist)}</Badge>
          : <Badge tone="warn">{status.offen} {status.offen === 1 ? 'Position' : 'Positionen'} offen</Badge>}
      </CardHeader>

      <p className="text-[13px] text-ink-2 mb-3">
        AfA laut Verzeichnis <b className="num text-ink">{formatCurrency(status.soll)}</b>, davon gebucht{' '}
        <b className="num text-ink">{formatCurrency(status.ist)}</b>. Gebucht wird je Anlage eine Ausgabe
        „Abschreibung (AfA)“ per 31.12.{jahr} – ohne Zahlungskonto und ohne Umsatzsteuer, damit Kontostände und UVA
        unberührt bleiben. Im Unternehmensbericht und im Steuerberater-Export erscheint sie als Betriebsausgabe.
      </p>

      {!kategorieId && <Note tone="crit" className="mb-3">Die Kategorie „Abschreibung (AfA)“ fehlt – bitte Migration 046 einspielen.</Note>}
      {dezemberGesperrt && (
        <Note tone="warn" className="mb-3">
          Dezember {jahr} ist abgeschlossen. Zum Buchen oder Zurücknehmen der AfA bitte den Monat im{' '}
          <Link href="/monatsabschluss" className="text-navy underline underline-offset-2">Monatsabschluss</Link> öffnen.
        </Note>
      )}
      {laufend && !status.komplett && !dezemberGesperrt && (
        <Note tone="info" className="mb-3">
          {jahr} läuft noch. Die AfA wird üblicherweise nach dem Jahresende gebucht, sobald alle Anschaffungen und
          Abgänge erfasst sind – buchen ist trotzdem jederzeit möglich, Abweichungen zeigt diese Karte später an.
        </Note>
      )}
      {error && <Note tone="crit" className="mb-3">{error}</Note>}

      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] font-mono uppercase tracking-[0.04em] text-ink-3">
              <th className="px-1 pb-1.5 font-medium">Anlage</th>
              <th className="px-1 pb-1.5 font-medium text-right">AfA laut Verzeichnis</th>
              <th className="px-1 pb-1.5 font-medium text-right">gebucht</th>
              <th className="px-1 pb-1.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(offenZeigen || zeilen.length <= 8 ? zeilen : zeilen.filter(z => z.status !== 'gebucht')).map(z => (
              <tr key={z.anlage.id}>
                <td className="px-1 py-1.5 text-ink">
                  <Link href={`/anlagen/${z.anlage.id}`} className="hover:underline">{z.anlage.name}</Link>
                </td>
                <td className="px-1 py-1.5 num text-right text-ink">{z.soll > 0 ? formatCurrency(z.soll) : '—'}</td>
                <td className="px-1 py-1.5 num text-right text-ink-2">{z.buchungId ? formatCurrency(z.ist) : '—'}</td>
                <td className="px-1 py-1.5">
                  <Badge tone={STATUS[z.status].tone}>{STATUS[z.status].label}</Badge>
                  {z.gesperrt && <Badge tone="gray" className="ml-1" title="Monat abgeschlossen">gesperrt</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line-2">
              <td className="px-1 pt-2 font-semibold text-navy">Summe</td>
              <td className="px-1 pt-2 num text-right font-semibold text-navy">{formatCurrency(status.soll)}</td>
              <td className="px-1 pt-2 num text-right font-semibold text-ink-2">{formatCurrency(status.ist)}</td>
              <td className="px-1 pt-2" />
            </tr>
          </tfoot>
        </table>
      </div>
      {zeilen.length > 8 && !offenZeigen && zeilen.some(z => z.status === 'gebucht') && (
        <button type="button" onClick={() => setOffenZeigen(true)} className="mt-2 text-[12.5px] text-navy hover:underline underline-offset-2">
          Alle {zeilen.length} Positionen anzeigen
        </button>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <Button onClick={buchen} disabled={loading || blockiert || zuBuchen.length === 0}>
          <CalendarCheck size={15} strokeWidth={2} />
          {zuBuchen.length === 0 ? `AfA ${jahr} gebucht` : `AfA ${jahr} buchen (${zuBuchen.length})`}
        </Button>
        {gebuchte.length > 0 && (
          <Button variant="danger" onClick={zuruecknehmen} disabled={loading || blockiert}>
            <RotateCcw size={14} strokeWidth={2} />
            AfA-Buchungen {jahr} zurücknehmen
          </Button>
        )}
        {status.komplett && (
          <Link href={`/buchungen?year=${jahr}`} className="text-[12.5px] text-navy hover:underline underline-offset-2 ml-auto">
            Buchungen {jahr} ansehen →
          </Link>
        )}
      </div>
    </Card>
  );
}
