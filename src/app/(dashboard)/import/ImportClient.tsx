'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { parseCamt053, type ParsedBankEntry } from '@/lib/parsers/camt053';
import { parseBankCsv } from '@/lib/parsers/bankcsv';
import { formatCurrency } from '@/lib/utils';
import { Link2, Unlink } from 'lucide-react';

type Category = { id: string; name: string; type: string; vat_rate: number };
type AccountOpt = { id: string; name: string; iban: string | null };
type LearningRule = { counterpart_pattern: string; category_id: string | null; is_private: boolean; hit_count: number };
type OpenInvoice = {
  id: string; invoice_number: string; customer_name: string;
  amount_gross: number; amount_net: number; vat_amount: number;
};
type OpenIncomingInvoice = {
  id: string; vendor_name: string; invoice_number: string | null;
  amount_gross: number; amount_net: number; vat_rate: number; vat_amount: number; category_id: string | null;
};

type Match =
  | { kind: 'invoice'; invoice: OpenInvoice }
  | { kind: 'incoming'; invoice: OpenIncomingInvoice }
  | null;

type TxInsert = {
  client_id: string;
  category_id: string;
  type: 'income' | 'expense';
  amount_net: number;
  vat_rate: 0 | 10 | 13 | 20;
  vat_amount: number;
  booking_date: string;
  description: string | null;
  import_source?: string;
  bank_ref?: string;
  account_id?: string | null;
  is_private?: boolean;
  is_reconciled?: boolean;
};

type ImportRow = ParsedBankEntry & {
  selected:    boolean;
  categoryId:  string;
  isDuplicate: boolean;
  isPrivate:   boolean;
  match:       Match;
  linked:      boolean; // Vorschlag übernehmen (Offenen Posten als bezahlt verknüpfen) statt normal zu buchen
};

type Props = {
  clientId:              string;
  userId:                string;
  categories:            Category[];
  knownBankRefs:         string[];
  accounts:              AccountOpt[];
  learningRules:         LearningRule[];
  openInvoices:          OpenInvoice[];
  openIncomingInvoices:  OpenIncomingInvoice[];
};

// ── Keyword-basierte Kategorie-Vorschläge ─────────────────────
const KEYWORD_MAP: [RegExp, string[]][] = [
  [/miete|pacht|bestandszins|rent/i,           ['Miete & Pacht']],
  [/büromaterial|schreibwaren|papier|office/i,  ['Büromaterial']],
  [/telefon|internet|a1|magenta|drei|mobile/i,  ['Telefon & Internet']],
  [/versicherung|allianz|uniqa|insurance|kfz-k/i, ['Versicherungen']],
  [/steuerberater|kps|wirtschafts|tax advis/i,  ['Steuerberatungskosten']],
  [/gehalt|lohn|personal|salary|payroll/i,      ['Personalkosten']],
  [/kfz|auto|benzin|tankstelle|leasing|fahrzeug/i, ['KFZ-Kosten']],
  [/strom|energie|gas|wasser|energie|lidl-energie/i, ['Sonstige Ausgaben']],
  [/erlös|honorar|rechnung|invoice|revenue/i,   ['Erlöse 20% USt', 'Erlöse 10% USt']],
  [/billa|merkur|spar|hofer|lidl|aldi|rewe|supermarkt|backerei|bäckerei/i, ['Sonstige Ausgaben']],
  [/bankomat|cash|atm/i,                        ['Sonstige Ausgaben']],
];

function suggestCategory(desc: string, counterpart: string, type: 'income' | 'expense', categories: Category[]): string {
  const text = `${desc} ${counterpart}`.toLowerCase();
  for (const [regex, names] of KEYWORD_MAP) {
    if (regex.test(text)) {
      for (const name of names) {
        const cat = categories.find(c => c.name === name && c.type === type);
        if (cat) return cat.id;
      }
    }
  }
  return categories.find(c => c.type === type)?.id ?? '';
}

// Normalisiert Gegenpartei-/Freitext für Vergleiche: lowercase, Sonderzeichen raus, Whitespace zusammengefasst.
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9äöüß ]/gi, ' ').replace(/\s+/g, ' ').trim();
}

function amountsMatch(a: number, b: number): boolean {
  return Math.abs(Math.abs(a) - Math.abs(b)) < 0.01;
}

function findMatch(
  row: { amount: number; type: 'income' | 'expense'; description: string; counterpart: string },
  openInvoices: OpenInvoice[],
  openIncomingInvoices: OpenIncomingInvoice[]
): Match {
  const haystack = normalize(`${row.description} ${row.counterpart}`);
  const counterpartNorm = normalize(row.counterpart);

  if (row.type === 'income') {
    const candidates = openInvoices.filter(inv => amountsMatch(row.amount, Number(inv.amount_gross)));
    for (const inv of candidates) {
      // Seit Migration 021 kann invoice_number NULL sein (Entwürfe). Offene
      // Rechnungen haben durch den CHECK-Constraint immer eine Nummer – der
      // Guard schützt vor Altbeständen aus der Zeit davor.
      const numNorm = inv.invoice_number ? normalize(inv.invoice_number).replace(/ /g, '') : '';
      const hitByNumber = numNorm.length >= 3 && haystack.replace(/ /g, '').includes(numNorm);
      const custNorm = normalize(inv.customer_name);
      const hitByName = custNorm.length >= 3 && (counterpartNorm.includes(custNorm) || custNorm.includes(counterpartNorm));
      if (hitByNumber || hitByName) return { kind: 'invoice', invoice: inv };
    }
    if (candidates.length === 1) return { kind: 'invoice', invoice: candidates[0] };
  } else {
    const candidates = openIncomingInvoices.filter(inv => amountsMatch(row.amount, Number(inv.amount_gross)));
    for (const inv of candidates) {
      const numNorm = inv.invoice_number ? normalize(inv.invoice_number).replace(/ /g, '') : '';
      const hitByNumber = numNorm.length >= 3 && haystack.replace(/ /g, '').includes(numNorm);
      const vendNorm = normalize(inv.vendor_name);
      const hitByName = vendNorm.length >= 3 && (counterpartNorm.includes(vendNorm) || vendNorm.includes(counterpartNorm));
      if (hitByNumber || hitByName) return { kind: 'incoming', invoice: inv };
    }
    if (candidates.length === 1) return { kind: 'incoming', invoice: candidates[0] };
  }
  return null;
}

export default function ImportClient({
  clientId, userId, categories, knownBankRefs, accounts, learningRules, openInvoices, openIncomingInvoices,
}: Props) {
  const router = useRouter();
  const supabase = createClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const knownSet = new Set(knownBankRefs);

  const ruleMap = useMemo(() => {
    const m = new Map<string, LearningRule>();
    for (const r of learningRules) m.set(r.counterpart_pattern, r);
    return m;
  }, [learningRules]);

  const [rows,      setRows]      = useState<ImportRow[]>([]);
  const [parseErrs, setParseErrs] = useState<string[]>([]);
  const [bankHint,  setBankHint]  = useState('');
  const [iban,      setIban]      = useState('');
  const [fileName,  setFileName]  = useState('');
  const [fileType,  setFileType]  = useState<'camt053'|'csv'|''>('');
  const [accountId, setAccountId] = useState('');
  const [importing, setImporting] = useState(false);
  // Fortschritt: bei 200 Zeilen sonst minutenlang nur ein statisches "Importiere…"
  const [fortschritt, setFortschritt] = useState<{ fertig: number; gesamt: number } | null>(null);
  const [importMsg, setImportMsg] = useState('');
  const [dragOver,  setDragOver]  = useState(false);

  // ── Datei verarbeiten ────────────────────────────────────────
  async function processFile(file: File) {
    setRows([]); setParseErrs([]); setBankHint(''); setIban(''); setImportMsg('');
    setFileName(file.name);

    const text = await file.text();
    const ext  = file.name.toLowerCase();

    let entries: ParsedBankEntry[] = [];
    let errs: string[] = [];
    let hint = '';
    let detectedIban = '';
    let type: 'camt053' | 'csv' = 'csv';

    if (ext.endsWith('.xml') || text.trimStart().startsWith('<')) {
      const result = parseCamt053(text);
      entries = result.entries;
      errs    = result.errors;
      detectedIban = result.iban;
      hint    = 'CAMT.053 (XML)';
      type    = 'camt053';
    } else {
      const result = parseBankCsv(text);
      entries = result.entries;
      errs    = result.errors;
      hint    = `CSV – erkannt: ${result.bankHint}`;
      type    = 'csv';
    }

    setParseErrs(errs);
    setBankHint(hint);
    setIban(detectedIban);
    setFileType(type);

    const importRows: ImportRow[] = entries.map(e => {
      const rule = ruleMap.get(normalize(e.counterpart));
      const match = findMatch(e, openInvoices, openIncomingInvoices);
      return {
        ...e,
        isDuplicate: knownSet.has(e.bankRef),
        selected:    !knownSet.has(e.bankRef),
        categoryId:  rule?.category_id || suggestCategory(e.description, e.counterpart, e.type, categories),
        isPrivate:   rule?.is_private ?? false,
        match,
        linked:      match !== null,
      };
    });
    setRows(importRows);

    // Konto vorbelegen, falls IBAN auf ein bekanntes Konto passt
    if (detectedIban) {
      const found = accounts.find(a => a.iban === detectedIban);
      if (found) setAccountId(found.id);
    }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleRow(idx: number) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, selected: !r.selected } : r));
  }
  function toggleAll(val: boolean) {
    setRows(prev => prev.map(r => r.isDuplicate ? r : { ...r, selected: val }));
  }
  function setCat(idx: number, catId: string) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, categoryId: catId } : r));
  }
  function togglePrivate(idx: number) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, isPrivate: !r.isPrivate } : r));
  }
  function toggleLinked(idx: number) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, linked: !r.linked } : r));
  }

  // ── Import durchführen ───────────────────────────────────────
  async function handleImport() {
    const toImport = rows.filter(r => r.selected && !r.isDuplicate && (r.linked && r.match ? true : !!r.categoryId));
    if (toImport.length === 0) {
      setImportMsg('Keine importierbaren Buchungen – bitte Kategorien zuweisen.');
      return;
    }

    setImporting(true); setImportMsg('');

    let withExtras = true; // versuche zuerst mit import_source + bank_ref + account_id + is_private
    let imported = 0;
    const learned = new Map<string, { categoryId: string; isPrivate: boolean }>();
    // Nur die tatsächlich gebuchten Zeilen werden anschließend gesperrt.
    const erledigt = new Set<string>();
    const fehler: { zeile: ImportRow; meldung: string }[] = [];
    setFortschritt({ fertig: 0, gesamt: toImport.length });

    for (const [i, r] of toImport.entries()) {
      setFortschritt({ fertig: i, gesamt: toImport.length });
      const useMatch = r.linked && r.match;

      let base: TxInsert;
      if (useMatch && r.match!.kind === 'invoice') {
        const inv = r.match!.invoice as OpenInvoice;
        const vatRate = Number(inv.amount_net) > 0
          ? ([0, 10, 13, 20] as const).reduce((best, rate) =>
              Math.abs(rate - (Number(inv.vat_amount) / Number(inv.amount_net)) * 100) <
              Math.abs(best - (Number(inv.vat_amount) / Number(inv.amount_net)) * 100) ? rate : best, 20)
          : 20;
        base = {
          client_id:   clientId,
          category_id: r.categoryId || categories.find(c => c.type === 'income')?.id || '',
          type:        'income',
          amount_net:  Number(inv.amount_net),
          vat_rate:    vatRate,
          vat_amount:  Number(inv.vat_amount),
          booking_date: r.date,
          description: `Zahlungseingang ${inv.invoice_number}`,
        };
      } else if (useMatch && r.match!.kind === 'incoming') {
        const inv = r.match!.invoice as OpenIncomingInvoice;
        base = {
          client_id:   clientId,
          category_id: inv.category_id || r.categoryId || '',
          type:        'expense',
          amount_net:  Number(inv.amount_net),
          vat_rate:    inv.vat_rate as 0 | 10 | 13 | 20,
          vat_amount:  Number(inv.vat_amount),
          booking_date: r.date,
          description: `Zahlungsausgang ${inv.vendor_name}${inv.invoice_number ? ` – ${inv.invoice_number}` : ''}`,
        };
      } else {
        const cat    = categories.find(c => c.id === r.categoryId);
        const vatRate = (cat?.vat_rate ?? 0) as 0 | 10 | 13 | 20;
        const amtNet = parseFloat((r.amount / (1 + vatRate / 100)).toFixed(2));
        const vatAmt = parseFloat((r.amount - amtNet).toFixed(2));
        base = {
          client_id:   clientId,
          category_id: r.categoryId,
          type:        r.type,
          amount_net:  amtNet,
          vat_rate:    vatRate,
          vat_amount:  vatAmt,
          booking_date: r.date,
          description: [r.counterpart, r.description].filter(Boolean).join(' – ').slice(0, 500) || null,
        };
      }

      const payload: TxInsert = withExtras
        ? { ...base, import_source: fileType || 'csv', bank_ref: r.bankRef, account_id: accountId || null, is_private: r.isPrivate, is_reconciled: false }
        : base;

      const { data: newTx, error } = await supabase
        .from('transactions')
        .insert(payload)
        .select('id')
        .single();

      if (error) {
        if (withExtras && /import_source|bank_ref|account_id|is_private|is_reconciled/.test(error.message)) {
          // Migration 008/016 evtl. noch nicht gelaufen → ohne Extras nochmal
          withExtras = false;
          const { data: retryTx, error: retryErr } = await supabase
            .from('transactions').insert(base).select('id').single();
          if (retryErr || !retryTx) {
            fehler.push({ zeile: r, meldung: retryErr?.message ?? error.message });
            continue;
          }
          erledigt.add(r.bankRef);
          imported += 1;
          await linkIfMatched(r, retryTx.id);
        } else {
          // Nicht mehr abbrechen: eine einzelne Problemzeile (gesperrter
          // Monat, fehlende Kategorie, Duplikat) darf den restlichen
          // Import nicht verhindern. Vorher blieben die bereits
          // importierten Zeilen unmarkiert zurück – ein zweiter Versuch
          // scheiterte dann sofort am Duplikat-Index, und der Import war
          // gar nicht mehr abschließbar.
          fehler.push({ zeile: r, meldung: error.message });
          continue;
        }
      } else if (newTx) {
        erledigt.add(r.bankRef);
        imported += 1;
        await linkIfMatched(r, newTx.id);
      }

      // Lernregel merken (letzter Stand je Gegenpartei gewinnt)
      const key = normalize(r.counterpart);
      if (key) learned.set(key, { categoryId: r.categoryId, isPrivate: r.isPrivate });
    }

    async function linkIfMatched(r: ImportRow, txId: string) {
      if (!(r.linked && r.match)) return;
      if (r.match.kind === 'invoice') {
        await supabase.from('invoices')
          .update({ status: 'paid', paid_date: r.date, transaction_id: txId })
          .eq('id', r.match.invoice.id);
      } else {
        await supabase.from('incoming_invoices')
          .update({ status: 'paid', paid_date: r.date, transaction_id: txId })
          .eq('id', r.match.invoice.id);
      }
    }

    // Lernregeln aktualisieren (best effort – schlägt still fehl wenn Migration 016 noch nicht gelaufen)
    for (const [pattern, val] of learned) {
      const existing = ruleMap.get(pattern);
      await supabase.from('bank_learning_rules').upsert({
        client_id:           clientId,
        counterpart_pattern: pattern,
        category_id:         val.categoryId || null,
        is_private:          val.isPrivate,
        hit_count:           (existing?.hit_count ?? 0) + 1,
      }, { onConflict: 'client_id,counterpart_pattern' }).then(() => {}, () => {});
    }

    // Import-History
    await supabase.from('bank_imports').insert({
      client_id:   clientId,
      imported_by: userId,
      file_name:   fileName,
      file_type:   (fileType || 'csv') as 'camt053' | 'csv',
      iban:        iban || null,
      tx_total:    rows.length,
      tx_imported: imported,
      account_id:  accountId || null,
    }).then(() => {}, () => {});

    setFortschritt(null);

    if (fehler.length === 0) {
      setImportMsg(`✓ ${imported} Buchung${imported !== 1 ? 'en' : ''} importiert.${!withExtras ? ' (Tipp: Migrationen ausführen für Duplikat-Schutz, Konto- und Privat-Kennzeichnung)' : ''}`);
    } else {
      const ersteMeldungen = fehler.slice(0, 3).map(f => `„${f.zeile.counterpart || f.zeile.description}“: ${f.meldung}`);
      setImportMsg(
        `${imported} von ${toImport.length} Buchungen importiert. ` +
        `${fehler.length} Zeile${fehler.length !== 1 ? 'n' : ''} konnte${fehler.length !== 1 ? 'n' : ''} nicht gebucht werden und ` +
        `bleibt${fehler.length !== 1 ? 'en' : ''} zum erneuten Versuch stehen:\n` +
        ersteMeldungen.join('\n') +
        (fehler.length > 3 ? `\n… und ${fehler.length - 3} weitere.` : '')
      );
    }
    setImporting(false);

    // Nur die tatsächlich importierten Zeilen sperren. Alles andere bleibt
    // auswählbar, damit der Import nach einer Korrektur fortgesetzt werden
    // kann, ohne am Duplikat-Index hängenzubleiben.
    setRows(prev => prev.map(r =>
      erledigt.has(r.bankRef) ? { ...r, isDuplicate: true, selected: false } : r
    ));

    router.refresh();
  }

  const selectedCount  = rows.filter(r => r.selected && !r.isDuplicate).length;
  const dupCount       = rows.filter(r => r.isDuplicate).length;
  const matchCount     = rows.filter(r => r.selected && !r.isDuplicate && r.linked && r.match).length;
  const incomeRows     = rows.filter(r => r.type === 'income');
  const expenseRows    = rows.filter(r => r.type === 'expense');
  const catsByType     = (type: string) => categories.filter(c => c.type === type);

  return (
    <div className="space-y-5">
      {/* ── Upload-Bereich ── */}
      {rows.length === 0 && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInput.current?.click()}
          className={`border-2 border-dashed rounded-2xl px-8 py-12 text-center cursor-pointer transition-colors ${
            dragOver ? 'border-brand bg-blue-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
          }`}
        >
                    <p className="text-gray-700 font-semibold mb-1">Kontoauszug hierher ziehen</p>
          <p className="text-sm text-gray-400 mb-4">CAMT.053 (.xml) oder Bank-CSV (.csv)</p>
          <p className="text-xs text-gray-300">Raiffeisen · Erste/Sparkasse · BAWAG · Bank Austria</p>
          <input
            ref={fileInput}
            type="file"
            accept=".xml,.csv,.txt"
            onChange={e => e.target.files?.[0] && processFile(e.target.files[0])}
            className="hidden"
          />
        </div>
      )}

      {/* ── Parse-Fehler ── */}
      {parseErrs.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 space-y-1">
          <p className="font-semibold">Hinweise beim Einlesen:</p>
          {parseErrs.map((e, i) => <p key={i} className="text-xs">{e}</p>)}
        </div>
      )}

      {/* ── Ergebnis-Header ── */}
      {rows.length > 0 && (
        <>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-4 items-center justify-between">
            <div className="space-y-0.5">
              <p className="font-semibold text-gray-800">
                {fileName}
                <span className="ml-2 text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{bankHint}</span>
              </p>
              {iban && <p className="text-xs text-gray-500">IBAN: {iban}</p>}
              <p className="text-sm text-gray-500">
                {rows.length} Zeilen · {incomeRows.length} Einnahmen · {expenseRows.length} Ausgaben
                {dupCount > 0 && <span className="ml-2 text-amber-600">{dupCount} bereits importiert</span>}
                {matchCount > 0 && <span className="ml-2 text-brand">{matchCount} mit Offenen Posten verknüpft</span>}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {accounts.length > 0 && (
                <div>
                  <label htmlFor="importClient-0" className="text-xs font-medium text-gray-500 block mb-1">Konto</label>
                  <select id="importClient-0"
                    value={accountId}
                    onChange={e => setAccountId(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                  >
                    <option value="">– kein Konto –</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              )}
              <button
                onClick={() => { setRows([]); setFileName(''); setImportMsg(''); }}
                className="text-xs text-gray-400 hover:text-gray-600 underline"
              >
                Andere Datei wählen
              </button>
            </div>
          </div>

          {/* ── Status-Meldung (oben, immer sichtbar) ── */}
          {importMsg && (
            <div className={`px-4 py-3 rounded-xl border ${
              importMsg.startsWith('✓')
                ? 'bg-green-50 text-green-700 border-green-200'
                : /^\d+ von \d+/.test(importMsg)
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : 'bg-red-50 text-red-700 border-red-200'
            }`}>
              <p className="text-sm font-medium mb-2 whitespace-pre-line">{importMsg}</p>
              {importMsg.startsWith('✓') && (
                <div className="flex gap-3 mt-2">
                  <button
                    onClick={() => router.push('/buchungen')}
                    className="px-4 py-1.5 bg-brand text-white text-xs font-semibold rounded-lg hover:bg-accent transition-colors"
                  >
                    → Buchungsübersicht
                  </button>
                  <button
                    onClick={() => { setRows([]); setFileName(''); setImportMsg(''); setBankHint(''); setIban(''); }}
                    className="px-4 py-1.5 bg-white text-gray-600 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    Weitere Datei importieren
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Vorschau-Tabelle ── */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 bg-gray-50">
              <input
                type="checkbox"
                checked={selectedCount > 0 && selectedCount === rows.filter(r => !r.isDuplicate).length}
                onChange={e => toggleAll(e.target.checked)}
                className="w-4 h-4 accent-brand"
              />
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {selectedCount} von {rows.filter(r => !r.isDuplicate).length} ausgewählt
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                    <th className="w-8 px-4 py-2"></th>
                    <th className="text-left px-3 py-2">Datum</th>
                    <th className="text-left px-3 py-2">Beschreibung / Gegenpartei</th>
                    <th className="text-right px-3 py-2">Betrag</th>
                    <th className="text-left px-3 py-2 min-w-[220px]">Kategorie / Verknüpfung</th>
                    <th className="text-center px-3 py-2">Privat</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr
                      key={idx}
                      className={`border-t border-gray-50 ${
                        row.isDuplicate
                          ? 'opacity-40 bg-gray-50'
                          : row.selected
                          ? 'bg-blue-50/30'
                          : ''
                      }`}
                    >
                      <td className="px-4 py-2">
                        {row.isDuplicate ? (
                          <span title="Bereits importiert" className="text-xs"></span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={row.selected}
                            onChange={() => toggleRow(idx)}
                            className="w-4 h-4 accent-brand"
                          />
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap text-xs">
                        {new Date(row.date).toLocaleDateString('de-AT')}
                      </td>
                      <td className="px-3 py-2 max-w-xs">
                        {row.counterpart && (
                          <p className="font-medium text-gray-700 truncate text-xs">{row.counterpart}</p>
                        )}
                        <p className="text-gray-400 truncate text-xs" title={row.description}>
                          {row.description || '—'}
                        </p>
                      </td>
                      <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${
                        row.type === 'income' ? 'text-income' : 'text-expense'
                      }`}>
                        {row.type === 'income' ? '+' : '−'}{formatCurrency(row.amount)}
                      </td>
                      <td className="px-3 py-2">
                        {!row.isDuplicate && row.match && row.linked ? (
                          <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-2.5 py-1.5">
                            <Link2 size={13} strokeWidth={2} className="text-brand flex-shrink-0" />
                            <span className="text-xs text-brand font-medium truncate flex-1">
                              {row.match.kind === 'invoice'
                                ? `${row.match.invoice.invoice_number} · ${row.match.invoice.customer_name}`
                                : `${row.match.invoice.vendor_name}${row.match.invoice.invoice_number ? ` · ${row.match.invoice.invoice_number}` : ''}`}
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleLinked(idx)}
                              title="Verknüpfung lösen und normal buchen"
                              className="text-blue-300 hover:text-blue-600 flex-shrink-0"
                            >
                              <Unlink size={13} strokeWidth={2} />
                            </button>
                          </div>
                        ) : !row.isDuplicate ? (
                          <div className="flex items-center gap-1.5">
                            <select
                              value={row.categoryId}
                              onChange={e => setCat(idx, e.target.value)}
                              className={`w-full border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand ${
                                !row.categoryId ? 'border-amber-300 bg-amber-50' : 'border-gray-200'
                              }`}
                            >
                              <option value="">– Kategorie wählen –</option>
                              <optgroup label="Einnahmen">
                                {catsByType('income').map(c => (
                                  <option key={c.id} value={c.id}>{c.name} ({c.vat_rate}%)</option>
                                ))}
                              </optgroup>
                              <optgroup label="Ausgaben">
                                {catsByType('expense').map(c => (
                                  <option key={c.id} value={c.id}>{c.name} ({c.vat_rate}%)</option>
                                ))}
                              </optgroup>
                            </select>
                            {row.match && (
                              <button
                                type="button"
                                onClick={() => toggleLinked(idx)}
                                title="Vorgeschlagene Verknüpfung wieder übernehmen"
                                className="text-gray-300 hover:text-brand flex-shrink-0"
                              >
                                <Link2 size={13} strokeWidth={2} />
                              </button>
                            )}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {!row.isDuplicate && (
                          <input
                            type="checkbox"
                            checked={row.isPrivate}
                            onChange={() => togglePrivate(idx)}
                            title="Als Privatumsatz kennzeichnen (z.B. Privatentnahme/-einlage)"
                            className="w-4 h-4 accent-gray-500"
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Import-Button ── */}
          {(() => {
            const noCat    = rows.filter(r => r.selected && !r.isDuplicate && !(r.linked && r.match) && !r.categoryId).length;
            const importable = selectedCount - noCat;
            return (
              <div className="flex items-center gap-4 flex-wrap">
                <button
                  onClick={handleImport}
                  disabled={importing || importable === 0}
                  className="px-6 py-3 bg-brand hover:bg-accent text-white font-semibold rounded-xl transition-colors disabled:opacity-40"
                >
                  {importing
                    ? (fortschritt
                        ? `Importiere… ${fortschritt.fertig} von ${fortschritt.gesamt}`
                        : 'Wird importiert…')
                    : `${importable} Buchung${importable !== 1 ? 'en' : ''} importieren`
                  }
                </button>
                {noCat > 0 && (
                  <p className="text-xs text-amber-600">
                    {noCat} ohne Kategorie – werden übersprungen
                  </p>
                )}
              </div>
            );
          })()}

        </>
      )}
    </div>
  );
}
