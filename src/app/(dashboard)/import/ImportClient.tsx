'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { parseCamt053, type ParsedBankEntry } from '@/lib/parsers/camt053';
import { parseBankCsv } from '@/lib/parsers/bankcsv';
import { formatCurrency } from '@/lib/utils';

type Category = { id: string; name: string; type: string; vat_rate: number };

type ImportRow = ParsedBankEntry & {
  selected:    boolean;
  categoryId:  string;
  isDuplicate: boolean;
};

type Props = {
  clientId:      string;
  userId:        string;
  categories:    Category[];
  knownBankRefs: string[];
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
  // Fallback: erste passende Kategorie
  return categories.find(c => c.type === type)?.id ?? '';
}

export default function ImportClient({ clientId, userId, categories, knownBankRefs }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const knownSet = new Set(knownBankRefs);

  const [rows,      setRows]      = useState<ImportRow[]>([]);
  const [parseErrs, setParseErrs] = useState<string[]>([]);
  const [bankHint,  setBankHint]  = useState('');
  const [iban,      setIban]      = useState('');
  const [fileName,  setFileName]  = useState('');
  const [fileType,  setFileType]  = useState<'camt053'|'csv'|''>('');
  const [importing, setImporting] = useState(false);
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

    const importRows: ImportRow[] = entries.map(e => ({
      ...e,
      isDuplicate: knownSet.has(e.bankRef),
      selected:    !knownSet.has(e.bankRef),
      categoryId:  suggestCategory(e.description, e.counterpart, e.type, categories),
    }));
    setRows(importRows);
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
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

  // ── Import durchführen ───────────────────────────────────────
  async function handleImport() {
    const toImport = rows.filter(r => r.selected && !r.isDuplicate && r.categoryId);
    if (toImport.length === 0) {
      setImportMsg('Keine importierbaren Buchungen – bitte Kategorien zuweisen.');
      return;
    }

    setImporting(true); setImportMsg('');

    // Transaktionen vorbereiten (mit import_source + bank_ref falls Migration 008 gelaufen)
    const buildRow = (r: ImportRow, withExtras: boolean) => {
      const cat    = categories.find(c => c.id === r.categoryId)!;
      const amtNet = parseFloat((r.amount / (1 + cat.vat_rate / 100)).toFixed(2));
      const vatAmt = parseFloat((r.amount - amtNet).toFixed(2));
      const base = {
        client_id:   clientId,
        category_id: r.categoryId,
        type:        r.type,
        amount_net:  amtNet,
        vat_rate:    cat.vat_rate,
        vat_amount:  vatAmt,
        booking_date: r.date,
        description: [r.counterpart, r.description].filter(Boolean).join(' – ').slice(0, 500) || null,
      };
      return withExtras
        ? { ...base, import_source: fileType || 'csv', bank_ref: r.bankRef }
        : base;
    };

    const CHUNK = 50;
    let imported  = 0;
    let withExtras = true;  // versuche zuerst mit import_source + bank_ref

    for (let i = 0; i < toImport.length; i += CHUNK) {
      const chunk = toImport.slice(i, i + CHUNK).map(r => buildRow(r, withExtras));

      const { error, data } = await supabase
        .from('transactions')
        .insert(chunk)
        .select('id');

      if (error) {
        // Spalten fehlen (Migration 008 noch nicht gelaufen) → ohne Extras nochmal
        if (withExtras && (error.message.includes('import_source') || error.message.includes('bank_ref'))) {
          withExtras = false;
          i -= CHUNK;  // Chunk nochmal versuchen
          continue;
        }
        setImportMsg(`❌ Fehler beim Import: ${error.message}`);
        setImporting(false);
        return;
      }
      imported += data?.length ?? 0;
    }

    // Import-History (optional – schlägt still fehl wenn bank_imports noch nicht existiert)
    await supabase.from('bank_imports').insert({
      client_id:   clientId,
      imported_by: userId,
      file_name:   fileName,
      file_type:   fileType || 'csv',
      iban:        iban || null,
      tx_total:    rows.length,
      tx_imported: imported,
    }).then(() => {}).catch(() => {});

    setImportMsg(`✅ ${imported} Buchung${imported !== 1 ? 'en' : ''} importiert.${!withExtras ? ' (Tipp: Migration 008 ausführen für Duplikat-Schutz)' : ''}`);
    setImporting(false);

    // Zeilen als importiert markieren
    setRows(prev => prev.map(r =>
      r.selected ? { ...r, isDuplicate: true, selected: false } : r
    ));

    // Buchungsliste im Hintergrund aktualisieren
    router.refresh();
  }

  const selectedCount  = rows.filter(r => r.selected && !r.isDuplicate).length;
  const dupCount       = rows.filter(r => r.isDuplicate).length;
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
            dragOver ? 'border-[#1B3A6B] bg-blue-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
          }`}
        >
          <div className="text-4xl mb-3">🏦</div>
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
          <p className="font-semibold">⚠️ Hinweise beim Einlesen:</p>
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
              </p>
            </div>
            <button
              onClick={() => { setRows([]); setFileName(''); setImportMsg(''); }}
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              Andere Datei wählen
            </button>
          </div>

          {/* ── Status-Meldung (oben, immer sichtbar) ── */}
          {importMsg && (
            <div className={`px-4 py-3 rounded-xl border ${
              importMsg.startsWith('✅')
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-red-50 text-red-700 border-red-200'
            }`}>
              <p className="text-sm font-medium mb-2">{importMsg}</p>
              {importMsg.startsWith('✅') && (
                <div className="flex gap-3 mt-2">
                  <button
                    onClick={() => router.push('/buchungen')}
                    className="px-4 py-1.5 bg-[#1B3A6B] text-white text-xs font-semibold rounded-lg hover:bg-[#1565C0] transition-colors"
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
                className="w-4 h-4 accent-[#1B3A6B]"
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
                    <th className="text-left px-3 py-2 min-w-[200px]">Kategorie</th>
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
                          <span title="Bereits importiert" className="text-xs">🔁</span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={row.selected}
                            onChange={() => toggleRow(idx)}
                            className="w-4 h-4 accent-[#1B3A6B]"
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
                        row.type === 'income' ? 'text-[#00897B]' : 'text-[#C62828]'
                      }`}>
                        {row.type === 'income' ? '+' : '−'}{formatCurrency(row.amount)}
                      </td>
                      <td className="px-3 py-2">
                        {!row.isDuplicate && (
                          <select
                            value={row.categoryId}
                            onChange={e => setCat(idx, e.target.value)}
                            className={`w-full border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1B3A6B] ${
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
            const noCat    = rows.filter(r => r.selected && !r.isDuplicate && !r.categoryId).length;
            const importable = selectedCount - noCat;
            return (
              <div className="flex items-center gap-4 flex-wrap">
                <button
                  onClick={handleImport}
                  disabled={importing || importable === 0}
                  className="px-6 py-3 bg-[#1B3A6B] hover:bg-[#1565C0] text-white font-semibold rounded-xl transition-colors disabled:opacity-40"
                >
                  {importing
                    ? 'Wird importiert…'
                    : `${importable} Buchung${importable !== 1 ? 'en' : ''} importieren`
                  }
                </button>
                {noCat > 0 && (
                  <p className="text-xs text-amber-600">
                    ⚠️ {noCat} ohne Kategorie – werden übersprungen
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
