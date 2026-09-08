export const dynamic = 'force-dynamic';

// Anlagenspiegel – /anlagen/spiegel?jahr= (Welle 8)
// Druckbare Aufstellung je Jahr: Buchwert 1.1., Zugänge, Abgänge, AfA,
// kumulierte AfA und Buchwert 31.12. je Anlage, mit Summen – als Beilage
// zur Einnahmen-Ausgaben-Rechnung / für den Steuerberater.
// Rechenlogik: anlagenspiegelZeilen() in src/lib/anlagen.ts

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, FileSpreadsheet } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getMyClientId } from '@/lib/supabase/get-my-client';
import { formatCurrency } from '@/lib/utils';
import { afaSatzProzent, anlagenspiegelZeilen, type Anlage } from '@/lib/anlagen';
import PageHeader from '@/components/PageHeader';
import { Button, Note } from '@/components/ui';
import JahrWaehler from '../JahrWaehler';
import DruckenKnopf from '../../bericht/DruckenKnopf';

const METHODE: Record<string, string> = { linear: 'linear', degressiv: 'degressiv', gwg: 'GWG' };
const datum = (iso: string | null) =>
  iso ? new Date(iso + 'T00:00:00').toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
const eur = (n: number) => (n === 0 ? '—' : formatCurrency(n));

export default async function AnlagenspiegelPage({ searchParams }: { searchParams: Promise<{ jahr?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const clientId = await getMyClientId(supabase, user.id);
  if (!clientId) redirect('/dashboard');

  const [{ data: client }, { data }] = await Promise.all([
    supabase.from('clients').select('company_name, uid_number').eq('id', clientId).maybeSingle(),
    supabase.from('assets').select('*').eq('client_id', clientId),
  ]);
  if (!client) redirect('/dashboard');
  const anlagen = (data ?? []) as Anlage[];

  const heute = new Date();
  const aktJahr = heute.getFullYear();
  const { jahr: jahrParam } = await searchParams;
  const jahre = [...new Set([aktJahr, ...anlagen.map(a => Number(a.acquired_on.slice(0, 4)))])].sort((a, b) => a - b);
  const jahr = jahre.includes(Number(jahrParam)) ? Number(jahrParam) : aktJahr;
  const { zeilen, summe } = anlagenspiegelZeilen(anlagen, jahr);
  const erstellt = heute.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Vienna' });

  // Gruppierung nach Anlagengruppe (Zwischensummen im Druck)
  const gruppen = new Map<string, typeof zeilen>();
  for (const z of zeilen) {
    const g = z.anlage.asset_group?.trim() || 'Ohne Gruppe';
    gruppen.set(g, [...(gruppen.get(g) ?? []), z]);
  }
  const summiere = (rows: typeof zeilen, k: 'buchwertAnfang' | 'zugang' | 'abgang' | 'afa' | 'kumulierteAfa' | 'buchwertEnde') =>
    Math.round(rows.reduce((s, r) => s + r[k], 0) * 100) / 100;

  const th = 'px-2 py-2 text-left text-[10.5px] font-mono font-medium uppercase tracking-[0.04em] text-ink-3 border-b border-line-2 whitespace-nowrap print:text-[9px] print:px-1.5';
  const thNum = th + ' text-right';
  const td = 'px-2 py-1.5 text-[12.5px] text-ink border-b border-line align-top print:text-[10px] print:px-1.5 print:py-1';
  const tdNum = td + ' num text-right whitespace-nowrap';
  const tdSum = 'px-2 py-2 text-[12.5px] font-semibold text-navy border-t border-navy print:text-[10px] print:px-1.5';
  const tdSumNum = tdSum + ' num text-right whitespace-nowrap';

  return (
    <div className="px-6 py-7 max-w-6xl mx-auto print:px-0 print:py-0 print:max-w-none">
      {/* Querformat für den Druck – die Tabelle ist breit */}
      <style>{`@media print { @page { size: A4 landscape; margin: 12mm 12mm 14mm; } }`}</style>

      <PageHeader
        title={`Anlagenspiegel ${jahr}`}
        subtitle={`${client.company_name} · Stichtag 31.12.${jahr} · Anlagenverzeichnis nach § 7 EStG`}
        icon={FileSpreadsheet}
      >
        <Button href={`/anlagen?jahr=${jahr}`} variant="ghost" className="print:hidden"><ArrowLeft size={15} strokeWidth={2} />Zum Verzeichnis</Button>
        <JahrWaehler jahre={jahre} jahr={jahr} basis="/anlagen/spiegel" />
        <DruckenKnopf />
      </PageHeader>

      {zeilen.length === 0 ? (
        <Note>Für {jahr} gibt es keine Anlagen im Verzeichnis. <Link href="/anlagen/neu" className="text-navy underline underline-offset-2">Anlage erfassen</Link></Note>
      ) : (
        <>
          {/* Kopfzeile im Druck */}
          <div className="hidden print:flex items-baseline justify-between mb-3 text-[10px] text-ink-3">
            <span>{client.company_name}{client.uid_number ? ` · UID ${client.uid_number}` : ''}</span>
            <span>erstellt am {erstellt} · E&amp;A Suite</span>
          </div>

          <div className="card overflow-x-auto print:overflow-visible print:border-0 print:rounded-none">
            <table className="w-full min-w-[980px] print:min-w-0 border-collapse">
              <thead>
                <tr>
                  <th className={th}>Anlage</th>
                  <th className={th}>Konto</th>
                  <th className={th}>Anschaffung</th>
                  <th className={th}>ND / Methode</th>
                  <th className={thNum}>AK netto</th>
                  <th className={thNum}>Buchwert 1.1.</th>
                  <th className={thNum}>Zugang {jahr}</th>
                  <th className={thNum}>Abgang {jahr}</th>
                  <th className={thNum}>AfA {jahr}</th>
                  <th className={thNum}>kum. AfA</th>
                  <th className={thNum}>Buchwert 31.12.</th>
                </tr>
              </thead>
              <tbody>
                {[...gruppen.entries()].map(([gruppe, rows]) => (
                  <GruppenBlock key={gruppe} gruppe={gruppe} rows={rows} mehrereGruppen={gruppen.size > 1}
                    td={td} tdNum={tdNum} summiere={summiere} />
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className={tdSum} colSpan={4}>Summe {jahr} · {summe.anzahlAktiv} {summe.anzahlAktiv === 1 ? 'Anlage' : 'Anlagen'} im Bestand</td>
                  <td className={tdSumNum}>{formatCurrency(summe.anschaffungskosten + summe.abgaenge)}</td>
                  <td className={tdSumNum}>{formatCurrency(summiere(zeilen, 'buchwertAnfang'))}</td>
                  <td className={tdSumNum}>{eur(summe.zugaenge)}</td>
                  <td className={tdSumNum}>{eur(summe.abgaenge)}</td>
                  <td className={tdSumNum}>{formatCurrency(summe.afaJahr)}</td>
                  <td className={tdSumNum}>{formatCurrency(summiere(zeilen, 'kumulierteAfa'))}</td>
                  <td className={tdSumNum}>{formatCurrency(summe.buchwertEnde)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {summe.abgaenge > 0 && (
            <p className="mt-3 text-[12px] text-ink-2 print:text-[10px]">
              Abgänge {jahr}: Restbuchwert zum Abgang <span className="num">{formatCurrency(summe.restbuchwertAbgaenge)}</span>
              {summe.veraeusserungserloese > 0 && <> · Veräußerungserlöse netto <span className="num">{formatCurrency(summe.veraeusserungserloese)}</span></>}
              {' '}· Buchgewinn/-verlust <span className="num">{formatCurrency(Math.round((summe.veraeusserungserloese - summe.restbuchwertAbgaenge) * 100) / 100)}</span>
            </p>
          )}

          <p className="mt-4 text-[11px] text-ink-3 leading-relaxed print:mt-3 print:text-[9px]">
            Alle Beträge in Euro, netto. Lineare AfA nach § 7 Abs. 1 EStG; Halbjahresregel (½) nach § 7 Abs. 2 bei Inbetriebnahme
            bzw. Ausscheiden im zweiten bzw. ersten Halbjahr; degressive AfA nach § 7 Abs. 1a (max. 30 % vom Restbuchwert);
            geringwertige Wirtschaftsgüter (GWG) nach § 13 EStG im Anschaffungsjahr voll abgeschrieben. Buchwert 1.1. = Buchwert
            zum 31.12. des Vorjahres. kum. AfA = Anschaffungskosten abzüglich Buchwert 31.12. (bei Abgängen: bis zum Abgang).
            Erstellt mit der E&amp;A Suite am {erstellt}; ersetzt keine steuerliche Beratung.
          </p>
        </>
      )}
    </div>
  );
}

function GruppenBlock({ gruppe, rows, mehrereGruppen, td, tdNum, summiere }: {
  gruppe: string;
  rows: ReturnType<typeof anlagenspiegelZeilen>['zeilen'];
  mehrereGruppen: boolean;
  td: string;
  tdNum: string;
  summiere: (rows: ReturnType<typeof anlagenspiegelZeilen>['zeilen'], k: 'buchwertAnfang' | 'zugang' | 'abgang' | 'afa' | 'kumulierteAfa' | 'buchwertEnde') => number;
}) {
  const tdZw = 'px-2 py-1.5 text-[11.5px] font-semibold text-ink-2 bg-well border-b border-line-2 print:text-[9.5px] print:px-1.5';
  return (
    <>
      {mehrereGruppen && (
        <tr><td className={tdZw} colSpan={11}>{gruppe}</td></tr>
      )}
      {rows.map(z => {
        const a = z.anlage;
        return (
          <tr key={a.id} className={z.abgegangen ? 'text-ink-3' : ''}>
            <td className={td}>
              <span className="font-medium">{a.name}</span>
              {z.abgegangen && <span className="block text-[11px] text-ink-3">Abgang {datum(a.disposed_on)}{z.erloes > 0 ? ` · Erlös ${formatCurrency(z.erloes)}` : ''}</span>}
            </td>
            <td className={td + ' num'}>{a.konto_nr ?? '—'}</td>
            <td className={td + ' num whitespace-nowrap'}>{datum(a.acquired_on)}</td>
            <td className={td + ' whitespace-nowrap'}>
              {a.method === 'gwg' ? 'GWG' : `${a.useful_life_years} J. · ${METHODE[a.method]}`}
              <span className="num text-ink-3"> {afaSatzProzent(a).toLocaleString('de-AT')} %</span>
            </td>
            <td className={tdNum}>{formatCurrency(Number(a.cost_net))}</td>
            <td className={tdNum}>{eur(z.buchwertAnfang)}</td>
            <td className={tdNum}>{eur(z.zugang)}</td>
            <td className={tdNum}>{eur(z.abgang)}</td>
            <td className={tdNum}>{z.afa > 0 ? <>{formatCurrency(z.afa)}{z.halb && <span className="text-ink-3" title="Halbjahresregel"> ½</span>}</> : '—'}</td>
            <td className={tdNum}>{formatCurrency(z.kumulierteAfa)}</td>
            <td className={tdNum + ' font-semibold text-navy'}>{formatCurrency(z.buchwertEnde)}</td>
          </tr>
        );
      })}
      {mehrereGruppen && (
        <tr className="bg-row">
          <td className={td + ' text-[11.5px] text-ink-2 italic'} colSpan={4}>Zwischensumme {gruppe}</td>
          <td className={tdNum + ' text-ink-2'}>{formatCurrency(rows.reduce((s, r) => s + Number(r.anlage.cost_net), 0))}</td>
          <td className={tdNum + ' text-ink-2'}>{eur(summiere(rows, 'buchwertAnfang'))}</td>
          <td className={tdNum + ' text-ink-2'}>{eur(summiere(rows, 'zugang'))}</td>
          <td className={tdNum + ' text-ink-2'}>{eur(summiere(rows, 'abgang'))}</td>
          <td className={tdNum + ' text-ink-2'}>{eur(summiere(rows, 'afa'))}</td>
          <td className={tdNum + ' text-ink-2'}>{formatCurrency(summiere(rows, 'kumulierteAfa'))}</td>
          <td className={tdNum + ' text-ink-2'}>{formatCurrency(summiere(rows, 'buchwertEnde'))}</td>
        </tr>
      )}
    </>
  );
}
