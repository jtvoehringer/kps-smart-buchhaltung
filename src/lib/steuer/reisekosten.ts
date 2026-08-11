// ============================================================
// Reisekosten Inland – § 26 Z 4 EStG, § 4 Abs. 5 EStG
//
// Ersetzt die bisherigen drei identischen Kopien in
// BuchungForm.tsx, BuchungBearbeitenForm.tsx und BelegeClient.tsx.
// ============================================================

import { reiseSaetzeFuer, aufCent } from './saetze';

export type ReiseTyp =
  | 'kilometergeld'
  | 'fahrtkosten'
  | 'naechtigung'
  | 'diaeten'
  | 'konsumation';

/**
 * Amtliches Kilometergeld. Pauschale ohne Vorsteuerabzug –
 * der Steuersatz gehört deshalb immer auf 0 %.
 */
export function berechneKilometergeld(km: number, datum?: string | null): number {
  const s = reiseSaetzeFuer(datum);
  if (!Number.isFinite(km) || km <= 0) return 0;
  return aufCent(km * s.kmSatz);
}

/**
 * Taggeld (Diäten) Inland.
 *
 * Regel (§ 26 Z 4 EStG):
 *   - Dauer bis einschließlich 3 Stunden: kein Taggeld
 *   - über 3 Stunden: 1/12 des Tagessatzes je ANGEFANGENER Stunde
 *   - ab der 12. angefangenen Stunde: voller Tagessatz
 *   - Reisen über 24 Stunden: je vollem 24-Stunden-Zeitraum der volle
 *     Tagessatz, der Rest wieder nach der Zwölftel-Regel
 *
 * Beispiele mit den Sätzen 2025/2026 (30,00 € / 2,50 € je Stunde):
 *   3,0 h  ->  0,00   (mehr als 3 Stunden verlangt)
 *   3,5 h  -> 10,00   (4 angefangene Stunden)
 *  10,0 h  -> 25,00
 *  11,0 h  -> 27,50   (nicht 30,00 – voller Satz erst ab der 12.)
 *  11,5 h  -> 30,00
 *  24,0 h  -> 30,00
 *  58,0 h  -> 85,00   (2 volle Tage + 10 angefangene Stunden)
 *  72,0 h  -> 90,00
 */
export function berechneDiaeten(stunden: number, datum?: string | null): number {
  const s = reiseSaetzeFuer(datum);
  if (!Number.isFinite(stunden) || stunden <= s.taggeldMindestStunden) return 0;

  const zwoelftel = s.taggeld / 12;
  const volleTage = Math.floor(stunden / 24);
  const restStunden = stunden - volleTage * 24;

  let betrag = volleTage * s.taggeld;

  // Der Rest zählt nur, wenn er selbst die Mindestdauer überschreitet.
  if (restStunden > s.taggeldMindestStunden) {
    betrag += Math.min(12, Math.ceil(restStunden)) * zwoelftel;
  }

  return aufCent(betrag);
}

/** Nächtigungspauschale Inland je Nacht, alternativ zum Hotelbeleg. */
export function berechneNaechtigung(naechte: number, datum?: string | null): number {
  const s = reiseSaetzeFuer(datum);
  if (!Number.isFinite(naechte) || naechte <= 0) return 0;
  return aufCent(naechte * s.naechtigung);
}

/**
 * Vorgeschlagener Umsatzsteuersatz je Reisekostenart.
 * Kilometergeld und Diäten sind Pauschalen ohne Vorsteuerabzug.
 * Bei den übrigen Arten fällt regulär Vorsteuer an – der Vorschlag
 * ist änderbar, verhindert aber, dass eine Hotelrechnung
 * versehentlich mit 0 % gebucht wird.
 */
export function vorgeschlagenerSteuersatz(typ: ReiseTyp | ''): 0 | 10 | 13 | 20 {
  switch (typ) {
    case 'kilometergeld':
    case 'diaeten':
      return 0;   // Pauschale, kein Vorsteuerabzug
    case 'naechtigung':
    case 'fahrtkosten':
      return 10;  // Beherbergung und Personenbeförderung
    case 'konsumation':
      return 20;  // im Zweifel Normalsteuersatz, bei Speisen ggf. 10 %
    default:
      return 20;
  }
}

/** Ist der Betrag bei dieser Reisekostenart rechnerisch vorgegeben? */
export function istPauschale(typ: ReiseTyp | ''): boolean {
  return typ === 'kilometergeld' || typ === 'diaeten';
}
