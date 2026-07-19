// ============================================================
// Bank-CSV Parser – Österreichische Banken (AT)
// Unterstützt:
//   meinElba (Erste Bank/Sparkasse/RLB) – kein Header
//   Raiffeisen Business – mit Header
//   BAWAG/easybank – mit Header
//   Generisch – mit Header
// ============================================================

import type { ParsedBankEntry } from './camt053';

export type CsvParseResult = {
  entries:  ParsedBankEntry[];
  errors:   string[];
  bankHint: string;
};

/** CSV-Zeile splitten (Semikolon oder Komma, mit Quote-Handling) */
function splitLine(line: string, sep: string): string[] {
  const result: string[] = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (!inQ && c === sep) { result.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  result.push(cur.trim());
  return result;
}

/** Deutschen Betrag parsen: "1.234,56" / "-1.234,56" / "1234.56" → number */
function parseAmount(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s/g, '')
    .replace(/\.(?=\d{3}[,])/g, '')  // Tausender-Punkt weg
    .replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

/** Deutsches Datum oder ISO → ISO "YYYY-MM-DD" */
function parseDate(raw: string): string | null {
  const s = raw.replace(/"/g, '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  const m2 = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})$/);
  if (m2) return `20${m2[3]}-${m2[2].padStart(2,'0')}-${m2[1].padStart(2,'0')}`;
  return null;
}

/** Prüft ob eine Zeile wie ein Header aussieht (keine Zahlen/Datumsfelder) */
function looksLikeData(cols: string[]): boolean {
  if (cols.length < 4) return false;
  // Wenn Spalte 0 ein Datum ist und Spalte 3 eine Zahl → Datenzeile
  return !!parseDate(cols[0]) && parseAmount(cols[3]) !== null;
}

// ── meinElba Beschreibungs-Parser ─────────────────────────────
// Format-Beispiele:
// "Client: Pelagonian GmbH Payment reference: salary payment Client IBAN: ..."
// "Payment recipient: Raiffeisen-Leasing AG Purpose of use: Kreditrate ..."
// "KONFORM 32250-412379-400-20250502 Recipient: Jörgen Vöhringer Payment reference: Dotierung ..."
// "Payment reference: LET'S DOIT   2361  D9   02.05. 16:45 Card payment ..."
// "Purpose of use: BACKEREI EDER Payment reference: POS ..."

function parseElbaDescription(raw: string): { description: string; counterpart: string } {
  const s = raw.trim();

  // Gegenpartei extrahieren
  const clientMatch    = s.match(/(?:^|;)\s*Client:\s*([^P][^\n]*?)(?:\s+(?:Payment reference|Client IBAN|Client BIC)|$)/i);
  const recipientMatch = s.match(/(?:Payment recipient|Recipient):\s*([^\n]+?)(?:\s+(?:Purpose of use|Payment reference|Payment recipient IBAN|Recipient IBAN|Recipient ID|Recipient BIC|Client reference|Mandate)|$)/i);

  let counterpart = '';
  if (clientMatch?.[1])    counterpart = clientMatch[1].trim();
  else if (recipientMatch?.[1]) counterpart = recipientMatch[1].trim();

  // Bereinigung der Gegenpartei (Adresszusätze entfernen)
  counterpart = counterpart
    .replace(/\s+\d{4}\s+\w.*$/, '')   // PLZ + Ort weg
    .replace(/\s+\d{4}$/, '')          // nur PLZ weg
    .trim();

  // Verwendungszweck extrahieren
  const purposeMatch  = s.match(/Purpose of use:\s*([^\n]+?)(?:\s+(?:Payment reference|Payment recipient IBAN|Recipient IBAN|Client reference|Mandate|Recipient ID)|$)/i);
  const payRefMatch   = s.match(/Payment reference:\s*([^\n]+?)(?:\s+(?:Card payment|Client IBAN|Recipient IBAN)|$)/i);
  const konformMatch  = s.match(/^KONFORM\s+\S+\s+(?:Recipient:\s*\S+\s+)?Payment reference:\s*(.+?)(?:\s+Recipient IBAN|$)/i);

  let description = '';
  if (purposeMatch?.[1])  description = purposeMatch[1].trim();
  else if (payRefMatch?.[1]) description = payRefMatch[1].trim();
  else if (konformMatch?.[1]) description = konformMatch[1].trim();
  else {
    // Fallback: alles bis zum ersten bekannten Keyword
    description = s
      .replace(/\s*(Client|Payment recipient|Recipient|KONFORM\s+\S+):\s*.*?(Payment reference|Purpose of use):\s*/gi, '')
      .replace(/\s*(Client|Recipient|Payment recipient)\s+IBAN:.*$/gi, '')
      .trim()
      .slice(0, 200);
  }

  // Kartenzahlung: Händlername aus "Payment reference: HAENDLER XXXXXX D9 TT.MM. HH:MM Card payment"
  const cardMatch = s.match(/Payment reference:\s*([A-Z][A-Z0-9 &'./-]+?)\s+(?:\d{4}\s+)?D\d\s+\d{2}\.\d{2}\./i);
  if (cardMatch?.[1] && !counterpart) counterpart = cardMatch[1].trim();
  // POS-Zahlung aus Purpose: "MERCHANT NAME ORT 1234" – Stadtname + PLZ am Ende entfernen
  if (!counterpart && description) {
    const posMatch = description.match(/^([A-Z][A-Z0-9 &'.-]+?)\s+(?:[A-Z][A-Z]+\s+)?\d{4}(?:\s|$)/);
    if (posMatch?.[1]) counterpart = posMatch[1].trim();
  }

  return {
    description: description.replace(/\s+/g, ' ').trim().slice(0, 300),
    counterpart: counterpart.replace(/\s+/g, ' ').trim().slice(0, 100),
  };
}

// ── Formate MIT Header ────────────────────────────────────────
type ColMap = { date: string[]; amount: string[]; description: string[]; counterpart: string[] };

const HEADER_FORMATS: Record<string, ColMap> = {
  raiffeisen: {
    date:        ['buchungstag','buchungsdatum','datum'],
    amount:      ['betrag','umsatz','betrag (eur)'],
    description: ['verwendungszweck','buchungstext','text'],
    counterpart: ['auftraggeber/empfänger','auftraggeber / empfänger','gegenkonto name'],
  },
  bawag: {
    date:        ['buchungsdatum','valutadatum','datum'],
    amount:      ['betrag','umsatz','betrag eur'],
    description: ['buchungstext','text','verwendungszweck'],
    counterpart: ['auftraggeber/empfänger','gegenseite'],
  },
  generic: {
    date:        ['date','datum','buchungsdatum','buchungstag','valutadatum'],
    amount:      ['amount','betrag','umsatz','betrag (eur)','betrag eur'],
    description: ['description','beschreibung','verwendungszweck','buchungstext','text','memo'],
    counterpart: ['counterpart','gegenseite','auftraggeber','empfänger','auftraggeber/empfänger'],
  },
};

function findCol(headers: string[], candidates: string[]): number {
  const lower = headers.map(h => h.toLowerCase().trim());
  for (const c of candidates) {
    const idx = lower.findIndex(h => h === c || h.includes(c));
    if (idx >= 0) return idx;
  }
  return -1;
}

// ── Haupt-Export ──────────────────────────────────────────────

export function parseBankCsv(csvText: string): CsvParseResult {
  const errors: string[] = [];
  const entries: ParsedBankEntry[] = [];

  const text  = csvText.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  if (lines.length < 1) return { entries, errors: ['Datei ist leer.'], bankHint: 'unbekannt' };

  const sep = lines[0].includes(';') ? ';' : ',';

  // ── meinElba: kein Header (erste Zeile bereits Daten) ────────
  const firstCols = splitLine(lines[0], sep);
  if (looksLikeData(firstCols)) {
    // Spaltenaufbau: Datum | Beschreibung | Valuta | Betrag | Währung | Timestamp
    let idx = 0;
    for (const line of lines) {
      idx++;
      const cols = splitLine(line, sep);
      if (cols.length < 4) continue;

      const date = parseDate(cols[0]);
      if (!date) { errors.push(`Zeile ${idx}: Ungültiges Datum "${cols[0]}" – übersprungen`); continue; }

      const amtNum = parseAmount(cols[3]);
      if (amtNum === null) { errors.push(`Zeile ${idx}: Ungültiger Betrag "${cols[3]}" – übersprungen`); continue; }

      const amount   = Math.abs(amtNum);
      const type: 'income' | 'expense' = amtNum >= 0 ? 'income' : 'expense';
      const rawDesc  = cols[1] ?? '';
      const { description, counterpart } = parseElbaDescription(rawDesc);

      // Eindeutige Referenz: Timestamp (Spalte 5) ist pro Transaktion einzigartig
      const timestamp = cols[5] ?? '';
      const bankRef   = timestamp
        ? `elba_${timestamp.replace(/[^0-9]/g, '')}`
        : `elba_${date}_${amtNum}_${idx}`;

      entries.push({ bankRef, date, amount, type, description, counterpart, currency: cols[4] ?? 'EUR' });
    }

    entries.sort((a, b) => b.date.localeCompare(a.date));
    return { entries, errors, bankHint: 'meinElba (Erste Bank / Sparkasse / RLB)' };
  }

  // ── Formate MIT Header ────────────────────────────────────────
  let headerIdx = 0;
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    if (splitLine(lines[i], sep).length >= 4) { headerIdx = i; break; }
  }
  const headers = splitLine(lines[headerIdx], sep);
  const lowerH  = headers.map(h => h.toLowerCase().trim());

  let fmtName = 'generic';
  if (lowerH.some(h => h.includes('buchungstag') || h.includes('raiffeisen'))) fmtName = 'raiffeisen';
  else if (lowerH.some(h => h.includes('bawag') || h.includes('psk')))        fmtName = 'bawag';

  const fmt      = HEADER_FORMATS[fmtName];
  const dateCol  = findCol(headers, fmt.date);
  const amtCol   = findCol(headers, fmt.amount);
  const descCol  = findCol(headers, fmt.description);
  const cpartCol = findCol(headers, fmt.counterpart);

  if (dateCol < 0 || amtCol < 0) {
    return {
      entries,
      errors: [
        `Spalten nicht erkannt. Gefunden: ${headers.join(' | ')}`,
        'Bitte prüfen ob die Datei im richtigen Format vorliegt.',
      ],
      bankHint: 'unbekannt',
    };
  }

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitLine(lines[i], sep);
    if (cols.length < Math.max(dateCol, amtCol) + 1) continue;

    const date = parseDate(cols[dateCol]);
    if (!date) { errors.push(`Zeile ${i + 1}: Ungültiges Datum "${cols[dateCol]}" – übersprungen`); continue; }

    const amtNum = parseAmount((cols[amtCol] ?? '').replace(/"/g, ''));
    if (amtNum === null) { errors.push(`Zeile ${i + 1}: Ungültiger Betrag – übersprungen`); continue; }

    const amount = Math.abs(amtNum);
    const type: 'income' | 'expense' = amtNum >= 0 ? 'income' : 'expense';
    const desc   = descCol  >= 0 ? (cols[descCol]  ?? '').trim() : '';
    const cpart  = cpartCol >= 0 ? (cols[cpartCol] ?? '').trim() : '';
    const bankRef = `csv_${date}_${amtNum}_${desc.slice(0, 30).replace(/\s+/g, '_')}`;

    entries.push({ bankRef, date, amount, type, description: desc, counterpart: cpart, currency: 'EUR' });
  }

  entries.sort((a, b) => b.date.localeCompare(a.date));
  return { entries, errors, bankHint: fmtName };
}
