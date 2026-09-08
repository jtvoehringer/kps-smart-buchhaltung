export const dynamic = 'force-dynamic';

// ============================================================
// Unternehmensbericht – /bericht (Welle 6)
//
// "Auf einen Klick sehen, wie's um mein Unternehmen steht":
// Vermögensübersicht zum Stichtag (Konten, Forderungen,
// Verbindlichkeiten, Anlagenzugänge, offene USt), Erfolgsrechnung
// des gewählten Jahres nach Kategorien, Kontodaten, offene Posten,
// Steuern & Abschluss. Druckbar (Drucken-Knopf → PDF im Browser).
// Rechenlogik in src/lib/bericht.ts.
// ============================================================

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMyClientId } from '@/lib/supabase/get-my-client';
import { kuGrenzenFuer } from '@/lib/steuer/saetze';
import {
  afaGebuchtImJahr, anlagenZugaenge, jahresSumme, kontoStaende, nachKategorie, offenePosten, ohneAfaBuchungen, ustOffen,
  type BuchungRoh,
} from '@/lib/bericht';
import { anlagenspiegel, buchwertAm, type Anlage } from '@/lib/anlagen';
import BerichtAnsicht from './BerichtAnsicht';


export default async function BerichtPage({ searchParams }: { searchParams: Promise<{ jahr?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const clientId = await getMyClientId(supabase, user.id);
  if (!clientId) redirect('/dashboard');

  const { data: client } = await supabase
    .from('clients')
    .select('company_name, vat_liable, vat_period, ust_status, betriebsbeginn')
    .eq('id', clientId)
    .maybeSingle();
  if (!client) redirect('/dashboard');

  const heute = new Date();
  const heuteIso = heute.toLocaleDateString('en-CA');
  const aktJahr = heute.getFullYear();
  const { jahr: jahrParam } = await searchParams;
  const jahr = Number(jahrParam) >= 2000 && Number(jahrParam) <= aktJahr + 1 ? Number(jahrParam) : aktJahr;
  const laufend = jahr === aktJahr;
  const bisMonat = laufend ? heute.getMonth() + 1 : 12;
  const vatPeriod: 'monthly' | 'quarterly' = client.vat_period === 'monthly' ? 'monthly' : 'quarterly';

  const [
    { data: monatssummen },
    { data: buchungenJahr },
    { data: anlagenBuchungen },
    { data: konten },
    { data: kontoBewegungen },
    { data: umbuchungen },
    { data: offeneAR },
    { data: offeneER },
    { data: taxReturns },
    { data: closures },
    { data: assets },
    { data: afaBuchungen },
  ] = await Promise.all([
    supabase.rpc('monatssummen', { p_client_id: clientId }),
    // Buchungen des Jahres mit Kategorie (für die Aufteilung nach Kategorien)
    supabase.from('transactions')
      .select('type, amount_net, amount_gross, booking_date, is_private, asset_id, categories(name, konto_nr)')
      .eq('client_id', clientId)
      .gte('booking_date', `${jahr}-01-01`).lte('booking_date', `${jahr}-12-31`),
    // Anlagenzugänge über alle Jahre: Kategorien der Kontenklasse 0
    supabase.from('transactions')
      .select('type, amount_net, amount_gross, booking_date, is_private, categories!inner(name, konto_nr)')
      .eq('client_id', clientId).eq('type', 'expense')
      .like('categories.konto_nr', '0%'),
    supabase.from('accounts').select('id, name, type, iban, opening_balance, opening_date, is_active')
      .eq('client_id', clientId).eq('is_active', true).order('name'),
    supabase.from('transactions').select('account_id, type, amount_gross, booking_date, is_reconciled')
      .eq('client_id', clientId).not('account_id', 'is', null),
    supabase.from('account_transfers').select('from_account_id, to_account_id, amount, transfer_date, is_reconciled_from, is_reconciled_to')
      .eq('client_id', clientId),
    supabase.from('invoices').select('id, invoice_number, due_date, total_gross, customers(name)')
      .eq('client_id', clientId).eq('status', 'open'),
    supabase.from('incoming_invoices').select('id, vendor_name, invoice_number, due_date, amount_gross')
      .eq('client_id', clientId).eq('status', 'open'),
    supabase.from('tax_returns').select('period_year, period_month, status, vat_payable, submitted_at')
      .eq('client_id', clientId).order('period_year', { ascending: false }).order('period_month', { ascending: false }),
    supabase.from('month_closures').select('period_year, period_month, reopened_at')
      .eq('client_id', clientId).eq('period_year', jahr),
    supabase.from('assets').select('*').eq('client_id', clientId),
    // Gebuchte AfA aller Jahre (Welle 8) – nicht zahlungswirksam, wird getrennt gerechnet
    supabase.from('transactions').select('amount_net, booking_date')
      .eq('client_id', clientId).not('asset_id', 'is', null),
  ]);

  // ── Ableitungen ──────────────────────────────────────────────────
  type Kat = { name: string; konto_nr: string | null } | { name: string; konto_nr: string | null }[] | null;
  const kat = (c: Kat) => (Array.isArray(c) ? c[0] : c) ?? { name: '(ohne Kategorie)', konto_nr: null };
  const zuRoh = (rows: { type: string; amount_net: number; amount_gross: number; booking_date: string; is_private: boolean; categories: Kat }[] | null): BuchungRoh[] =>
    (rows ?? []).map(r => ({
      type: r.type as 'income' | 'expense', amount_net: Number(r.amount_net), amount_gross: Number(r.amount_gross),
      booking_date: r.booking_date, is_private: !!r.is_private, kategorie: kat(r.categories).name, konto_nr: kat(r.categories).konto_nr,
    }));

  const ms = (monatssummen ?? []) as { jahr: number; monat: number; einnahmen: number; ausgaben: number; ust: number; vst: number }[];
  const afaB = (afaBuchungen ?? []) as { amount_net: number; booking_date: string }[];
  const afaGebuchtJahr = afaGebuchtImJahr(afaB, jahr);
  const summe    = ohneAfaBuchungen(jahresSumme(ms, jahr), afaGebuchtJahr);
  const vorjahr  = ohneAfaBuchungen(jahresSumme(ms, jahr - 1, bisMonat), afaGebuchtImJahr(afaB, jahr - 1, bisMonat));  // Vorjahr im gleichen Zeitraum
  const vorjahrGesamt = ohneAfaBuchungen(jahresSumme(ms, jahr - 1), afaGebuchtImJahr(afaB, jahr - 1));
  // Kategorien ohne die AfA-Buchungen (die AfA steht als eigene Zeile in der Erfolgsrechnung)
  const buchungenOhneAfa = ((buchungenJahr ?? []) as { asset_id: string | null }[]).filter(b => !b.asset_id);
  const einnahmenKat = nachKategorie(zuRoh(buchungenOhneAfa as never), jahr, 'income');
  const ausgabenKat  = nachKategorie(zuRoh(buchungenOhneAfa as never), jahr, 'expense');
  // Anlagevermögen aus dem Anlagenverzeichnis (Welle 7); die Kontenklasse-0-
  // Buchungen zeigen, was im Jahr aktivierungspflichtig gekauft wurde.
  const anlagenListe = (assets ?? []) as Anlage[];
  const spiegel = anlagenspiegel(anlagenListe, jahr);
  const zugaengeBuchungen = anlagenZugaenge(zuRoh(anlagenBuchungen as never));
  const anlagen = {
    buchwert: anlagenListe.reduce((s, a) => s + buchwertAm(a, heuteIso), 0),
    anschaffungskosten: spiegel.anschaffungskosten,
    kumulierteAfa: spiegel.kumulierteAfa,
    anzahl: spiegel.anzahlAktiv,
    afaJahr: spiegel.afaJahr,
    afaGebuchtJahr,
    zugaengeJahr: spiegel.zugaenge,
    zugaengeBuchungenJahr: zugaengeBuchungen.jeJahr.find(([j]) => j === jahr)?.[1] ?? 0,
    imVerzeichnis: anlagenListe.length,
  };
  const staende = kontoStaende(
    (konten ?? []) as never,
    (kontoBewegungen ?? []) as never,
    (umbuchungen ?? []) as never,
  );
  const forderungen = offenePosten((offeneAR ?? []).map(i => ({
    id: i.id, nummer: i.invoice_number, faelligAm: i.due_date, betrag: Number(i.total_gross),
    label: (Array.isArray(i.customers) ? i.customers[0]?.name : (i.customers as { name: string } | null)?.name) ?? '—',
  })), heuteIso);
  const verbindlichkeiten = offenePosten((offeneER ?? []).map(i => ({
    id: i.id, nummer: i.invoice_number, faelligAm: i.due_date, betrag: Number(i.amount_gross), label: i.vendor_name,
  })), heuteIso);
  const ust = client.vat_liable !== false ? ustOffen(ms, taxReturns ?? [], aktJahr, vatPeriod) : { betrag: 0, monate: [] };

  const monateMitDaten = ms.filter(m => Number(m.jahr) === jahr).map(m => Number(m.monat));
  const abgeschlossen = (closures ?? []).filter(c => !c.reopened_at).map(c => Number(c.period_month));
  const letzteUva = (taxReturns ?? []).find(t => t.status === 'submitted');
  const kuGrenze = kuGrenzenFuer(heuteIso);

  const jahre = [...new Set(ms.map(m => Number(m.jahr)))].concat(aktJahr).sort((a, b) => a - b);

  return (
    <BerichtAnsicht
      companyName={client.company_name}
      heuteIso={heuteIso}
      erstelltUm={heute.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Vienna' })}
      jahr={jahr}
      aktJahr={aktJahr}
      laufend={laufend}
      bisMonat={bisMonat}
      jahre={jahre}
      jahreMitBuchungen={jahre.filter(j => ms.some(m => Number(m.jahr) === j))}
      vatLiable={client.vat_liable !== false}
      vatPeriod={vatPeriod}
      ustStatus={client.ust_status ?? 'regelbesteuerung'}
      betriebsbeginn={client.betriebsbeginn ?? null}
      summe={summe}
      vorjahr={vorjahr}
      vorjahrGesamt={vorjahrGesamt}
      einnahmenKat={einnahmenKat}
      ausgabenKat={ausgabenKat}
      anlagen={anlagen}
      staende={staende}
      forderungen={forderungen}
      verbindlichkeiten={verbindlichkeiten}
      ust={ust}
      monateMitDaten={monateMitDaten}
      abgeschlossen={abgeschlossen}
      letzteUva={letzteUva ? { period_year: Number(letzteUva.period_year), period_month: Number(letzteUva.period_month), vat_payable: letzteUva.vat_payable == null ? null : Number(letzteUva.vat_payable) } : null}
      kuGrenze={kuGrenze.grenze}
    />
  );
}
