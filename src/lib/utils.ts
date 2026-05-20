// ============================================================
// Hilfsfunktionen – werden überall im Projekt genutzt
// ============================================================

/** Zahl als österreichisches Währungsformat, z.B. € 1.234,56 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('de-AT', {
    style: 'currency',
    currency: 'EUR',
  }).format(value);
}

/** Datum als österreichisches Format, z.B. 15.03.2026 */
export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('de-AT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(date));
}

/** Monatsname auf Deutsch */
export const MONTH_NAMES = [
  'Jänner','Februar','März','April','Mai','Juni',
  'Juli','August','September','Oktober','November','Dezember',
];

/** USt berechnen */
export function calcVat(amountNet: number, vatRate: number): number {
  return Math.round((amountNet * vatRate / 100) * 100) / 100;
}

/** CSS-Klassen zusammenführen (Tailwind-kompatibel) */
export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
