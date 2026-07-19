// ============================================================
// Hilfsfunktionen – werden überall im Projekt genutzt
// ============================================================

/** Zahl als österreichisches Zahlenformat, z.B. 1.234,56 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('de-AT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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

// ============================================================
// UVA-Berechnung (gemeinsam für UVAClient + uva/drucken)
// ============================================================

export const VAT_RATES = [0, 10, 13, 20] as const;
export type VatRate = typeof VAT_RATES[number];

export type UVATransaction = {
  type: 'income' | 'expense';
  amount_net: number;
  vat_rate: number;
  vat_amount: number;
};

export type UVARateEntry = { bemessungsgrundlage: number; steuer: number };

export type UVAResult = {
  ustByRate: Record<number, UVARateEntry>;
  vstByRate: Record<number, UVARateEntry>;
  totalUSt: number;
  totalVSt: number;
  zahllast: number;
};

/** Berechnet USt / VSt gruppiert nach Steuersatz aus einer Liste von Buchungen. */
export function calculateUVA(transactions: UVATransaction[]): UVAResult {
  const ustByRate: Record<number, UVARateEntry> = {};
  const vstByRate: Record<number, UVARateEntry> = {};

  VAT_RATES.forEach(r => {
    ustByRate[r] = { bemessungsgrundlage: 0, steuer: 0 };
    vstByRate[r] = { bemessungsgrundlage: 0, steuer: 0 };
  });

  transactions.forEach(t => {
    const rate = VAT_RATES.includes(t.vat_rate as VatRate) ? t.vat_rate : 0;
    if (t.type === 'income') {
      ustByRate[rate].bemessungsgrundlage += Number(t.amount_net)   || 0;
      ustByRate[rate].steuer              += Number(t.vat_amount)   || 0;
    } else {
      vstByRate[rate].bemessungsgrundlage += Number(t.amount_net)   || 0;
      vstByRate[rate].steuer              += Number(t.vat_amount)   || 0;
    }
  });

  const totalUSt = VAT_RATES.reduce((s, r) => s + ustByRate[r].steuer, 0);
  const totalVSt = VAT_RATES.reduce((s, r) => s + vstByRate[r].steuer, 0);
  const zahllast = totalUSt - totalVSt;

  return { ustByRate, vstByRate, totalUSt, totalVSt, zahllast };
}
