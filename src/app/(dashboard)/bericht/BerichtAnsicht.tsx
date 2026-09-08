// Reine Darstellung des Unternehmensberichts – bekommt fertig
// berechnete Werte (page.tsx lädt und rechnet, src/lib/bericht.ts
// enthält die Formeln). Ohne Datenbankzugriff, damit sie sich mit
// Demo-Daten rendern lässt.

import Link from 'next/link';
import { BarChart3, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { rund, type KontoStand, type KategorieSumme, type PostenSumme, type Jahressumme } from '@/lib/bericht';
import PageHeader from '@/components/PageHeader';
import { Badge, BarChart, Card, CardHeader, Kv, Legend, Note, Td, Th, Tile, Tr } from '@/components/ui';
import DruckenKnopf from './DruckenKnopf';

const MONATE = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const KONTO_TYP: Record<string, string> = { kontokorrent: 'Girokonto', kreditkarte: 'Kreditkarte', kreditkonto: 'Kreditkonto' };
const datum = (iso: string | null) =>
  iso ? new Date(iso + 'T00:00:00').toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
const eur = (n: number) => formatCurrency(n);
const signiert = (n: number) => (n < 0 ? '−' : '') + formatCurrency(Math.abs(n));

export type BerichtDaten = {
  companyName: string;
  heuteIso: string;
  erstelltUm: string;
  jahr: number;
  aktJahr: number;
  laufend: boolean;
  bisMonat: number;
  jahre: number[];
  jahreMitBuchungen: number[];
  vatLiable: boolean;
  vatPeriod: 'monthly' | 'quarterly';
  ustStatus: string;
  betriebsbeginn: string | null;
  summe: Jahressumme;
  vorjahr: Jahressumme;
  vorjahrGesamt: Jahressumme;
  einnahmenKat: KategorieSumme[];
  ausgabenKat: KategorieSumme[];
  anlagen: { buchwert: number; anschaffungskosten: number; kumulierteAfa: number; anzahl: number; afaJahr: number; zugaengeJahr: number; zugaengeBuchungenJahr: number; imVerzeichnis: number };
  staende: KontoStand[];
  forderungen: PostenSumme;
  verbindlichkeiten: PostenSumme;
  ust: { betrag: number; monate: number[] };
  monateMitDaten: number[];
  abgeschlossen: number[];
  letzteUva: { period_year: number; period_month: number; vat_payable: number | null } | null;
  kuGrenze: number;
};

export default function BerichtAnsicht(d: BerichtDaten) {
  const {
    companyName, heuteIso, erstelltUm, jahr, aktJahr, laufend, bisMonat, jahre, jahreMitBuchungen,
    vatLiable, vatPeriod, ustStatus, betriebsbeginn, summe, vorjahr, vorjahrGesamt,
    einnahmenKat, ausgabenKat, anlagen, staende, forderungen, verbindlichkeiten, ust,
    monateMitDaten, abgeschlossen, letzteUva, kuGrenze,
  } = d;
  const liquide = rund(staende.reduce((s, k) => s + k.saldo, 0));
  const umlauf = rund(liquide + forderungen.summe);
  const aktiva = rund(umlauf + anlagen.buchwert);
  const ueberschussNachAfa = rund(summe.ueberschuss + anlagen.zugaengeBuchungenJahr - anlagen.afaJahr);
  const schulden = rund(verbindlichkeiten.summe + Math.max(0, ust.betrag));
  const reinvermoegen = rund(aktiva - schulden);
  const nettoPosition = rund(liquide + forderungen.summe - verbindlichkeiten.summe);
  const umsatzJahr = summe.einnahmen;
  const kuQuote = ustStatus === 'kleinunternehmer' ? umsatzJahr / kuGrenze : null;
  const vorJ = jahre.filter(j => j < jahr).pop();
  const nachJ = jahre.filter(j => j > jahr).shift();
  const chartMax = Math.max(1, ...einnahmenKat.map(e => e.netto), ...ausgabenKat.map(e => e.netto)) * 1.08;

  return (
    <div className="px-6 py-7 max-w-6xl mx-auto print:px-0 print:py-0">
      <PageHeader
        title="Unternehmensbericht"
        subtitle={`${companyName} · Stichtag ${datum(heuteIso)} · Erfolgsrechnung ${jahr}${laufend ? ` (bis ${MONATE[bisMonat - 1]})` : ''}`}
        icon={BarChart3}
      >
        <div className="flex items-center gap-1 print:hidden">
          <Link href={vorJ ? `/bericht?jahr=${vorJ}` : '#'} aria-disabled={!vorJ}
            className={`w-8 h-8 inline-flex items-center justify-center rounded-md border border-line-2 bg-card text-ink-2 hover:bg-row hover:text-navy ${!vorJ ? 'opacity-30 pointer-events-none' : ''}`}>
            <ChevronLeft size={15} strokeWidth={2} />
          </Link>
          <span className="num font-semibold text-navy text-[17px] w-14 text-center">{jahr}</span>
          <Link href={nachJ ? `/bericht?jahr=${nachJ}` : '#'} aria-disabled={!nachJ}
            className={`w-8 h-8 inline-flex items-center justify-center rounded-md border border-line-2 bg-card text-ink-2 hover:bg-row hover:text-navy ${!nachJ ? 'opacity-30 pointer-events-none' : ''}`}>
            <ChevronRight size={15} strokeWidth={2} />
          </Link>
        </div>
        <DruckenKnopf />
      </PageHeader>

      {/* ── Kennzahlen zum Stichtag ─────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile label="Liquide Mittel" value={signiert(liquide)} tone={liquide < 0 ? 'crit' : 'navy'}
          detail={`${staende.length} ${staende.length === 1 ? 'Konto' : 'Konten'}`} href="/konten" />
        <Tile label="Forderungen (offene Ausgangsrechnungen)" value={eur(forderungen.summe)}
          detail={forderungen.ueberfaelligAnzahl > 0
            ? <span className="text-crit">{forderungen.ueberfaelligAnzahl} überfällig · {eur(forderungen.ueberfaelligSumme)}</span>
            : `${forderungen.anzahl} ${forderungen.anzahl === 1 ? 'Rechnung' : 'Rechnungen'} offen`}
          href="/offene-posten" />
        <Tile label="Verbindlichkeiten (offene Eingangsrechnungen)" value={eur(verbindlichkeiten.summe)} tone="ink"
          detail={verbindlichkeiten.ueberfaelligAnzahl > 0
            ? <span className="text-crit">{verbindlichkeiten.ueberfaelligAnzahl} überfällig · {eur(verbindlichkeiten.ueberfaelligSumme)}</span>
            : `${verbindlichkeiten.anzahl} ${verbindlichkeiten.anzahl === 1 ? 'Rechnung' : 'Rechnungen'} offen`}
          href="/offene-posten" />
        <Tile label="Finanzielle Netto-Position" value={signiert(nettoPosition)} tone={nettoPosition < 0 ? 'crit' : 'good'}
          detail="Liquide Mittel + Forderungen − Verbindlichkeiten" />
      </div>

      {/* ── Vermögensübersicht + Erfolgsrechnung ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <Card>
          <CardHeader title={`Vermögensübersicht zum ${datum(heuteIso)}`}>
            <Badge tone="gray">vereinfacht</Badge>
          </CardHeader>
          <Kv valueRight rows={[
            { k: <b className="text-ink">Anlagevermögen</b>, v: eur(anlagen.buchwert), mono: true },
            { k: <span className="pl-3">Buchwert lt. Anlagenverzeichnis · {anlagen.anzahl} {anlagen.anzahl === 1 ? 'Anlage' : 'Anlagen'}</span>,
              v: <span className="text-ink-3 text-[12px]">AK {eur(anlagen.anschaffungskosten)} − AfA {eur(anlagen.kumulierteAfa)}</span> },
            { k: <b className="text-ink">Umlaufvermögen</b>, v: eur(umlauf), mono: true },
            { k: <span className="pl-3">Forderungen aus Lieferungen und Leistungen</span>, v: eur(forderungen.summe), mono: true },
            ...staende.map(k => ({ k: <span className="pl-3">{k.name}</span>, v: signiert(k.saldo), mono: true })),
            { k: <b className="text-navy">Summe Vermögen</b>, v: <b className="text-navy">{eur(aktiva)}</b>, mono: true },
            { k: <b className="text-ink">Verbindlichkeiten</b>, v: eur(schulden), mono: true },
            { k: <span className="pl-3">aus Lieferungen und Leistungen</span>, v: eur(verbindlichkeiten.summe), mono: true },
            ...(vatLiable ? [{ k: <span className="pl-3">Umsatzsteuer, noch nicht gemeldet{ust.monate.length ? ` (${ust.monate.map(m => MONATE[m - 1]).join(', ')})` : ''}</span>, v: signiert(ust.betrag), mono: true }] : []),
            { k: <b className="text-navy">Reinvermögen (vereinfacht)</b>, v: <b className={reinvermoegen < 0 ? 'text-crit' : 'text-navy'}>{signiert(reinvermoegen)}</b>, mono: true },
          ]} />
          <Note className="mt-4">
            Sicht auf Basis der Einnahmen-Ausgaben-Rechnung: Kontostände, offene Rechnungen und Buchwerte aus dem{' '}
            <Link href="/anlagen" className="underline underline-offset-2">Anlagenverzeichnis</Link> – keine Bilanz nach UGB.
            Rückstellungen und Privatentnahmen sind nicht enthalten.
          </Note>
        </Card>

        <Card>
          <CardHeader title={`Erfolgsrechnung ${jahr}`}>
            {laufend && <Badge tone="info">Jän–{MONATE[bisMonat - 1]}</Badge>}
          </CardHeader>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[12.5px] text-ink-2">Einnahmen</p>
              <p className="num text-[22px] font-semibold text-navy leading-tight mt-1">{eur(summe.einnahmen)}</p>
              {vorjahr.einnahmen > 0 && <p className="text-[11px] text-ink-3 mt-1">Vorjahr <span className="num">{eur(vorjahr.einnahmen)}</span><br />{delta(summe.einnahmen, vorjahr.einnahmen)}</p>}
            </div>
            <div>
              <p className="text-[12.5px] text-ink-2">Ausgaben</p>
              <p className="num text-[22px] font-semibold text-ink-2 leading-tight mt-1">{eur(summe.ausgaben)}</p>
              {vorjahr.ausgaben > 0 && <p className="text-[11px] text-ink-3 mt-1">Vorjahr <span className="num">{eur(vorjahr.ausgaben)}</span><br />{delta(summe.ausgaben, vorjahr.ausgaben)}</p>}
            </div>
            <div>
              <p className="text-[12.5px] text-ink-2">Überschuss</p>
              <p className={`num text-[22px] font-semibold leading-tight mt-1 ${summe.ueberschuss < 0 ? 'text-crit' : 'text-good'}`}>{signiert(summe.ueberschuss)}</p>
              {(vorjahr.einnahmen > 0 || vorjahr.ausgaben > 0) && <p className="text-[11px] text-ink-3 mt-1">Vorjahr <span className="num">{signiert(vorjahr.ueberschuss)}</span></p>}
            </div>
          </div>
          <Kv className="mt-4" valueRight rows={[
            { k: 'Ausgabenquote', v: summe.einnahmen > 0 ? `${Math.round(summe.ausgaben / summe.einnahmen * 100)} % der Einnahmen` : '—', mono: true },
            { k: 'Ø Einnahmen je Monat', v: monateMitDaten.length ? eur(rund(summe.einnahmen / Math.max(1, laufend ? bisMonat : 12))) : '—', mono: true },
            { k: `USt-Saldo ${jahr} (USt − Vorsteuer)`, v: !vatLiable ? 'Kleinunternehmer – keine USt' : signiert(rund(summe.ust - summe.vst)), mono: true },
            { k: <>Anlagenkäufe {jahr} (Kontenklasse 0, aktivierungspflichtig)</>, v: anlagen.zugaengeBuchungenJahr > 0 ? `+ ${eur(anlagen.zugaengeBuchungenJahr)}` : '—', mono: true },
            { k: <>Abschreibung (AfA) {jahr}</>, v: anlagen.afaJahr > 0 ? `− ${eur(anlagen.afaJahr)}` : anlagen.imVerzeichnis === 0 ? <Link href="/anlagen" className="text-navy hover:underline">Anlagenverzeichnis anlegen</Link> : '—', mono: true },
            { k: <b className="text-navy">Überschuss nach AfA (steuerlich, vereinfacht)</b>, v: <b className={ueberschussNachAfa < 0 ? 'text-crit' : 'text-navy'}>{signiert(ueberschussNachAfa)}</b>, mono: true },
            ...(vorjahrGesamt.einnahmen > 0 ? [{ k: `Gesamtjahr ${jahr - 1} (Einnahmen / Ausgaben / Überschuss)`, v: `${eur(vorjahrGesamt.einnahmen)} / ${eur(vorjahrGesamt.ausgaben)} / ${signiert(vorjahrGesamt.ueberschuss)}`, mono: true }] : []),
          ]} />
          <p className="mt-3 text-[12.5px]"><Link href="/monatsuebersicht" className="text-navy hover:underline underline-offset-2">Verlauf je Monat →</Link></p>
        </Card>
      </div>

      {/* ── Kategorien ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <Card>
          <CardHeader title="Einnahmen nach Kategorie">
            <Legend items={[{ color: 'bg-chart-1', label: 'netto' }]} />
          </CardHeader>
          {einnahmenKat.length === 0
            ? <p className="text-[13px] text-ink-3">Keine Einnahmen in {jahr}.</p>
            : <BarChart max={chartMax} format={eur} labelWidth="170px" rows={einnahmenKat.slice(0, 8).map(e => ({ label: e.kategorie, value: e.netto }))} />}
          {einnahmenKat.length > 8 && <p className="text-[12px] text-ink-3 mt-2">+ {einnahmenKat.length - 8} weitere Kategorien</p>}
        </Card>
        <Card>
          <CardHeader title="Ausgaben nach Kategorie">
            <Legend items={[{ color: 'bg-chart-2', label: 'netto' }]} />
          </CardHeader>
          {ausgabenKat.length === 0
            ? <p className="text-[13px] text-ink-3">Keine Ausgaben in {jahr}.</p>
            : <BarChart max={chartMax} format={eur} labelWidth="170px" rows={ausgabenKat.slice(0, 8).map(e => ({ label: e.kategorie, value: e.netto, color: 'bg-chart-2' }))} />}
          {ausgabenKat.length > 8 && <p className="text-[12px] text-ink-3 mt-2">+ {ausgabenKat.length - 8} weitere Kategorien</p>}
        </Card>
      </div>

      {/* ── Konten ──────────────────────────────────────────────── */}
      <Card padded={false} className="mt-4">
        <CardHeader title="Konten" border>
          <span className="num text-[13px] text-ink-2">Summe <b className="text-navy">{signiert(liquide)}</b></span>
        </CardHeader>
        {staende.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-ink-3">Noch kein Konto angelegt – <Link href="/konten/neu" className="text-navy hover:underline">Konto anlegen</Link>.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr>
                <Th>Konto</Th><Th>Typ</Th><Th>IBAN</Th><Th num>Eröffnung</Th><Th num>Saldo</Th><Th num>Bewegungen</Th><Th>Abstimmung</Th><Th>Letzte Bewegung</Th>
              </tr></thead>
              <tbody>
                {staende.map(k => (
                  <Tr key={k.id}>
                    <Td className="font-medium text-ink"><Link href={`/konten/${k.id}`} className="hover:underline">{k.name}</Link></Td>
                    <Td className="text-ink-2">{KONTO_TYP[k.type] ?? k.type}</Td>
                    <Td className="num text-[12px] text-ink-3">{k.iban ? k.iban.replace(/(.{4})/g, '$1 ').trim() : '—'}</Td>
                    <Td num className="text-ink-2">{signiert(k.eroeffnung)}<span className="block text-[11px] text-ink-3">{k.eroeffnungAm ? datum(k.eroeffnungAm) : ''}</span></Td>
                    <Td num className={`font-semibold ${k.saldo < 0 ? 'text-crit' : 'text-navy'}`}>{signiert(k.saldo)}</Td>
                    <Td num className="text-ink-2">{k.bewegungen}</Td>
                    <Td>{k.nichtAbgestimmt > 0
                      ? <Link href={`/konten/${k.id}/abstimmung`}><Badge tone="warn">{k.nichtAbgestimmt} offen</Badge></Link>
                      : <Badge tone="good">abgestimmt</Badge>}</Td>
                    <Td className="num text-[13px] text-ink-2">{datum(k.letzteBewegung)}</Td>
                  </Tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Offene Posten ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <PostenTabelle titel="Forderungen" leer="Keine offenen Ausgangsrechnungen." posten={forderungen.posten} hrefBasis="/rechnungen/" />
        <PostenTabelle titel="Verbindlichkeiten" leer="Keine offenen Eingangsrechnungen." posten={verbindlichkeiten.posten} />
      </div>

      {/* ── Steuern & Abschluss ─────────────────────────────────── */}
      <Card className="mt-4">
        <CardHeader title="Steuern & Abschluss" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="label-mono mb-2">Umsatzsteuer</p>
            <Kv rows={[
              { k: 'Status', v: ustStatus === 'kleinunternehmer' ? 'Kleinunternehmer' : 'Regelbesteuerung' },
              ...(vatLiable ? [
                { k: 'UVA-Rhythmus', v: vatPeriod === 'monthly' ? 'monatlich' : 'vierteljährlich' },
                { k: 'Zuletzt eingereicht', v: letzteUva ? `${vatPeriod === 'monthly' ? MONATE[Number(letzteUva.period_month) - 1] : `Q${Math.ceil(Number(letzteUva.period_month) / 3)}`} ${letzteUva.period_year} · ${signiert(Number(letzteUva.vat_payable ?? 0))}` : 'noch keine', mono: !!letzteUva },
                { k: 'Offen (nicht gemeldet)', v: ust.monate.length ? `${signiert(ust.betrag)} · ${ust.monate.map(m => MONATE[m - 1]).join(', ')}` : 'nichts offen', mono: true },
              ] : [
                { k: `Umsatz ${aktJahr} / KU-Grenze`, v: `${eur(umsatzJahr)} / ${eur(kuGrenze)}`, mono: true },
                { k: 'Ausgeschöpft', v: kuQuote !== null ? <span className={kuQuote > 0.9 ? 'text-crit' : kuQuote > 0.75 ? 'text-warn' : 'text-good'}>{Math.round(kuQuote * 100)} %</span> : '—', mono: true },
              ]),
            ]} />
          </div>
          <div>
            <p className="label-mono mb-2">Monatsabschlüsse {jahr}</p>
            <div className="flex flex-wrap gap-1.5">
              {MONATE.map((m, i) => {
                const nr = i + 1;
                const zu = abgeschlossen.includes(nr);
                const daten = monateMitDaten.includes(nr);
                const zukunft = laufend && nr > bisMonat;
                return (
                  <span key={m} title={zu ? 'abgeschlossen' : daten ? 'offen' : zukunft ? 'noch nicht' : 'keine Buchungen'}
                    className={`num text-[11px] font-semibold px-2 py-1 rounded-sm ${zu ? 'bg-good-bg text-good' : daten ? 'bg-warn-bg text-warn' : 'bg-well text-ink-3'}`}>
                    {m}
                  </span>
                );
              })}
            </div>
            <p className="text-[12px] text-ink-3 mt-2">{abgeschlossen.length} von {laufend ? bisMonat : 12} Monaten abgeschlossen · <Link href="/monatsabschluss" className="text-navy hover:underline">Monatsabschluss →</Link></p>
          </div>
          <div>
            <p className="label-mono mb-2">Datenstand</p>
            <Kv rows={[
              { k: 'Betriebsbeginn', v: betriebsbeginn ? datum(betriebsbeginn) : '—', mono: !!betriebsbeginn },
              { k: 'Jahre mit Buchungen', v: jahreMitBuchungen.join(', ') || '—', mono: true },
              { k: 'Bericht erstellt', v: `${datum(heuteIso)} ${erstelltUm}`, mono: true },
            ]} />
          </div>
        </div>
      </Card>

      <p className="mt-6 text-[11.5px] text-ink-3 print:mt-4">
        Alle Beträge in Euro. Einnahmen und Ausgaben brutto lt. Monatssummen, Kategorien netto. Private Buchungen bleiben unberücksichtigt.
        Der Bericht ersetzt keine Bilanz und keine steuerliche Beratung.
      </p>
    </div>
  );
}

function delta(ist: number, vor: number) {
  if (vor <= 0) return null;
  const p = Math.round((ist - vor) / vor * 100);
  return <span className={`num ${p >= 0 ? 'text-good' : 'text-crit'}`}>({p >= 0 ? '+' : ''}{p} %)</span>;
}

function PostenTabelle({ titel, leer, posten, hrefBasis }: {
  titel: string; leer: string; hrefBasis?: string;
  posten: { id: string; label: string; nummer: string | null; faelligAm: string; betrag: number; tageUeberfaellig: number }[];
}) {
  const zeigen = posten.slice(0, 8);
  return (
    <Card padded={false}>
      <CardHeader title={titel} border>
        <Link href="/offene-posten" className="text-[12.5px] text-navy font-medium hover:underline underline-offset-2 print:hidden">Alle offenen Posten →</Link>
      </CardHeader>
      {posten.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-ink-3">{leer}</p>
      ) : (
        <table className="w-full text-sm">
          <thead><tr><Th>{titel === 'Forderungen' ? 'Kunde' : 'Lieferant'}</Th><Th>Nummer</Th><Th>Fällig</Th><Th num>Betrag</Th></tr></thead>
          <tbody>
            {zeigen.map(p => (
              <Tr key={p.id}>
                <Td className="font-medium text-ink truncate max-w-[220px]">{hrefBasis ? <Link href={`${hrefBasis}${p.id}`} className="hover:underline">{p.label}</Link> : p.label}</Td>
                <Td className="num text-[12.5px] text-ink-2">{p.nummer ?? '—'}</Td>
                <Td className="num text-[12.5px]">
                  {datum(p.faelligAm)}
                  {p.tageUeberfaellig > 0 && <span className="block text-[11px] text-crit">{p.tageUeberfaellig} {p.tageUeberfaellig === 1 ? 'Tag' : 'Tage'} überfällig</span>}
                </Td>
                <Td num className="font-semibold text-ink">{formatCurrency(p.betrag)}</Td>
              </Tr>
            ))}
          </tbody>
        </table>
      )}
      {posten.length > zeigen.length && <p className="px-5 py-2.5 border-t border-line text-[12px] text-ink-3">+ {posten.length - zeigen.length} weitere</p>}
    </Card>
  );
}
