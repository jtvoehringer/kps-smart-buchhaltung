// ============================================================
// Vorsteuerabzug bei emissionsfreien Kraftfahrzeugen
// § 12 Abs. 2 Z 2 lit. b UStG i.V.m. PKW-Angemessenheitsverordnung
//
// PKW sind grundsätzlich vom Vorsteuerabzug ausgeschlossen.
// Emissionsfreie Fahrzeuge sind davon ausgenommen – aber nur
// innerhalb der Angemessenheitsgrenze.
//
// WICHTIG: Die Grenze ist ein BRUTTOwert inklusive Umsatzsteuer und
// NoVA. Die frühere Umsetzung prüfte den Nettobetrag gegen 40.000
// und gewährte dadurch bei einem Fahrzeug für 46.800 brutto die
// volle Vorsteuer von 7.800 statt der zustehenden 6.666,67.
//
// Staffelung nach herrschender Auffassung (UStR Rz 2934):
//   bis 40.000 brutto      -> voller Vorsteuerabzug
//   40.000–80.000 brutto   -> aliquot im Verhältnis 40.000 / Brutto
//   über 80.000 brutto     -> kein Vorsteuerabzug
//
// Die nicht abzugsfähige Vorsteuer ist Teil der Anschaffungskosten
// und damit AfA-Basis – sie darf nicht verschwinden. Dafür liefert
// diese Funktion aktivierungsNetto.
// ============================================================

import { eAutoGrenzenFuer, aufCent } from './saetze';

export type EAutoStufe = 'voll' | 'aliquot' | 'kein_abzug';

export type EAutoBerechnung = {
  /** Anschaffungskosten brutto (Eingabewert, gerundet) */
  bruttoAnschaffung: number;
  /** Gesamte in den Anschaffungskosten enthaltene USt */
  vstGesamt: number;
  /** Davon tatsächlich abzugsfähig */
  vstAbzugsfaehig: number;
  /** Nicht abzugsfähiger Teil – gehört zu den Anschaffungskosten */
  vstNichtAbzugsfaehig: number;
  /**
   * Als amount_net zu buchender Betrag: Nettopreis zuzüglich der
   * nicht abzugsfähigen Vorsteuer. Zusammen mit vstAbzugsfaehig
   * ergibt das exakt den bezahlten Bruttobetrag.
   */
  aktivierungsNetto: number;
  stufe: EAutoStufe;
  angemessenheitsgrenzeBrutto: number;
  ausschlussgrenzeBrutto: number;
};

/**
 * @param bruttoAnschaffung Kaufpreis inkl. USt und NoVA
 * @param ustSatz           Regelfall 20
 * @param datum             Anschaffungsdatum, steuert die gültigen Grenzen
 */
export function berechneEAutoVorsteuer(
  bruttoAnschaffung: number,
  ustSatz: number = 20,
  datum?: string | null,
): EAutoBerechnung {
  const g = eAutoGrenzenFuer(datum);
  const brutto = Number.isFinite(bruttoAnschaffung) && bruttoAnschaffung > 0
    ? aufCent(bruttoAnschaffung)
    : 0;

  const netto = ustSatz > 0 ? brutto / (1 + ustSatz / 100) : brutto;
  const vstGesamt = aufCent(brutto - netto);

  let stufe: EAutoStufe;
  let vstAbzugsfaehig: number;

  if (brutto <= g.angemessenheitsgrenzeBrutto) {
    stufe = 'voll';
    vstAbzugsfaehig = vstGesamt;
  } else if (brutto <= g.ausschlussgrenzeBrutto) {
    stufe = 'aliquot';
    vstAbzugsfaehig = aufCent(vstGesamt * (g.angemessenheitsgrenzeBrutto / brutto));
  } else {
    stufe = 'kein_abzug';
    vstAbzugsfaehig = 0;
  }

  const vstNichtAbzugsfaehig = aufCent(vstGesamt - vstAbzugsfaehig);

  return {
    bruttoAnschaffung: brutto,
    vstGesamt,
    vstAbzugsfaehig,
    vstNichtAbzugsfaehig,
    // Rest auf den Bruttobetrag – so stimmt amount_net + vat_amount
    // immer exakt mit dem bezahlten Betrag überein.
    aktivierungsNetto: aufCent(brutto - vstAbzugsfaehig),
    stufe,
    angemessenheitsgrenzeBrutto: g.angemessenheitsgrenzeBrutto,
    ausschlussgrenzeBrutto: g.ausschlussgrenzeBrutto,
  };
}
