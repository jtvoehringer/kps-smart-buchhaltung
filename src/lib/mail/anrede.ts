// ============================================================
// Briefanrede für den Rechnungsversand
//
// Vorher wurde die Bezeichnung aus dem Kundenstamm an die Grußformel
// angehängt: "Sehr geehrte Damen und Herren, Musterfirma GmbH," –
// die Firmenbezeichnung ist aber kein Ansprechpartner und hat in der
// Anrede nichts verloren.
//
// Maßgeblich ist der Kontakt ("Fr./Hrn. Vorname Nachname" aus den
// Stammdaten bzw. das "z.H."-Feld der Rechnung). Aus dem Kürzel wird
// die richtige Ansprache gebildet; ohne Kontakt bleibt es beim
// neutralen "Sehr geehrte Damen und Herren,".
// ============================================================

const WEIBLICH = /^(fr\.?|frau)\s+(.+)$/i;
const MAENNLICH = /^(hrn\.?|hr\.?|herrn?)\s+(.+)$/i;

/**
 * Bildet die Grußzeile einer E-Mail aus dem hinterlegten Kontakt.
 * Liefert die komplette Zeile inklusive Beistrich am Ende.
 */
export function anrede(kontakt?: string | null): string {
  const k = String(kontakt ?? '').trim().replace(/\s+/g, ' ');
  if (!k) return 'Sehr geehrte Damen und Herren,';

  const frau = k.match(WEIBLICH);
  if (frau) return `Sehr geehrte Frau ${frau[2].trim()},`;

  const herr = k.match(MAENNLICH);
  if (herr) return `Sehr geehrter Herr ${herr[2].trim()},`;

  // Kontakt ohne erkennbares Kürzel ("Maria Huber"): neutral ansprechen,
  // statt ein Geschlecht zu raten.
  return `Guten Tag, ${k},`;
}
