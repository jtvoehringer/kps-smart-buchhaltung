// ============================================================
// Einheitliche Fehlerbehandlung für Supabase-Schreibvorgänge
//
// Im Projekt gab es kein einziges console.error, und an rund fünfzehn
// Stellen wurde das error-Objekt eines schreibenden Aufrufs vollständig
// verworfen. Ein fehlgeschlagener Schreibvorgang hinterliess damit
// weder eine Meldung noch eine Spur im Log – der Nutzer glaubte, es
// habe funktioniert.
// ============================================================

type SupabaseFehler = { message: string; code?: string; details?: string | null } | null;

/**
 * Übersetzt technische Postgres-Meldungen in etwas, das ein Klient
 * versteht. Alles Unbekannte wird unverändert durchgereicht – lieber
 * eine rohe Meldung als gar keine.
 */
export function fehlerText(fehler: SupabaseFehler, fallback = 'Unbekannter Fehler'): string {
  if (!fehler) return fallback;
  const m = fehler.message ?? '';

  if (/duplicate key value/i.test(m)) {
    if (/invoices_client_nr_uq/i.test(m)) return 'Diese Rechnungsnummer ist bereits vergeben.';
    if (/idx_transactions_bank_ref/i.test(m)) return 'Diese Bankbuchung wurde bereits importiert.';
    return 'Dieser Eintrag existiert bereits.';
  }
  if (/violates row-level security/i.test(m)) {
    return 'Keine Berechtigung für diesen Vorgang.';
  }
  if (/violates foreign key constraint/i.test(m)) {
    return 'Der Vorgang verweist auf einen Datensatz, den es nicht (mehr) gibt.';
  }
  if (/abgeschlossen und gesperrt|bereits eine UVA übermittelt|nicht verschoben werden/i.test(m)) {
    return m; // unsere eigenen, bereits verständlichen Meldungen
  }
  if (/violates check constraint/i.test(m)) {
    return 'Der Wert ist für dieses Feld nicht zulässig.';
  }
  if (/Could not find the .* column/i.test(m)) {
    return 'Die Datenbank ist nicht auf dem erwarteten Stand – bitte die ausstehenden Migrationen ausführen.';
  }
  return m || fallback;
}

/**
 * Meldet einen fehlgeschlagenen Schreibvorgang: Log für die Diagnose,
 * verständlicher Text für die Oberfläche.
 *
 * @returns true, wenn ein Fehler vorlag (dann sollte der Aufrufer abbrechen)
 */
export function meldeFehler(
  kontext: string,
  fehler: SupabaseFehler,
  anzeigen?: (text: string) => void,
): boolean {
  if (!fehler) return false;
  console.error(`[${kontext}]`, fehler);
  anzeigen?.(fehlerText(fehler));
  return true;
}

/** Lokales Datum als YYYY-MM-DD.
 *
 *  toISOString() liefert UTC. Am Monatsersten vor 02:00 Uhr (Sommerzeit)
 *  ergab das den Vortag – also unter Umständen einen bereits
 *  abgeschlossenen oder gemeldeten Zeitraum.
 */
export function heute(): string {
  return new Date().toLocaleDateString('en-CA');
}

/** Lokales Datum eines Date-Objekts als YYYY-MM-DD. */
export function alsDatum(d: Date): string {
  return d.toLocaleDateString('en-CA');
}
