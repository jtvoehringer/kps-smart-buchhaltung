// ============================================================
// Einmaliger Import der bisherigen Bewerbungen in die Akquise-Pipeline (Welle 9a)
//
//   npx tsx scripts/akquise-import.ts "C:\Users\joerg\Claude\Designs\CD\Claude outputs" --dry-run
//   npx tsx scripts/akquise-import.ts "C:\Users\joerg\Claude\Designs\CD\Claude outputs"
//   (optional: --client=<client_id>, sonst der einzige Betrieb in der Datenbank)
//
// Liest NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY aus .env.local.
// Parst das Namensschema <Typ>_<Firma>_<Rolle>[_<Ref>]_Voehringer.<ext>
// (src/lib/akquise.ts), fasst Anschreiben, One-Pager und PDF derselben Basis
// zu einer Opportunity zusammen und legt je Firma einen acq_companies-Eintrag,
// je Firma + Rolle eine Opportunity (Stage „beworben“, Datum = Dateidatum,
// nächste Aktion „Status nachtragen“ heute) und eine Aktivität „bewerbung“
// mit allen Dateipfaden an. Profil-Dateien („2026 …“) werden übersprungen.
// Idempotent: vorhandene Opportunities (gleiche Firma + Titel) bleiben unberührt.
// ============================================================
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { camelZuText, isoDatum, parseDateiname, type GeparsteDatei } from '../src/lib/akquise';
import type { AcqCompanyKind, AcqDocument, AcqOpportunityKind, AcqSource } from '../src/lib/supabase/database.types';

type Zuordnung = {
  /** null = Vermittler/Firma noch offen */
  firma: string | null;
  firmaArt?: AcqCompanyKind;
  land?: string;
  stadt?: string;
  endkunde?: string;
  vertraulich?: boolean;
  titel: string;
  art?: AcqOpportunityKind;
  quelle?: AcqSource;
  ref?: string;
  einsatzort?: string;
  remote?: number;
  notiz?: string;
};

// Bekannte Dateibasen (Anleitung Abschnitt 3) – schönere Firmennamen und
// Titel, als das Dateinamenschema hergibt. Unbekannte Basen laufen über
// den generischen Parser.
const ZUORDNUNG: Record<string, Zuordnung> = {
  'PSA_IT-Projektmanager':                  { firma: 'apsa personnel concepts', firmaArt: 'vermittler', endkunde: 'PSA (Payment)', titel: 'IT-Projektmanager', quelle: 'vermittler' },
  'scc':                                    { firma: 'scc EDV-Beratung AG', titel: 'Projekt-/Prozessmanager, Solution Architect', art: 'initiativ', quelle: 'initiativ' },
  'RMGroup':                                { firma: 'RM Group', firmaArt: 'vermittler', stadt: 'Zürich', land: 'CH', titel: 'Business Analyst Mobile Banking', quelle: 'freelancermap', ref: 'BH 24616' },
  'STI_RequirementsEngineer':               { firma: 'STI-Consulting', stadt: 'Wien', titel: 'Requirements Engineer / Business Analyst', quelle: 'ausschreibung' },
  'msgPlaut_SeniorRequirementsEngineer':    { firma: 'msg Plaut Austria', titel: 'Senior Requirements Engineer E-Government', quelle: 'ausschreibung' },
  'NicollCurtin':                           { firma: 'Nicoll Curtin', firmaArt: 'vermittler', land: 'CH', titel: 'Initiativbewerbung (Vermittler CH)', quelle: 'initiativ' },
  'PROSTAFF':                               { firma: 'PROSTAFF Schweiz', firmaArt: 'vermittler', land: 'CH', titel: 'Initiativbewerbung (Vermittler CH)', quelle: 'initiativ' },
  'Swisslinx':                              { firma: 'Swisslinx', firmaArt: 'vermittler', land: 'CH', titel: 'Initiativbewerbung (Vermittler CH)', quelle: 'initiativ' },
  'Vienesse_Partner':                       { firma: 'Vienesse Consulting', titel: 'Partner Operations & Consulting', quelle: 'ausschreibung' },
  'ComputerFutures_SeniorRE_PO':            { firma: 'Computer Futures', firmaArt: 'vermittler', titel: 'Senior Requirements Engineer / Product Owner', quelle: 'vermittler' },
  'sowemo_SeniorRE_PO':                     { firma: 'sowemo', firmaArt: 'vermittler', titel: 'Senior Requirements Engineer / Product Owner', art: 'projekt', quelle: 'vermittler', notiz: 'Gleiches Projekt wie über Computer Futures.' },
  'AccountingAsAService':                   { firma: null, titel: 'Requirements Engineer „Accounting as a Service“ (SAP FI)', quelle: 'vermittler', notiz: 'Vermittler offen – bitte nachtragen.' },
  'ISG_ConsultingAG_112213':                { firma: 'ISG', firmaArt: 'vermittler', endkunde: 'CONSULTING AG', titel: 'Senior Consultant / Manager Public & Health', quelle: 'vermittler', ref: '112213' },
  'INGroup_FinTech':                        { firma: 'The IN Group', firmaArt: 'vermittler', titel: 'IT-Projektmanager / Business Systems Analyst FinTech', quelle: 'freelancermap' },
  'NTS_ERP-ProgramManager':                 { firma: 'NTS Netzwerk Telekom Service AG', titel: 'ERP Program Manager', quelle: 'ausschreibung' },
  'PavelkaDenk_DigitalisierungOeffSektor':  { firma: 'Pavelka-Denk', titel: 'Digitalisierung öffentlicher Sektor', quelle: 'ausschreibung' },
  'Amass_BusinessAnalyst_Banking':          { firma: 'Amass', firmaArt: 'vermittler', titel: 'Business Analyst Banking', quelle: 'vermittler' },
  'MichaelPage_EnterpriseArchitect':        { firma: 'Michael Page', firmaArt: 'vermittler', titel: 'Enterprise Architect', quelle: 'vermittler' },
  'FBConsulting_SeniorBA_AI-SDLC':          { firma: 'FB Consulting & Trade', firmaArt: 'vermittler', vertraulich: true, titel: 'Senior Business Analyst AI-SDLC', quelle: 'vermittler', notiz: 'Endkunde vertraulich.' },
  'apsa_BusinessAnalystFinance_3058818':    { firma: 'apsa personnel concepts', firmaArt: 'vermittler', vertraulich: true, titel: 'Business Analyst Finance / Customer Data', quelle: 'vermittler', ref: '3058818', notiz: 'Endkunde vertraulich.' },
  'LaufwerkCloud_RE_Kredit_3059833':        { firma: 'Laufwerk.Cloud', firmaArt: 'vermittler', titel: 'Requirements Engineer Banking/Kredit', quelle: 'vermittler', ref: '3059833', einsatzort: 'Budapest', remote: 80 },
  'USQRD_BA_CRM_Dynamics_Geneva':           { firma: 'USQRD', firmaArt: 'vermittler', titel: 'Business Analyst CRM Dynamics', quelle: 'vermittler', einsatzort: 'Genf' },
  'MichaelPage_SeniorERPConsultant':        { firma: 'Michael Page', firmaArt: 'vermittler', titel: 'Senior ERP Consultant', quelle: 'vermittler' },
  'Spreekind_ScrumMaster':                  { firma: 'Spreekind', titel: 'Scrum Master', quelle: 'sonstige' },
};

// Firmen, die beim generischen Parser als Vermittler gelten
const VERMITTLER = /^(apsa|michaelpage|laufwerkcloud|fbconsulting|isg|computerfutures|sowemo|amass|usqrd|nicollcurtin|prostaff|swisslinx|ingroup|rmgroup|solcom)/i;

// Laut Jörgen gelaufen, aber ohne Dokument im Ordner – Art, Datum und Stand nachtragen
const OHNE_DOKUMENT: (Zuordnung & { art: AcqOpportunityKind })[] = [
  { firma: 'F. LIST', titel: 'IT Solution Architect', art: 'festanstellung', quelle: 'ausschreibung' },
  { firma: 'Project Adventures', titel: 'Solution Architect Health', art: 'projekt', quelle: 'sonstige' },
  { firma: 'Scientific Games', titel: 'Director Programme Delivery', art: 'festanstellung', quelle: 'ausschreibung' },
  { firma: 'apsa personnel concepts', firmaArt: 'vermittler', endkunde: 'ORF', titel: 'Agile Coach', art: 'projekt', quelle: 'vermittler' },
  { firma: 'SOLCOM', firmaArt: 'vermittler', titel: 'Projekt Ref. 1083619', art: 'projekt', quelle: 'vermittler', ref: '1083619' },
  { firma: 'HRForward AG', firmaArt: 'vermittler', titel: 'Vorstellung', art: 'initiativ', quelle: 'initiativ' },
  { firma: 'HR Consulting Ines Schöffmann', firmaArt: 'multiplikator', stadt: 'Salzburg', titel: 'Vernetzung Salzburg', art: 'initiativ', quelle: 'empfehlung' },
];

// ---------- Umgebung ------------------------------------------------------

function env(): Record<string, string> {
  const werte: Record<string, string> = {};
  for (const zeile of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(zeile);
    if (m) werte[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return werte;
}

const args = process.argv.slice(2);
const ordner = args.find(a => !a.startsWith('--'));
const trocken = args.includes('--dry-run');
const clientArg = args.find(a => a.startsWith('--client='))?.slice('--client='.length);
if (!ordner) {
  console.error('Aufruf: npx tsx scripts/akquise-import.ts "<Ordner>" [--dry-run] [--client=<id>]');
  process.exit(1);
}

const e = env();
if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt in .env.local');
  process.exit(1);
}
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ---------- Dateien einlesen ---------------------------------------------

type Gruppe = { basis: string; dateien: (GeparsteDatei & { pfad: string; datum: string })[] };

function gruppen(dir: string): Gruppe[] {
  const m = new Map<string, Gruppe>();
  for (const name of readdirSync(dir)) {
    const pfad = join(dir, name);
    if (!statSync(pfad).isFile()) continue;
    const p = parseDateiname(name);
    if (!p) { if (!/^2026 /.test(name)) console.log(`  übersprungen: ${name}`); continue; }
    const g = m.get(p.basis) ?? { basis: p.basis, dateien: [] };
    g.dateien.push({ ...p, pfad, datum: isoDatum(statSync(pfad).mtime) });
    m.set(p.basis, g);
  }
  return [...m.values()].sort((a, b) => minDatum(a).localeCompare(minDatum(b)));
}
const minDatum = (g: Gruppe) => g.dateien.map(d => d.datum).sort()[0];

function zuordnung(g: Gruppe): Zuordnung & { art: AcqOpportunityKind } {
  const bekannt = ZUORDNUNG[g.basis];
  const p = g.dateien[0];
  const artAusDatei = g.dateien.map(d => d.art).find((a): a is AcqOpportunityKind => !!a) ?? 'projekt';
  if (bekannt) return { ...bekannt, art: bekannt.art ?? artAusDatei };
  const vermittler = VERMITTLER.test(p.firma);
  return {
    firma: camelZuText(p.firma),
    firmaArt: vermittler ? 'vermittler' : 'endkunde',
    titel: p.rolle || (artAusDatei === 'initiativ' ? 'Initiativbewerbung' : camelZuText(p.basis)),
    art: artAusDatei,
    quelle: vermittler ? 'vermittler' : artAusDatei === 'initiativ' ? 'initiativ' : 'sonstige',
    ref: p.ref ?? undefined,
  };
}

// ---------- Datenbank ---------------------------------------------------

async function clientId(): Promise<string> {
  if (clientArg) return clientArg;
  const { data, error } = await sb.from('clients').select('id, company_name');
  if (error) throw error;
  if (!data || data.length !== 1) {
    console.error('Mehrere oder keine Betriebe – bitte --client=<id> angeben:');
    for (const c of data ?? []) console.error(`  ${c.id}  ${c.company_name}`);
    process.exit(1);
  }
  return data[0].id;
}

const firmenCache = new Map<string, string>();
async function firma(cid: string, name: string, kind: AcqCompanyKind, stadt?: string, land?: string): Promise<string> {
  const key = name.toLowerCase();
  if (firmenCache.has(key)) return firmenCache.get(key)!;
  const { data: vorhanden } = await sb.from('acq_companies').select('id').eq('client_id', cid).ilike('name', name).limit(1).maybeSingle();
  let id = vorhanden?.id as string | undefined;
  if (!id) {
    if (trocken) { id = `neu:${name}`; console.log(`  + Firma ${name} (${kind})`); }
    else {
      const { data, error } = await sb.from('acq_companies')
        .insert({ client_id: cid, name, kind, city: stadt ?? null, country: land ?? 'AT' })
        .select('id').single();
      if (error) throw new Error(`Firma ${name}: ${error.message}`);
      id = data.id as string;
      console.log(`  + Firma ${name} (${kind})`);
    }
  }
  firmenCache.set(key, id);
  return id;
}

async function opportunity(cid: string, z: Zuordnung & { art: AcqOpportunityKind }, beworben: string | null, documents: AcqDocument[]) {
  const heute = isoDatum();
  const companyId = z.firma ? await firma(cid, z.firma, z.firmaArt ?? 'endkunde', z.stadt, z.land) : null;
  const endId = z.endkunde ? await firma(cid, z.endkunde, 'endkunde') : null;

  // im Probelauf gibt es neue Firmen noch nicht – dort kann nichts vorhanden sein
  if (!companyId?.startsWith('neu:')) {
    let q = sb.from('acq_opportunities').select('id').eq('client_id', cid).eq('title', z.titel);
    q = companyId ? q.eq('company_id', companyId) : q.is('company_id', null);
    const { data: da } = await q.limit(1).maybeSingle();
    if (da) { console.log(`  = vorhanden: ${z.titel} · ${z.firma ?? 'ohne Firma'}`); return 'vorhanden'; }
  }

  console.log(`  + ${beworben ?? '(ohne Datum)'}  ${z.titel} · ${z.firma ?? 'ohne Firma'}${z.endkunde ? ` → ${z.endkunde}` : ''}  [${documents.length} Dateien]`);
  if (trocken) return 'neu';

  const { data: o, error } = await sb.from('acq_opportunities').insert({
    client_id: cid,
    title: z.titel,
    company_id: companyId,
    end_company_id: endId,
    end_customer_confidential: z.vertraulich ?? false,
    kind: z.art,
    source: z.quelle ?? 'sonstige',
    reference: z.ref ?? null,
    stage: 'beworben',
    probability: 15,
    location: z.einsatzort ?? null,
    remote_share: z.remote ?? null,
    applied_on: beworben,
    next_action: 'Status nachtragen',
    next_action_on: heute,
    notes: [z.notiz, documents.length === 0 ? 'Ohne Dokument importiert – Art, Datum und Stand prüfen.' : null].filter(Boolean).join(' ') || null,
  }).select('id').single();
  if (error) throw new Error(`${z.titel}: ${error.message}`);

  const { error: e2 } = await sb.from('acq_activities').insert({
    client_id: cid,
    opportunity_id: o.id,
    kind: 'bewerbung',
    direction: 'aus',
    occurred_at: new Date(`${beworben ?? heute}T12:00:00`).toISOString(),
    summary: documents.length ? `Bewerbung: ${z.titel} (Import)` : `Bewerbung: ${z.titel} (Import ohne Dokument)`,
    documents,
  });
  if (e2) throw new Error(`Aktivität ${z.titel}: ${e2.message}`);
  return 'neu';
}

async function main() {
  const dir = resolve(ordner!);
  console.log(`${trocken ? 'PROBELAUF – ' : ''}Import aus ${dir}`);
  const cid = await clientId();
  let neu = 0, vorhanden = 0;

  for (const g of gruppen(dir)) {
    const docs: AcqDocument[] = g.dateien
      .sort((a, b) => a.pfad.localeCompare(b.pfad))
      .map(d => ({ path: d.pfad, type: d.ext, label: d.typ }));
    const r = await opportunity(cid, zuordnung(g), minDatum(g), docs);
    if (r === 'neu') neu++; else vorhanden++;
  }
  console.log('Ohne Dokument:');
  for (const z of OHNE_DOKUMENT) {
    const r = await opportunity(cid, z, null, []);
    if (r === 'neu') neu++; else vorhanden++;
  }
  console.log(`${trocken ? 'Würde anlegen' : 'Angelegt'}: ${neu} Opportunities, bereits vorhanden: ${vorhanden}.`);
}

main().catch(err => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
