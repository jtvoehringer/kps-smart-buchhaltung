// ============================================================
// BMD-NTCS-Export – Aufbereitung der Buchungszeilen
//
// Die Logik liegt bewusst getrennt von der Route, damit sie
// testbar ist. Behoben werden hier vier Fehler des alten Exports:
//
//   1. Der Antwort-Header versprach ISO-8859-1, geliefert wurden aber
//      UTF-8-Bytes. Umlaute kamen im BMD als "Ã¤" an.
//   2. Es gab kein CSV-Quoting. Ein Buchungstext mit Zeilenumbruch
//      (aus dem Bankimport durchaus üblich) zerriss die Zeile und
//      verschob alle folgenden Spalten.
//   3. Die Belegnummer stammte aus dem Index der Ergebnisliste und
//      änderte sich bei jedem Export. Jetzt kommt sie aus der
//      Datenbank (Migration 030) und bleibt konstant.
//   4. Das Konto war fest auf 4000/5000 verdrahtet, obwohl an jeder
//      Kategorie eine Kontonummer hinterlegt werden kann.
//
// Zusätzlich führt der Export jetzt die Angaben mit, ohne die die
// Kanzlei die Buchung nicht abschließend beurteilen kann: die
// UVA-Kennzahl, Anlass und Teilnehmer einer Bewirtung sowie die
// Reisedaten.
// ============================================================

import { uvaKennzahlFuer, type UstKennzeichen } from '@/lib/steuer/uva-kennzahlen';

export type BmdTransaction = {
  id: string;
  booking_date: string;
  description: string | null;
  type: 'income' | 'expense';
  amount_net: number;
  vat_amount: number;
  amount_gross: number;
  vat_rate: number;
  beleg_jahr: number | null;
  beleg_nr: number | null;
  ust_kennzeichen: UstKennzeichen | null;
  is_eauto: boolean | null;
  bewirtung_anlass: string | null;
  bewirtung_teilnehmer: string | null;
  reise_typ: string | null;
  reise_ziel: string | null;
  reise_zweck: string | null;
  reise_von: string | null;
  reise_bis: string | null;
  reise_km: number | null;
  reise_stunden: number | null;
  category?: { name: string; konto_nr: string | null } | null;
};

export type BmdZeile = {
  datum: string;
  belegnr: string;
  text: string;
  netto: string;
  steuerProzent: number;
  steuer: string;
  brutto: string;
  konto: string;
  steuercode: string;
  kategorie: string;
  bewirtungAnlass: string;
  bewirtungTeilnehmer: string;
  reise: string;
  hinweis: string;
  type: 'income' | 'expense';
};

/** BMD NTCS: Dezimalzahl mit Komma, ohne Tausendertrennung. */
export function bmdNum(n: number): string {
  const v = Number(n);
  return (Number.isFinite(v) ? v : 0).toFixed(2).replace('.', ',');
}

/** BMD NTCS: Datum TT.MM.JJJJ. */
export function bmdDate(iso: string): string {
  const [y, m, d] = String(iso).split('T')[0].split('-');
  return `${d}.${m}.${y}`;
}

/** Fallback, solange an der Kategorie keine Kontonummer hinterlegt ist. */
export function standardKonto(type: string): string {
  return type === 'income' ? '4000' : '5000';
}

export function belegnummer(t: Pick<BmdTransaction, 'beleg_jahr' | 'beleg_nr' | 'id'>): string {
  if (t.beleg_nr == null) {
    // Sollte nach Migration 030 nicht mehr vorkommen. Statt einer
    // frei erfundenen laufenden Nummer lieber ein erkennbares
    // Ersatzkennzeichen, das sich auf die Buchung zurückführen lässt.
    return `X-${String(t.id).slice(0, 8)}`;
  }
  const jahr = t.beleg_jahr ?? 0;
  return `${jahr}/${String(t.beleg_nr).padStart(5, '0')}`;
}

function reiseText(t: BmdTransaction): string {
  if (!t.reise_typ) return '';
  const teile: string[] = [];
  const typ: Record<string, string> = {
    km: 'Kilometergeld', diaeten: 'Diäten', naechtigung: 'Nächtigung',
  };
  teile.push(typ[t.reise_typ] ?? t.reise_typ);
  if (t.reise_ziel)    teile.push(t.reise_ziel);
  if (t.reise_zweck)   teile.push(t.reise_zweck);
  if (t.reise_von)     teile.push(t.reise_bis && t.reise_bis !== t.reise_von
                                   ? `${bmdDate(t.reise_von)}–${bmdDate(t.reise_bis)}`
                                   : bmdDate(t.reise_von));
  if (t.reise_km)      teile.push(`${t.reise_km} km`);
  if (t.reise_stunden) teile.push(`${t.reise_stunden} h`);
  return teile.join(' | ');
}

function hinweisText(t: BmdTransaction): string {
  const h: string[] = [];
  if (t.bewirtung_anlass || t.bewirtung_teilnehmer) {
    h.push('Bewirtung: einkommensteuerlich nur 50 % abzugsfähig (§ 20 Abs. 1 Z 3 EStG)');
  }
  if (t.is_eauto) {
    h.push('E-Auto: Vorsteuerabzug nur bis zur Angemessenheitsgrenze');
  }
  if (t.reise_typ === 'km' || t.reise_typ === 'diaeten' || t.reise_typ === 'naechtigung') {
    h.push('Pauschale ohne Vorsteuerabzug');
  }
  if (t.ust_kennzeichen === 'ig_lieferung' || t.ust_kennzeichen === 'reverse_charge_ausgang') {
    h.push('Zusammenfassende Meldung erforderlich');
  }
  if (t.ust_kennzeichen === 'ig_erwerb') {
    h.push('Erwerbsteuer und Vorsteuer im selben Zeitraum');
  }
  return h.join('; ');
}

/** Einzeiliger Text – Zeilenumbrüche würden die CSV-Struktur zerreißen. */
function einzeilig(s: string | null | undefined): string {
  return String(s ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();
}

export function baueBmdZeilen(transactions: BmdTransaction[]): BmdZeile[] {
  return transactions.map(t => {
    const net   = Number(t.amount_net)   || 0;
    const vat   = Number(t.vat_amount)   || 0;
    const gross = Number(t.amount_gross) || 0;
    // Ausgaben als negative Werte im BMD
    const sign  = t.type === 'expense' ? -1 : 1;

    return {
      datum:               bmdDate(t.booking_date),
      belegnr:             belegnummer(t),
      text:                einzeilig(t.description),
      netto:               bmdNum(sign * net),
      steuerProzent:       Number(t.vat_rate) || 0,
      steuer:              bmdNum(sign * vat),
      brutto:              bmdNum(sign * gross),
      konto:               t.category?.konto_nr?.trim() || standardKonto(t.type),
      steuercode:          uvaKennzahlFuer(t.type, t.ust_kennzeichen, Number(t.vat_rate) || 0),
      kategorie:           einzeilig(t.category?.name),
      bewirtungAnlass:     einzeilig(t.bewirtung_anlass),
      bewirtungTeilnehmer: einzeilig(t.bewirtung_teilnehmer),
      reise:               einzeilig(reiseText(t)),
      hinweis:             hinweisText(t),
      type:                t.type,
    };
  });
}

// ============================================================
// CSV
// ============================================================

export const BMD_SPALTEN = [
  'Datum', 'BelegNr', 'Text', 'Netto', 'Steuer%', 'Steuer', 'Brutto', 'Konto',
  'UVA-Kz', 'Kategorie', 'Bewirtung-Anlass', 'Bewirtung-Teilnehmer', 'Reise', 'Hinweis',
] as const;

/**
 * Ein Feld nach RFC 4180: enthält es Trennzeichen, Anführungszeichen
 * oder einen Umbruch, wird es eingefasst und innere Anführungszeichen
 * werden verdoppelt.
 */
export function csvFeld(wert: string | number): string {
  const s = String(wert ?? '');
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function baueBmdCsv(zeilen: BmdZeile[]): string {
  const kopf = BMD_SPALTEN.join(';');
  const rest = zeilen.map(z => [
    z.datum, z.belegnr, z.text, z.netto, z.steuerProzent, z.steuer, z.brutto, z.konto,
    z.steuercode, z.kategorie, z.bewirtungAnlass, z.bewirtungTeilnehmer, z.reise, z.hinweis,
  ].map(csvFeld).join(';'));
  // Abschließender Umbruch: manche Importer verschlucken sonst die letzte Zeile.
  return [kopf, ...rest].join('\r\n') + '\r\n';
}

// ============================================================
// Zeichensatz
// ============================================================

/**
 * Zeichen, die in UTF-8 üblich sind, in Windows-1252 aber an einer
 * anderen Stelle stehen. Ohne diese Übersetzung würden Gedankenstrich,
 * typografische Anführungszeichen und das Euro-Zeichen im BMD als
 * Fragezeichen ankommen.
 */
const CP1252_SONDER: Record<string, number> = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84,
  '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88,
  '‰': 0x89, 'Š': 0x8A, '‹': 0x8B, 'Œ': 0x8C,
  'Ž': 0x8E, '‘': 0x91, '’': 0x92, '“': 0x93,
  '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97,
  '˜': 0x98, '™': 0x99, 'š': 0x9A, '›': 0x9B,
  'œ': 0x9C, 'ž': 0x9E, 'Ÿ': 0x9F,
};

/** Notbehelf für Zeichen, die es in Windows-1252 gar nicht gibt. */
const ERSATZ: Record<string, string> = {
  '\u2192': '->', '\u2190': '<-', '\u2264': '<=', '\u2265': '>=',
  // geschütztes, schmales und Null-Breite-Leerzeichen
  '\u00a0': ' ', '\u202f': ' ', '\u2009': ' ', '\u200b': '',
};

/**
 * Kodiert nach Windows-1252 – das ist der Zeichensatz, den BMD NTCS
 * beim CSV-Import erwartet und den der Header dieser Antwort auch
 * ankündigt. Alles, was sich nicht abbilden lässt, wird zu "?", damit
 * die Spaltenstruktur in jedem Fall erhalten bleibt.
 */
export function nachCp1252(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const zeichen of text) {
    const ersetzt = ERSATZ[zeichen];
    if (ersetzt !== undefined) {
      for (const c of ersetzt) bytes.push(c.charCodeAt(0));
      continue;
    }
    const sonder = CP1252_SONDER[zeichen];
    if (sonder !== undefined) {
      bytes.push(sonder);
      continue;
    }
    const code = zeichen.codePointAt(0) ?? 63;
    bytes.push(code <= 0xff ? code : 0x3f);
  }
  return Uint8Array.from(bytes);
}

/** Kontrollsumme, damit die Kanzlei den Import gegenprüfen kann. */
export function bmdSummen(transactions: BmdTransaction[]) {
  let netto = 0, steuer = 0, brutto = 0;
  for (const t of transactions) {
    const sign = t.type === 'expense' ? -1 : 1;
    netto  += sign * (Number(t.amount_net)   || 0);
    steuer += sign * (Number(t.vat_amount)   || 0);
    brutto += sign * (Number(t.amount_gross) || 0);
  }
  const r = (n: number) => Math.round(n * 100) / 100;
  return { anzahl: transactions.length, netto: r(netto), steuer: r(steuer), brutto: r(brutto) };
}
