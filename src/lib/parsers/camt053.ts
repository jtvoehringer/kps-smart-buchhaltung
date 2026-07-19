// ============================================================
// CAMT.053 Parser – ISO 20022 Kontoauszug (XML)
// Unterstützt: .001.02 / .001.06 / .001.08 (AT-Banken)
// Läuft im Browser via DOMParser (kein Node-Import nötig)
// ============================================================

export type ParsedBankEntry = {
  /** Eindeutige Bankreferenz – für Deduplizierung */
  bankRef:     string;
  /** Buchungsdatum */
  date:        string;   // ISO: "2024-01-15"
  /** Betrag (immer positiv) */
  amount:      number;
  /** 'income' = Gutschrift (CRDT), 'expense' = Belastung (DBIT) */
  type:        'income' | 'expense';
  /** Verwendungszweck / Beschreibung */
  description: string;
  /** Auftraggeber oder Empfänger */
  counterpart: string;
  /** Währung */
  currency:    string;
};

export type CamtParseResult = {
  iban:    string;
  entries: ParsedBankEntry[];
  errors:  string[];
};

/** Hilfsfunktion: ersten Text eines Tag-Namens holen (namespace-agnostisch) */
function getText(el: Element, tagName: string): string {
  const found = el.getElementsByTagNameNS('*', tagName)[0];
  return found?.textContent?.trim() ?? '';
}

/** Ersten nicht-leeren Text aus mehreren Tags holen */
function getFirstText(el: Element, ...tagNames: string[]): string {
  for (const tag of tagNames) {
    const val = getText(el, tag);
    if (val) return val;
  }
  return '';
}

export function parseCamt053(xmlString: string): CamtParseResult {
  const errors: string[] = [];
  const entries: ParsedBankEntry[] = [];

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xmlString, 'application/xml');
  } catch {
    return { iban: '', entries, errors: ['XML konnte nicht geparst werden.'] };
  }

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    return { iban: '', entries, errors: ['Ungültiges XML: ' + parseError.textContent?.slice(0, 120)] };
  }

  // IBAN aus Stmt/Acct/Id/IBAN
  const stmts = Array.from(doc.getElementsByTagNameNS('*', 'Stmt'));
  if (stmts.length === 0) {
    return { iban: '', entries, errors: ['Kein <Stmt>-Element gefunden – ist das eine CAMT.053-Datei?'] };
  }

  const stmt = stmts[0];
  const iban = getText(stmt, 'IBAN') || getText(stmt, 'Othr');

  // Alle Buchungszeilen (Ntry)
  const ntryList = Array.from(stmt.getElementsByTagNameNS('*', 'Ntry'));

  for (let i = 0; i < ntryList.length; i++) {
    const ntry = ntryList[i];
    try {
      // Nur gebuchte Einträge (Status BOOK)
      const status = getText(ntry, 'Sts');
      if (status && status !== 'BOOK' && status !== 'INFO') continue;

      // Betrag
      const amtEl = ntry.getElementsByTagNameNS('*', 'Amt')[0];
      const amtText = amtEl?.textContent?.trim() ?? '0';
      const amount = parseFloat(amtText.replace(',', '.'));
      const currency = amtEl?.getAttribute('Ccy') ?? 'EUR';
      if (isNaN(amount) || amount <= 0) continue;

      // Richtung: CRDT = Einnahme, DBIT = Ausgabe
      const cdtDbt = getText(ntry, 'CdtDbtInd');
      const type: 'income' | 'expense' = cdtDbt === 'CRDT' ? 'income' : 'expense';

      // Buchungsdatum (BookgDt > Dt bevorzugt, Fallback ValDt)
      const bookgDtEl = ntry.getElementsByTagNameNS('*', 'BookgDt')[0];
      const valDtEl   = ntry.getElementsByTagNameNS('*', 'ValDt')[0];
      const date = getText(bookgDtEl ?? valDtEl, 'Dt')
                || getText(bookgDtEl ?? valDtEl, 'DtTm')?.slice(0, 10)
                || '';
      if (!date) { errors.push(`Zeile ${i + 1}: Datum fehlt – übersprungen`); continue; }

      // Bankreferenz für Deduplizierung
      // Priorität: AcctSvcrRef > EndToEndId > TxId > NtryRef > generiert
      const acctSvcrRef = getText(ntry, 'AcctSvcrRef');
      const e2eId       = getText(ntry, 'EndToEndId');
      const txId        = getText(ntry, 'TxId');
      const ntryRef     = getText(ntry, 'NtryRef');
      const bankRef = acctSvcrRef || e2eId || txId || ntryRef
                   || `${date}_${amount}_${cdtDbt}_${i}`;

      // Verwendungszweck: Ustrd bevorzugt, dann AddtlNtryInf
      const txDtls = ntry.getElementsByTagNameNS('*', 'TxDtls')[0];
      const ustrd  = txDtls
        ? getFirstText(txDtls, 'Ustrd', 'AddtlTxInf')
        : '';
      const addtlInf = getText(ntry, 'AddtlNtryInf');
      const description = (ustrd || addtlInf || '').replace(/\s+/g, ' ').trim();

      // Gegenpartei: Cdtr (bei Ausgabe) oder Dbtr (bei Einnahme)
      const cdtrNm = txDtls ? getText(txDtls, 'CdtrNm') || getText(txDtls, 'Nm') : '';
      const dbtrNm = txDtls ? getText(txDtls, 'DbtrNm') : '';
      const rltdNm = txDtls
        ? getText(txDtls.getElementsByTagNameNS('*', 'Cdtr')[0] ?? txDtls, 'Nm')
          || getText(txDtls.getElementsByTagNameNS('*', 'Dbtr')[0] ?? txDtls, 'Nm')
        : '';
      const counterpart = (type === 'expense' ? cdtrNm : dbtrNm) || rltdNm || '';

      entries.push({ bankRef, date, amount, type, description, counterpart, currency });
    } catch (e) {
      errors.push(`Zeile ${i + 1}: Parse-Fehler – ${String(e)}`);
    }
  }

  // Nach Datum sortieren (neueste zuerst)
  entries.sort((a, b) => b.date.localeCompare(a.date));

  return { iban, entries, errors };
}
