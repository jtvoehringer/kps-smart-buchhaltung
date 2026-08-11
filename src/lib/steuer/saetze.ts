// ============================================================
// Österreichische Steuersätze und Grenzbeträge – zentral und datiert
//
// WARUM DATIERT: Buchungen werden rückwirkend erfasst und später
// bearbeitet. Ändert der Gesetzgeber einen Satz zum 1.1., muss eine
// Buchung aus dem Vorjahr weiterhin mit dem damals gültigen Satz
// rechnen – sonst ändert sich eine bereits gemeldete UVA still.
//
// PFLEGE: Bei einer Satzänderung NUR hier einen neuen Eintrag mit
// gueltigAb ergänzen. Nichts anderes im Code anfassen. Alle
// Anzeigetexte in den Formularen interpolieren diese Werte.
// ============================================================

export type ReiseSaetze = {
  /** Gültig ab diesem Datum (ISO, YYYY-MM-DD) */
  gueltigAb: string;
  /** Amtliches Kilometergeld PKW in € je km */
  kmSatz: number;
  /** Volles Taggeld Inland in € pro 24-Stunden-Zeitraum */
  taggeld: number;
  /** Mindestdauer in Stunden, ab der überhaupt Taggeld zusteht (mehr als) */
  taggeldMindestStunden: number;
  /** Nächtigungspauschale Inland in € pro Nacht (inkl. Frühstück) */
  naechtigung: number;
  /** Jahreshöchstgrenze Kilometergeld in km */
  kmJahresgrenze: number;
};

// Neueste Einträge nach unten anhängen, aufsteigend nach gueltigAb.
export const REISE_SAETZE: ReiseSaetze[] = [
  {
    gueltigAb: '2025-01-01',
    kmSatz: 0.50,
    taggeld: 30,
    taggeldMindestStunden: 3,
    naechtigung: 17,
    kmJahresgrenze: 30000,
  },
];

export type EAutoGrenzen = {
  gueltigAb: string;
  /** Angemessenheitsgrenze BRUTTO (inkl. USt und NoVA) in € */
  angemessenheitsgrenzeBrutto: number;
  /** Ab diesem Bruttobetrag steht überhaupt kein Vorsteuerabzug mehr zu */
  ausschlussgrenzeBrutto: number;
};

export const EAUTO_GRENZEN: EAutoGrenzen[] = [
  {
    gueltigAb: '2020-01-01',
    angemessenheitsgrenzeBrutto: 40000,
    ausschlussgrenzeBrutto: 80000,
  },
];

export type KleinunternehmerGrenzen = {
  gueltigAb: string;
  /** Umsatzgrenze in € */
  grenze: number;
  /** Toleranzgrenze in € (einmalige Überschreitung) */
  toleranz: number;
};

export const KU_GRENZEN: KleinunternehmerGrenzen[] = [
  { gueltigAb: '2025-01-01', grenze: 55000, toleranz: 60500 },
];

/**
 * Liefert den zum Stichtag gültigen Eintrag – den letzten, dessen
 * gueltigAb nicht in der Zukunft liegt. Ohne Datum gilt heute.
 * Fällt auf den ältesten Eintrag zurück, wenn das Datum davor liegt.
 */
export function saetzeFuer<T extends { gueltigAb: string }>(
  tabelle: T[],
  datum?: string | null,
): T {
  const stichtag = datum && /^\d{4}-\d{2}-\d{2}/.test(datum)
    ? datum.slice(0, 10)
    : new Date().toLocaleDateString('en-CA');

  let treffer = tabelle[0];
  for (const eintrag of tabelle) {
    if (eintrag.gueltigAb <= stichtag) treffer = eintrag;
  }
  return treffer;
}

export const reiseSaetzeFuer = (datum?: string | null) => saetzeFuer(REISE_SAETZE, datum);
export const eAutoGrenzenFuer = (datum?: string | null) => saetzeFuer(EAUTO_GRENZEN, datum);
export const kuGrenzenFuer    = (datum?: string | null) => saetzeFuer(KU_GRENZEN, datum);

/** Kaufmännisch auf Cent runden, ohne Fließkomma-Abrundungsfehler. */
export function aufCent(betrag: number): number {
  return Math.round((betrag + Number.EPSILON * Math.sign(betrag) * Math.abs(betrag)) * 100) / 100;
}
