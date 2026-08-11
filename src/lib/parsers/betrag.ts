// ============================================================
// Betragsparser für Bank-Exporte
//
// Die frühere Umsetzung entfernte den Tausenderpunkt nur, wenn direkt
// drei Ziffern UND ein Komma folgten:
//     .replace(/\.(?=\d{3}[,])/g, '')
// Damit blieb bei mehreren Tausendergruppen der erste Punkt stehen und
// parseFloat brach am zweiten ab:
//     "1.234.567,89"  ->  1.234567     (1,23 € statt 1.234.567,89 €)
//     "1.234"         ->  1.234        (statt 1234,00)
// Nachgestellte Minuszeichen, wie sie österreichische und deutsche
// Banken exportieren, wurden ignoriert:
//     "1.234,56-"     -> +1234.56      (Ausgabe wurde zur Einnahme)
//
// Der Parser hier bestimmt das Dezimaltrennzeichen aus der Position
// des LETZTEN Trenners und behandelt Vorzeichen explizit.
// ============================================================

/**
 * Parst einen Betrag aus einem Bank-Export.
 * Erkennt deutsches ("1.234,56") und englisches ("1,234.56") Format,
 * führendes und nachgestelltes Minus sowie Klammern für negative Werte.
 * Gibt null zurück, wenn kein plausibler Betrag erkennbar ist.
 */
export function parseBetrag(raw: string | null | undefined): number | null {
  if (raw == null) return null;

  let s = String(raw).trim();
  if (!s) return null;

  // Anführungszeichen, Währungssymbole und Leerzeichen entfernen
  s = s.replace(/["']/g, '')
       .replace(/\s| /g, '')
       .replace(/EUR|€/gi, '');
  if (!s) return null;

  // Vorzeichen bestimmen: führendes -, nachgestelltes - oder Klammern
  let negativ = false;
  if (/^\(.*\)$/.test(s)) { negativ = true; s = s.slice(1, -1); }
  if (s.startsWith('-')) { negativ = true; s = s.slice(1); }
  else if (s.startsWith('+')) { s = s.slice(1); }
  if (s.endsWith('-')) { negativ = true; s = s.slice(0, -1); }
  else if (s.endsWith('+')) { s = s.slice(0, -1); }

  if (!s) return null;
  // Ab hier sind nur noch Ziffern, Punkte und Kommata zulässig
  if (!/^[\d.,]+$/.test(s)) return null;

  const letztesKomma = s.lastIndexOf(',');
  const letzterPunkt = s.lastIndexOf('.');
  let ganzzahl: string;
  let nachkomma = '';

  if (letztesKomma === -1 && letzterPunkt === -1) {
    ganzzahl = s;
  } else {
    // Der weiter hinten stehende Trenner ist der Dezimaltrenner –
    // sofern danach 1 bis 2 Stellen folgen. Bei genau 3 Stellen ist es
    // eine Tausendergruppe ("1.234" = eintausendzweihundertvierunddreißig).
    const trennPos = Math.max(letztesKomma, letzterPunkt);
    const rest = s.slice(trennPos + 1);

    if (/^\d{1,2}$/.test(rest)) {
      ganzzahl  = s.slice(0, trennPos);
      nachkomma = rest;
    } else if (/^\d{3}$/.test(rest)) {
      // Mehrdeutig. Kommt derselbe Trenner mehrfach vor oder steht auch
      // der andere Trenner im Text, ist es sicher ein Tausendertrenner.
      const trennZeichen = s[trennPos];
      const anzahl = s.split(trennZeichen).length - 1;
      const andererVorhanden = letztesKomma !== -1 && letzterPunkt !== -1;
      if (anzahl > 1 || andererVorhanden) {
        ganzzahl = s;
      } else {
        // Einzelner Trenner mit drei Folgestellen: als Tausendertrenner
        // lesen. Bankexporte schreiben Nachkommastellen praktisch immer
        // zweistellig, "1.234" meint 1234,00.
        ganzzahl = s;
      }
    } else {
      ganzzahl = s;
    }
  }

  // Alle verbliebenen Trenner sind Tausendertrenner
  ganzzahl = ganzzahl.replace(/[.,]/g, '');
  if (!/^\d*$/.test(ganzzahl)) return null;
  if (ganzzahl === '' && nachkomma === '') return null;

  const wert = Number(`${ganzzahl || '0'}.${nachkomma || '0'}`);
  if (!Number.isFinite(wert)) return null;

  return negativ ? -wert : wert;
}
