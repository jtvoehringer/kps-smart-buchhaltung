// Kunden-Health-Check (Welle 10) – Datenmodell, Prüfung eingehender Läufe
// und Auswertung für Übersicht und Verlauf. Die Tabelle healthcheck_laeufe
// füllt der tägliche Morgenlauf über POST /api/healthcheck.

export type Ampel = 'gruen' | 'gelb' | 'rot';
export const AMPELN: readonly Ampel[] = ['gruen', 'gelb', 'rot'];

/** Hoster-Grenze für die Datenbankgröße (hetych.at, Meldung des Hosters vom 24.11.2026) */
export const DB_GRENZE_MB = 1000;

export type HealthcheckLauf = {
  id: string;
  firma: string;
  domain: string;
  /** Zeitpunkt der Prüfung (ISO, mit Zeitzone) */
  datum: string;
  ampel: Ampel;
  db_mb: number | null;
  seiten_ms_max: number | null;
  ssl_tage: number | null;
  plugin_updates: number | null;
  wartestellung: number | null;
  bearbeitung: number | null;
  as_fehler: number | null;
  /** Punkte mit " | " getrennt */
  alarme: string | null;
  neu: string | null;
  warnungen: string | null;
  bekannt: string | null;
  zusammenfassung: string | null;
  bericht: string | null;
  created_at: string;
};

export type HealthcheckLaufInsert = Omit<HealthcheckLauf, 'id' | 'created_at'>;

export const ZAHL_FELDER = [
  'db_mb', 'seiten_ms_max', 'ssl_tage', 'plugin_updates', 'wartestellung', 'bearbeitung', 'as_fehler',
] as const;
export const TEXT_FELDER = [
  'alarme', 'neu', 'warnungen', 'bekannt', 'zusammenfassung', 'bericht',
] as const;
const PFLICHT_FELDER = ['firma', 'domain', 'datum', 'ampel'] as const;
const ALLE_FELDER = new Set<string>([...PFLICHT_FELDER, ...ZAHL_FELDER, ...TEXT_FELDER]);

/** Höchstlänge je Textfeld – der Bericht darf ausführlich sein, die Listen nicht endlos */
const MAX_TEXT = 4000;
const MAX_BERICHT = 100_000;

export type Pruefergebnis =
  | { ok: true; lauf: HealthcheckLaufInsert }
  | { ok: false; fehler: string[] };

/**
 * Prüft einen Lauf aus dem Morgenlauf. Unbekannte Felder sind ein Fehler
 * (Tippfehler im Feldnamen sollen nicht still verloren gehen); leere
 * Strings bei Textfeldern werden zu null.
 */
export function pruefeLauf(eingabe: unknown): Pruefergebnis {
  if (!eingabe || typeof eingabe !== 'object' || Array.isArray(eingabe)) {
    return { ok: false, fehler: ['Ein Lauf muss ein JSON-Objekt sein.'] };
  }
  const e = eingabe as Record<string, unknown>;
  const fehler: string[] = [];

  for (const k of Object.keys(e)) {
    if (!ALLE_FELDER.has(k)) fehler.push(`Unbekanntes Feld „${k}“.`);
  }

  const text = (k: string): string | null => {
    const v = e[k];
    if (v === undefined || v === null) return null;
    if (typeof v !== 'string') { fehler.push(`„${k}“ muss Text sein.`); return null; }
    const t = v.trim();
    const max = k === 'bericht' ? MAX_BERICHT : MAX_TEXT;
    if (t.length > max) fehler.push(`„${k}“ ist länger als ${max} Zeichen.`);
    return t === '' ? null : t;
  };

  const firma  = text('firma');
  const domain = text('domain');
  if (!firma)  fehler.push('„firma“ fehlt.');
  if (!domain) fehler.push('„domain“ fehlt.');

  let datum: string | null = null;
  if (typeof e.datum !== 'string' || !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(e.datum)) {
    fehler.push('„datum“ fehlt oder ist kein Zeitpunkt (z. B. 2026-11-25T08:00:00+01:00).');
  } else if (!/(Z|[+-]\d{2}:?\d{2})$/.test(e.datum.trim())) {
    // Ohne Zone wäre der Zeitpunkt je nach Server (Vercel = UTC) um eine Stunde verschoben
    fehler.push('„datum“ braucht eine Zeitzone (z. B. +01:00 oder Z).');
  } else if (Number.isNaN(Date.parse(e.datum.trim().replace(' ', 'T')))) {
    fehler.push('„datum“ ist kein gültiger Zeitpunkt.');
  } else {
    datum = new Date(e.datum.trim().replace(' ', 'T')).toISOString();
  }

  const ampel = e.ampel;
  if (typeof ampel !== 'string' || !(AMPELN as readonly string[]).includes(ampel)) {
    fehler.push('„ampel“ muss gruen, gelb oder rot sein.');
  }

  const zahlen = {} as Record<(typeof ZAHL_FELDER)[number], number | null>;
  for (const k of ZAHL_FELDER) {
    const v = e[k];
    if (v === undefined || v === null) { zahlen[k] = null; continue; }
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
      fehler.push(`„${k}“ muss eine Zahl ≥ 0 oder null sein.`);
      zahlen[k] = null;
      continue;
    }
    // Nur db_mb darf Nachkommastellen haben (Spalte NUMERIC(10,1)), der Rest ist ganzzahlig
    zahlen[k] = k === 'db_mb' ? Math.round(v * 10) / 10 : Math.round(v);
  }

  const texte = {} as Record<(typeof TEXT_FELDER)[number], string | null>;
  for (const k of TEXT_FELDER) texte[k] = text(k);

  if (fehler.length > 0 || !firma || !domain || !datum) return { ok: false, fehler };
  return { ok: true, lauf: { firma, domain, datum, ampel: ampel as Ampel, ...zahlen, ...texte } };
}

/** Zerlegt eine Punkte-Liste ("a | b | c") in einzelne Punkte */
export function punkte(text: string | null | undefined): string[] {
  if (!text) return [];
  return text.split(' | ').map(p => p.trim()).filter(Boolean);
}

/** Jüngster Lauf je Firma, Firmen alphabetisch */
export function letzteJeFirma(laeufe: Pick<HealthcheckLauf, 'firma' | 'datum'>[]): typeof laeufe {
  const je = new Map<string, (typeof laeufe)[number]>();
  for (const l of laeufe) {
    const bisher = je.get(l.firma);
    if (!bisher || Date.parse(l.datum) > Date.parse(bisher.datum)) je.set(l.firma, l);
  }
  return [...je.values()].sort((a, b) => a.firma.localeCompare(b.firma, 'de'));
}

/** Datenbankgröße je Firma als Zeitreihe (aufsteigend), Läufe ohne db_mb fallen weg */
export function dbSerien(laeufe: Pick<HealthcheckLauf, 'firma' | 'datum' | 'db_mb'>[]): { firma: string; punkte: { t: number; mb: number }[] }[] {
  const je = new Map<string, { t: number; mb: number }[]>();
  for (const l of laeufe) {
    if (l.db_mb === null || l.db_mb === undefined) continue;
    const liste = je.get(l.firma) ?? [];
    liste.push({ t: Date.parse(l.datum), mb: Number(l.db_mb) });
    je.set(l.firma, liste);
  }
  return [...je.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'de'))
    .map(([firma, punkte]) => ({ firma, punkte: punkte.sort((a, b) => a.t - b.t) }));
}

const firmen = (n: number) => (n === 1 ? 'Firma' : 'Firmen');

/**
 * Ein Satz zum Gesamtstand über die jüngsten Läufe, z. B.
 * „Kein Handlungsbedarf. 1 von 1 Firma hat Hinweise.“
 */
export function gesamtSatz(letzte: Pick<HealthcheckLauf, 'ampel'>[]): string {
  const n = letzte.length;
  if (n === 0) return 'Noch keine Prüfläufe eingetragen.';
  const rot  = letzte.filter(l => l.ampel === 'rot').length;
  const gelb = letzte.filter(l => l.ampel === 'gelb').length;
  const teile: string[] = [];
  if (rot > 0) {
    teile.push(`Handlungsbedarf: ${rot} von ${n} ${firmen(n)} ${rot === 1 ? 'hat' : 'haben'} Alarme.`);
  } else {
    teile.push('Kein Handlungsbedarf.');
  }
  if (gelb > 0) teile.push(`${gelb} von ${n} ${firmen(n)} ${gelb === 1 ? 'hat' : 'haben'} Hinweise.`);
  if (rot === 0 && gelb === 0) teile.push(`${n === 1 ? 'Die Firma ist' : `Alle ${n} Firmen sind`} ohne Befund.`);
  return teile.join(' ');
}

export const AMPEL_LABEL: Record<Ampel, string> = { gruen: 'Grün', gelb: 'Gelb', rot: 'Rot' };
export const AMPEL_TON: Record<Ampel, 'good' | 'warn' | 'crit'> = { gruen: 'good', gelb: 'warn', rot: 'crit' };

const ZONE = 'Europe/Vienna';

/** 24.11.2026, 19:05 – immer Wiener Zeit, auch auf dem Server (UTC) */
export function zeitpunkt(iso: string): string {
  return new Intl.DateTimeFormat('de-AT', {
    timeZone: ZONE, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

export function zahl(v: number | null | undefined, einheit = ''): string {
  if (v === null || v === undefined) return '–';
  return `${new Intl.NumberFormat('de-AT', { maximumFractionDigits: 1 }).format(v)}${einheit ? ` ${einheit}` : ''}`;
}

/** Ton einer Kennzahl für die Kachel: über Schwelle gelb/rot */
export function kennzahlTon(feld: 'db_mb' | 'seiten_ms_max' | 'ssl_tage' | 'plugin_updates' | 'wartestellung', v: number | null): 'navy' | 'warn' | 'crit' {
  if (v === null) return 'navy';
  switch (feld) {
    case 'db_mb':          return v >= DB_GRENZE_MB ? 'crit' : v >= DB_GRENZE_MB * 0.8 ? 'warn' : 'navy';
    case 'seiten_ms_max':  return v >= 5000 ? 'crit' : v >= 2000 ? 'warn' : 'navy';
    case 'ssl_tage':       return v < 7 ? 'crit' : v < 21 ? 'warn' : 'navy';
    case 'plugin_updates': return v > 0 ? 'warn' : 'navy';
    case 'wartestellung':  return v > 0 ? 'warn' : 'navy';
  }
}
