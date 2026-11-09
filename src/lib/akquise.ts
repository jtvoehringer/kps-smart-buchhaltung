// ============================================================
// Akquise-Pipeline (Welle 9) – reine Rechenlogik ohne Supabase/React
//
// Stages, Fälligkeit der nächsten Aktion (Werktage Mo–Fr, ohne
// Feiertage), gewichteter Pipeline-Wert, Antwortquote, Durchlaufzeiten
// und das Dateinamen-Schema der Bewerbungsunterlagen (Import, Skill).
// Die Stage-Anhebung nach Aktivitäten spiegelt den DB-Trigger
// acq_stage_nach_aktivitaet() (Migration akquise_pipeline).
// ============================================================
import type {
  AcqActivityKind, AcqOpportunityKind, AcqSource, AcqStage, AcqCompanyKind, AcqDocument, AcqLostBy,
} from '@/lib/supabase/database.types';

export type StageInfo = {
  key: AcqStage;
  label: string;
  /** abweichendes Label für Festanstellungen */
  labelFest?: string;
  /** Default-Wahrscheinlichkeit in % (pausiert: keine) */
  wahrscheinlichkeit: number | null;
  /** typische nächste Aktion beim Wechsel in diese Stage */
  aktion: string;
  offen: boolean;
  tone: 'gray' | 'info' | 'navy' | 'good' | 'crit';
};

export const STAGES: StageInfo[] = [
  { key: 'recherche',    label: 'Recherche',              wahrscheinlichkeit: 5,    aktion: 'Ansprechperson finden, Unterlagen erstellen', offen: true,  tone: 'gray' },
  { key: 'beworben',     label: 'Beworben',               wahrscheinlichkeit: 15,   aktion: 'Follow-up 1 senden',                         offen: true,  tone: 'gray' },
  { key: 'rueckmeldung', label: 'Rückmeldung',            wahrscheinlichkeit: 30,   aktion: 'Gespräch terminieren',                       offen: true,  tone: 'info' },
  { key: 'gespraech',    label: 'Gespräch Vermittler',    labelFest: 'Erstgespräch',  wahrscheinlichkeit: 45, aktion: 'Unterlagen an Endkunden', offen: true, tone: 'info' },
  { key: 'endkunde',     label: 'Vorstellung Endkunde',   labelFest: 'Zweitgespräch', wahrscheinlichkeit: 65, aktion: 'Interview vorbereiten',   offen: true, tone: 'navy' },
  { key: 'angebot',      label: 'Angebot / Verhandlung',  wahrscheinlichkeit: 80,   aktion: 'Vertrag, Startdatum klären',                 offen: true,  tone: 'navy' },
  { key: 'gewonnen',     label: 'Gewonnen',               wahrscheinlichkeit: 100,  aktion: 'Als Kunde anlegen',                          offen: false, tone: 'good' },
  // Schlüssel bleibt „verloren“ (DB, Skill); angezeigt wird „Absage“ –
  // vom Kunden oder selbst, siehe ABSAGE_VON_LABEL
  { key: 'verloren',     label: 'Absage',                 wahrscheinlichkeit: 0,    aktion: 'Grund erfassen, Lerneffekt notieren',        offen: false, tone: 'crit' },
  { key: 'pausiert',     label: 'Pausiert',               wahrscheinlichkeit: null, aktion: 'Wiedervorlage',                              offen: false, tone: 'gray' },
];

export const OFFENE_STAGES: AcqStage[] = STAGES.filter(s => s.offen).map(s => s.key);

export const ART_LABEL: Record<AcqOpportunityKind, string> = {
  projekt: 'Projekt', festanstellung: 'Festanstellung', initiativ: 'Initiativ', produkt: 'Produkt',
};
export const QUELLE_LABEL: Record<AcqSource, string> = {
  vermittler: 'Vermittler', freelancermap: 'freelancermap', linkedin: 'LinkedIn', empfehlung: 'Empfehlung',
  ausschreibung: 'Ausschreibung', initiativ: 'Initiativ', sonstige: 'Sonstige',
};
export const FIRMENART_LABEL: Record<AcqCompanyKind, string> = {
  vermittler: 'Vermittler', endkunde: 'Endkunde', plattform: 'Plattform', wunschkunde: 'Wunschkunde', multiplikator: 'Multiplikator',
};
export const ABSAGE_VON_LABEL: Record<AcqLostBy, string> = {
  kunde: 'Absage vom Kunden', eigene: 'Eigene Absage',
};
export const AKTIVITAET_LABEL: Record<AcqActivityKind, string> = {
  bewerbung: 'Bewerbung', followup: 'Follow-up', antwort: 'Antwort', gespraech: 'Gespräch', interview: 'Interview',
  angebot: 'Angebot', absage: 'Absage', zusage: 'Zusage', notiz: 'Notiz', linkedin: 'LinkedIn',
};

export function stageInfo(stage: AcqStage): StageInfo {
  return STAGES.find(s => s.key === stage) ?? STAGES[1];
}

export function stageLabel(stage: AcqStage, kind?: AcqOpportunityKind): string {
  const s = stageInfo(stage);
  return kind === 'festanstellung' && s.labelFest ? s.labelFest : s.label;
}

export function defaultProbability(stage: AcqStage): number | null {
  return stageInfo(stage).wahrscheinlichkeit;
}

export function istOffen(stage: AcqStage): boolean {
  return stageInfo(stage).offen;
}

// Reihenfolge für „Stage anheben“; pausiert zählt als niedrigste Stufe,
// damit eine Antwort eine pausierte Opportunity wieder aufnimmt.
const RANG: Record<AcqStage, number> = {
  pausiert: 0, recherche: 1, beworben: 2, rueckmeldung: 3, gespraech: 4, endkunde: 5, angebot: 6, gewonnen: 7, verloren: 7,
};

/** Stage, die eine Aktivität dieser Art mindestens bedeutet (null = keine Wirkung) */
export function stageNachAktivitaet(kind: AcqActivityKind): AcqStage | null {
  const m: Partial<Record<AcqActivityKind, AcqStage>> = {
    antwort: 'rueckmeldung', gespraech: 'gespraech', interview: 'endkunde',
    angebot: 'angebot', zusage: 'gewonnen', absage: 'verloren',
  };
  return m[kind] ?? null;
}

/** Neue Stage nach einer Aktivität – oder null, wenn sie unverändert bleibt (wie der DB-Trigger) */
export function stageAnheben(aktuell: AcqStage, kind: AcqActivityKind): AcqStage | null {
  const ziel = stageNachAktivitaet(kind);
  if (!ziel || aktuell === 'gewonnen' || aktuell === 'verloren') return null;
  return RANG[ziel] > RANG[aktuell] ? ziel : null;
}

/* ---------- Datum / Werktage ----------------------------------------- */

/** Lokales Kalenderdatum als YYYY-MM-DD */
export function isoDatum(d: Date = new Date()): string {
  return d.toLocaleDateString('en-CA');
}

function utc(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`);
}

/** Kalendertage zwischen zwei Daten (b − a) */
export function tageZwischen(a: string, b: string): number {
  return Math.round((utc(b).getTime() - utc(a).getTime()) / 86_400_000);
}

export function addTage(iso: string, n: number): string {
  const d = utc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** n Werktage (Mo–Fr) nach dem Datum; vom Wochenende aus zählt der Montag als erster */
export function addWerktage(iso: string, n: number): string {
  const d = utc(iso);
  let rest = n;
  while (rest > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const tag = d.getUTCDay();
    if (tag !== 0 && tag !== 6) rest--;
  }
  return d.toISOString().slice(0, 10);
}

/** Standard-Wiedervorlage nach einer Bewerbung: Follow-up 1 nach 5 Werktagen */
export function followupDatum(heute: string): string {
  return addWerktage(heute, 5);
}

/** Sonntag der Woche des Datums (Woche Mo–So) */
export function wochenende(iso: string): string {
  const tag = utc(iso).getUTCDay(); // 0 = So
  return addTage(iso, tag === 0 ? 0 : 7 - tag);
}

/* ---------- Fällige nächste Aktionen ---------------------------------- */

type MitNaechsterAktion = { stage: AcqStage; next_action_on: string | null };

export type Faelligkeit = 'ueberfaellig' | 'heute' | 'woche' | 'spaeter' | 'keine';

/** Fälligkeit der nächsten Aktion; gewonnen/verloren haben keine */
export function faelligkeit(o: MitNaechsterAktion, heute: string): Faelligkeit {
  if (o.stage === 'gewonnen' || o.stage === 'verloren' || !o.next_action_on) return 'keine';
  const d = o.next_action_on.slice(0, 10);
  if (d < heute) return 'ueberfaellig';
  if (d === heute) return 'heute';
  if (d <= wochenende(heute)) return 'woche';
  return 'spaeter';
}

/** Offene und pausierte Opportunities nach Fälligkeit, je Gruppe nach Datum sortiert */
export function faelligeFollowups<T extends MitNaechsterAktion>(opps: T[], heute: string) {
  const sortiert = [...opps]
    .filter(o => o.next_action_on && o.stage !== 'gewonnen' && o.stage !== 'verloren')
    .sort((a, b) => (a.next_action_on ?? '').localeCompare(b.next_action_on ?? ''));
  return {
    ueberfaellig: sortiert.filter(o => faelligkeit(o, heute) === 'ueberfaellig'),
    heute:        sortiert.filter(o => faelligkeit(o, heute) === 'heute'),
    dieseWoche:   sortiert.filter(o => faelligkeit(o, heute) === 'woche'),
  };
}

/* ---------- Gewichteter Pipeline-Wert --------------------------------- */

/** Fakturierbare Tage je Monat bei Vollzeit (Annahme für die Hochrechnung) */
export const TAGE_PRO_MONAT = 20;

type MitWert = {
  stage: AcqStage;
  kind: AcqOpportunityKind;
  probability: number | null;
  rate_per_day: number | null;
  hours_per_week: number | null;
  duration_months: number | null;
};

/** Auftragswert eines Projekts: Tagessatz × Tage (Dauer × 20 × Auslastung) – null ohne Tagessatz/Dauer */
export function projektwert(o: MitWert): number | null {
  if (o.kind !== 'projekt' || !o.rate_per_day || !o.duration_months) return null;
  const auslastung = Math.min(1, (o.hours_per_week ?? 40) / 40);
  return Number(o.rate_per_day) * o.duration_months * TAGE_PRO_MONAT * auslastung;
}

/** Summe Projektwert × Wahrscheinlichkeit über offene Projekte; zählt mit, wie viele ohne Angaben sind */
export function gewichteterWert(opps: MitWert[]) {
  let wert = 0, beruecksichtigt = 0, ohneAngaben = 0;
  for (const o of opps) {
    if (o.kind !== 'projekt' || !istOffen(o.stage)) continue;
    const pw = projektwert(o);
    if (pw == null) { ohneAngaben++; continue; }
    const p = (o.probability ?? defaultProbability(o.stage) ?? 0) / 100;
    wert += pw * p;
    beruecksichtigt++;
  }
  return { wert: Math.round(wert * 100) / 100, beruecksichtigt, ohneAngaben };
}

/* ---------- Aktivitäten: Antworten und Durchlaufzeiten ---------------- */

type AktivitaetKurz = { opportunity_id: string; kind: AcqActivityKind; occurred_at: string; direction?: 'aus' | 'ein' | null };

const REAKTIONEN: AcqActivityKind[] = ['antwort', 'gespraech', 'interview', 'angebot', 'zusage', 'absage'];

/** Hat die Gegenseite reagiert? (Antwort, Gespräch, … oder ausdrücklich eingehend) */
export function istReaktion(a: Pick<AktivitaetKurz, 'kind' | 'direction'>): boolean {
  return REAKTIONEN.includes(a.kind) || (a.direction === 'ein' && a.kind !== 'bewerbung');
}

/**
 * Antwortquote: Anteil der seit `seit` beworbenen Opportunities, auf die es
 * irgendeine Reaktion gab. Grundlage sind die Aktivitäten, nicht die Stage.
 */
export function antwortquote(
  opps: { id: string; applied_on: string | null }[],
  activities: AktivitaetKurz[],
  seit: string,
) {
  const basis = opps.filter(o => o.applied_on && o.applied_on >= seit);
  const mitReaktion = new Set(activities.filter(istReaktion).map(a => a.opportunity_id));
  const beantwortet = basis.filter(o => mitReaktion.has(o.id)).length;
  return { beworben: basis.length, beantwortet, quote: basis.length ? beantwortet / basis.length : null };
}

/** Tage seit der letzten Aktivität je Opportunity (fehlend = keine Aktivität) */
export function letzteAktivitaet(activities: AktivitaetKurz[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const a of activities) {
    const bisher = m.get(a.opportunity_id);
    if (!bisher || a.occurred_at > bisher) m.set(a.opportunity_id, a.occurred_at);
  }
  return m;
}

/**
 * Durchlaufzeiten einer Opportunity in Kalendertagen ab der Bewerbung
 * (erste Aktivität „bewerbung“, sonst erste Aktivität überhaupt):
 * bis zur ersten Reaktion, zum ersten Gespräch und zur Entscheidung.
 */
export function durchlaufzeit(activities: Omit<AktivitaetKurz, 'opportunity_id'>[]) {
  const s = [...activities].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const start = s.find(a => a.kind === 'bewerbung') ?? s[0];
  if (!start) return { bisAntwort: null, bisGespraech: null, bisEntscheidung: null };
  const nach = s.filter(a => a.occurred_at >= start.occurred_at && a !== start);
  const tage = (a: { occurred_at: string } | undefined) => a ? tageZwischen(start.occurred_at, a.occurred_at) : null;
  return {
    bisAntwort:      tage(nach.find(istReaktion)),
    bisGespraech:    tage(nach.find(a => a.kind === 'gespraech' || a.kind === 'interview')),
    bisEntscheidung: tage(nach.find(a => a.kind === 'zusage' || a.kind === 'absage')),
  };
}

/* ---------- Dateinamen der Bewerbungsunterlagen ------------------------ */

export type DateiTyp = 'Projektbewerbung' | 'ProjectApplication' | 'Bewerbung' | 'Initiativbewerbung' | 'OnePager';

export type GeparsteDatei = {
  typ: DateiTyp;
  /** Schlüssel für die Zusammenfassung (Firma_Rolle_Ref ohne Typ und Endung) */
  basis: string;
  firma: string;
  rolle: string;
  ref: string | null;
  ext: string;
  /** null bei OnePager – die Art kommt aus dem Anschreiben derselben Basis */
  art: AcqOpportunityKind | null;
};

/** „SeniorRequirementsEngineer“ → „Senior Requirements Engineer“ */
export function camelZuText(s: string): string {
  return s
    .replace(/([a-zäöü])([A-ZÄÖÜ])/g, '$1 $2')
    .replace(/([A-ZÄÖÜ]+)([A-ZÄÖÜ][a-zäöü])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim();
}

const TYP_ART: Record<DateiTyp, AcqOpportunityKind | null> = {
  Projektbewerbung: 'projekt', ProjectApplication: 'projekt', Bewerbung: 'festanstellung',
  Initiativbewerbung: 'initiativ', OnePager: null,
};

/** Eingefügter Pfad (auch „file:///…“ oder in Anführungszeichen) → Dokumentverweis */
export function dokumentAusPfad(pfad: string): AcqDocument {
  const p = pfad.trim().replace(/^"|"$/g, '').replace(/^file:\/\/\/?/, '');
  const name = p.split(/[\\/]/).pop() ?? p;
  const ext = name.includes('.') ? (name.split('.').pop() ?? '').toLowerCase() : '';
  return { path: p, type: ext, label: parseDateiname(name)?.typ ?? name };
}

/**
 * Parst `<Typ>_<Firma>_<Rolle>[_<Ref>]_Voehringer.<ext>`. Profil-Dateien
 * („2026 …“) und alles, was nicht passt, ergeben null.
 */
export function parseDateiname(name: string): GeparsteDatei | null {
  if (/^2026 /.test(name)) return null;
  const m = /^(Projektbewerbung|ProjectApplication|Bewerbung|Initiativbewerbung|OnePager)_(.+)_Voehringer\.([a-z0-9]+)$/i.exec(name);
  if (!m) return null;
  const typ = m[1] as DateiTyp;
  const basis = m[2];
  const teile = basis.split('_');
  const firma = teile.shift()!;
  const ref = teile.length > 0 && /^\d{4,}$/.test(teile[teile.length - 1]) ? teile.pop()! : null;
  return {
    typ, basis, firma, ref,
    rolle: camelZuText(teile.join('_')),
    ext: m[3].toLowerCase(),
    art: TYP_ART[typ],
  };
}
