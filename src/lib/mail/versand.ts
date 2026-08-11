// ============================================================
// Gemeinsame Grundlagen für den E-Mail-Versand
//
// Beide Versandwege (Rechnung und App-Einladung) hatten dieselben
// drei Lücken:
//
//   1. Firmenname und andere Freitexte landeten ungeprüft im
//      HTML-Teil der Mail. Wer in den Stammdaten einen Firmennamen
//      mit Markup hinterlegt, schreibt damit im Namen der Kanzlei
//      beliebige Links in eine Mail, die der Empfänger für echt hält.
//   2. Die Empfängeradresse wurde beim Rechnungsversand gar nicht
//      geprüft.
//   3. Es gab keine Mengenbegrenzung. Ein angemeldeter Benutzer
//      konnte über die Absenderdomäne der Kanzlei beliebig viele
//      Mails an beliebige Adressen schicken.
// ============================================================

/** Konservativ: eine Adresse, keine Liste, keine Steuerzeichen. */
export function istEmail(s: string): boolean {
  if (!s || s.length > 254) return false;
  if (/[\s,;<>"\\]/.test(s)) return false;
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(s);
}

/** Für Text, der in einen HTML-Mailtext eingesetzt wird. */
export function htmlEscape(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Basisadresse der Anwendung.
 *
 * Bevorzugt die konfigurierte Adresse. Ohne Konfiguration wird die
 * Herkunft des Requests genommen – das funktioniert auf Vercel-Preview-
 * Deployments zuverlässig, hängt aber am Host-Header. Wer die Links in
 * versendeten Mails festnageln will, setzt NEXT_PUBLIC_APP_URL.
 */
export function appBasisUrl(fallbackOrigin: string): string {
  const konfiguriert = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (konfiguriert && /^https?:\/\//.test(konfiguriert)) {
    return konfiguriert.replace(/\/+$/, '');
  }
  return fallbackOrigin.replace(/\/+$/, '');
}

export type Versandzweck = 'rechnung' | 'app_einladung';

/** Wie viele Mails je Mandant und Stunde. */
export const VERSAND_LIMIT: Record<Versandzweck, number> = {
  rechnung: 50,
  app_einladung: 10,
};

type RpcErgebnis = { error: { message: string } | null };

/** Nur der Teil des Supabase-Clients, den wir hier brauchen. */
export type AdminClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RpcErgebnis>;
};

export type VersandPruefung = { ok: boolean; fehler?: string };

/**
 * Zählt den Versand mit und weist ihn ab, sobald das Stundenlimit
 * erreicht ist. Der Eintrag dient zugleich als Nachweis, wann an wen
 * etwas geschickt wurde.
 */
export async function versandProtokollieren(
  admin: AdminClient,
  args: { clientId: string; userId: string; zweck: Versandzweck; empfaenger: string },
): Promise<VersandPruefung> {
  const { error } = await admin.rpc('email_versand_protokollieren', {
    p_client_id:  args.clientId,
    p_user_id:    args.userId,
    p_zweck:      args.zweck,
    p_empfaenger: args.empfaenger,
    p_limit:      VERSAND_LIMIT[args.zweck],
  });

  if (error) {
    // Die Funktion meldet ein erreichtes Limit als Ausnahme.
    if (/limit/i.test(error.message)) {
      return { ok: false, fehler: error.message };
    }
    return { ok: false, fehler: `Versand konnte nicht protokolliert werden: ${error.message}` };
  }
  return { ok: true };
}
