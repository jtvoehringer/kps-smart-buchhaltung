'use client';

import { useState, useCallback, useRef } from 'react';
import { useServerState } from '@/lib/useServerState';
import { createClient } from '@/lib/supabase/client';
import { heute } from '@/lib/fehler';
import {
  berechneKilometergeld, berechneDiaeten, vorgeschlagenerSteuersatz, reiseSaetzeFuer,
} from '@/lib/steuer';
import { useRouter }    from 'next/navigation';
import { Loader2, ScanLine } from 'lucide-react';

// ── Typen ────────────────────────────────────────────────────────────────────

type OcrData = {
  /** Plausibilitätshinweise aus der OCR-Route (Migration/Route 026er-Runde) */
  pruefhinweise?: string[];
  datum:          string | null;
  betrag_brutto:  number | null;
  mwst_satz:      number | null;
  mwst_betrag:    number | null;
  betrag_netto:   number | null;
  beschreibung:   string | null;
  lieferant:      string | null;
  typ:            'einnahme' | 'ausgabe' | null;
};

export type Receipt = {
  id:             string;
  file_name:      string;
  file_url:       string;
  file_type:      string;
  file_size:      number | null;
  status:         'pending' | 'processing' | 'processed' | 'booked' | 'error';
  ocr_data:       OcrData | null;
  ocr_error:      string | null;
  transaction_id: string | null;
  notes:          string | null;
  created_at:     string;
};

type Category = { id: string; name: string; type: string; vat_rate: number };

type Props = {
  clientId:        string;
  initialReceipts: Receipt[];
  categories:      Category[];
};

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────

const STATUS_LABELS: Record<Receipt['status'], string> = {
  pending:    'Ausstehend',
  processing: 'Wird verarbeitet…',
  processed:  'Erkannt',
  booked:     'Verbucht',
  error:      'Fehler',
};

// Keine Ampelfarben (Design-Review M1) – Rot bleibt dem Fehler vorbehalten.
const STATUS_COLORS: Record<Receipt['status'], string> = {
  pending:    'bg-well text-ink-2',
  processing: 'bg-well text-ink-2',
  processed:  'bg-accent/15 text-navy',
  booked:     'bg-income/10 text-income',
  error:      'bg-red-100 text-red-700',
};

function fmt(n: number | null | undefined, digits = 2) {
  if (n == null) return '—';
  return n.toLocaleString('de-AT', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

const BEWIRTUNG_KATEGORIE_NAME = 'Bewirtungsspesen (Geschäftsessen)';
const REISEKOSTEN_KATEGORIE_NAME = 'Reisekosten';
// Sätze und Rechner kommen aus @/lib/steuer – vorher lagen hier
// wortgleiche Kopien aus BuchungForm und BuchungBearbeitenForm.

function fileSize(bytes: number | null) {
  if (!bytes) return '';
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Hauptkomponente ───────────────────────────────────────────────────────────

export default function BelegeClient({ clientId, initialReceipts, categories }: Props) {
  const router                      = useRouter();
  const supabase                    = createClient();
  const fileInputRef                = useRef<HTMLInputElement>(null);
  const cameraInputRef              = useRef<HTMLInputElement>(null);

  const [receipts, setReceipts]     = useServerState<Receipt[]>(initialReceipts);
  const [uploading, setUploading]   = useState(false);
  const [uploadErr, setUploadErr]   = useState('');
  const [dragOver, setDragOver]     = useState(false);
  const [selected, setSelected]     = useState<Receipt | null>(null);
  const [editing, setEditing]       = useState<Partial<OcrData>>({});
  const [categoryId, setCategoryId] = useState('');
  const [bewirtungAnlass, setBewirtungAnlass]         = useState('');
  const [bewirtungTeilnehmer, setBewirtungTeilnehmer] = useState('');
  const [reiseTyp, setReiseTyp] = useState<'' | 'kilometergeld' | 'fahrtkosten' | 'naechtigung' | 'diaeten' | 'konsumation'>('');
  const [reiseZiel, setReiseZiel]       = useState('');
  const [reiseZweck, setReiseZweck]     = useState('');
  const [reiseVon, setReiseVon]         = useState('');
  const [reiseBis, setReiseBis]         = useState('');
  const [reiseKm, setReiseKm]           = useState('');
  const [reiseStunden, setReiseStunden] = useState('');
  const [booking, setBooking]       = useState(false);
  const [bookErr, setBookErr]       = useState('');

  // Kategorie-Vorschlag: erste Kategorie, die zum erkannten Typ (Einnahme/Ausgabe) passt
  function suggestCategoryId(typ: 'einnahme' | 'ausgabe' | null | undefined): string {
    const wantType = typ === 'einnahme' ? 'income' : 'expense';
    return categories.find(c => c.type === wantType)?.id ?? categories[0]?.id ?? '';
  }

  // ── Upload ────────────────────────────────────────────────────────────────

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadErr('');
    setUploading(true);

    for (const file of Array.from(files)) {
      try {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
        if (!allowed.includes(file.type)) {
          throw new Error(`${file.name}: Nur JPG, PNG, WEBP oder PDF erlaubt`);
        }
        if (file.size > 10 * 1024 * 1024) {
          throw new Error(`${file.name}: Maximale Dateigröße ist 10 MB`);
        }

        // In Storage hochladen
        const path = `${clientId}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
        const { error: storageErr } = await supabase.storage
          .from('belege')
          .upload(path, file, { contentType: file.type });

        if (storageErr) throw new Error(storageErr.message);

        // Datensatz anlegen
        const { data: receipt, error: dbErr } = await supabase
          .from('receipts')
          .insert({
            client_id:   clientId,
            file_name:   file.name,
            file_url:    path,
            file_type:   file.type,
            file_size:   file.size,
            status:      'pending',
          })
          .select()
          .single();

        if (dbErr || !receipt) throw new Error(dbErr?.message ?? 'DB-Fehler');

        // Neue Receipt in Liste einfügen
        // (ocr_data ist DB-seitig generisches JSONB; erst nach der OCR-Verarbeitung
        // hat es die engere OcrData-Form – daher Cast über unknown)
        setReceipts(prev => [receipt as unknown as Receipt, ...prev]);

        // OCR automatisch starten
        startOcr(receipt.id);

      } catch (e: unknown) {
        setUploadErr(e instanceof Error ? e.message : 'Fehler beim Upload');
      }
    }
    setUploading(false);
  }, [clientId, supabase]);

  // ── OCR anstoßen ─────────────────────────────────────────────────────────

  async function startOcr(receiptId: string) {
    setReceipts(prev => prev.map(r => r.id === receiptId ? { ...r, status: 'processing' } : r));

    // Ohne try/catch blieb der Beleg bei einem Gateway-Timeout oder einer
    // HTML-Fehlerseite dauerhaft auf "Wird verarbeitet…" stehen: res.json()
    // warf, der Status wurde nie zurückgesetzt, und in der Liste war der
    // Beleg weder anklickbar noch erneut startbar.
    try {
      const res = await fetch('/api/ocr/process', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ receiptId }),
        signal:  AbortSignal.timeout(90_000),
      });

      let data: { error?: string; ocrData?: OcrData } = {};
      try {
        data = await res.json();
      } catch {
        data = { error: `Unerwartete Antwort vom Server (HTTP ${res.status}).` };
      }

      if (!res.ok) {
        setReceipts(prev => prev.map(r =>
          r.id === receiptId ? { ...r, status: 'error', ocr_error: data.error ?? 'Belegerkennung fehlgeschlagen' } : r
        ));
      } else {
        setReceipts(prev => prev.map(r =>
          r.id === receiptId ? { ...r, status: 'processed', ocr_data: data.ocrData ?? null } : r
        ));
      }
    } catch (e: unknown) {
      const abgebrochen = e instanceof DOMException && e.name === 'TimeoutError';
      const meldung = abgebrochen
        ? 'Die Belegerkennung hat zu lange gedauert. Bitte erneut versuchen – bei mehrseitigen PDFs kann das vorkommen.'
        : (e instanceof Error ? e.message : 'Belegerkennung fehlgeschlagen');
      console.error('OCR fehlgeschlagen:', e);
      setReceipts(prev => prev.map(r =>
        r.id === receiptId ? { ...r, status: 'error', ocr_error: meldung } : r
      ));
    }
  }

  // ── Beleg auswählen ───────────────────────────────────────────────────────

  function openReceipt(r: Receipt) {
    setSelected(r);
    setEditing(r.ocr_data ?? {});
    setCategoryId(suggestCategoryId(r.ocr_data?.typ));
    setBewirtungAnlass('');
    setBewirtungTeilnehmer('');
    setReiseTyp('');
    setReiseZiel('');
    setReiseZweck('');
    setReiseVon('');
    setReiseBis('');
    setReiseKm('');
    setReiseStunden('');
    setBookErr('');
  }

  const isBewirtung = categories.find(c => c.id === categoryId)?.name === BEWIRTUNG_KATEGORIE_NAME;
  const isReisekosten = categories.find(c => c.id === categoryId)?.name === REISEKOSTEN_KATEGORIE_NAME;

  // ── Als Buchung übernehmen ────────────────────────────────────────────────

  async function handleBook() {
    if (!selected) return;
    if (!categoryId) { setBookErr('Bitte eine Kategorie auswählen.'); return; }
    if (isBewirtung && (!bewirtungAnlass.trim() || !bewirtungTeilnehmer.trim())) {
      setBookErr('Bei Bewirtungsspesen bitte Anlass und Teilnehmer angeben (Voraussetzung für die steuerliche Abzugsfähigkeit).');
      return;
    }
    if (isReisekosten) {
      if (!reiseTyp) { setBookErr('Bitte die Art der Reisekosten auswählen.'); return; }
      if (!reiseZiel.trim() || !reiseZweck.trim() || !reiseVon || !reiseBis) {
        setBookErr('Bei Reisekosten bitte Reiseziel, Zweck sowie Von/Bis-Datum angeben.');
        return;
      }
      if (reiseTyp === 'kilometergeld' && (!reiseKm || parseFloat(reiseKm) <= 0)) {
        setBookErr('Bitte die gefahrenen Kilometer angeben.');
        return;
      }
      if (reiseTyp === 'diaeten' && (!reiseStunden || parseFloat(reiseStunden) <= reiseSaetzeFuer(editing.datum).taggeldMindestStunden)) {
        setBookErr('Für Diäten sind mindestens 3 Stunden Reisedauer erforderlich.');
        return;
      }
    }
    setBooking(true);
    setBookErr('');

    const d     = editing;
    const gross = Number(d.betrag_brutto ?? 0);
    const vat   = Number(d.mwst_betrag  ?? 0);
    const net   = Number(d.betrag_netto ?? (gross - vat));
    const type  = d.typ === 'einnahme' ? 'income' : 'expense';

    // Buchung anlegen
    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .insert({
        client_id:    clientId,
        category_id:  categoryId,
        booking_date: d.datum ?? heute(),
        description:  `${d.lieferant ? d.lieferant + ' – ' : ''}${d.beschreibung ?? ''}`.trim(),
        type,
        amount_net:   net,
        vat_amount:   vat,
        // amount_gross NICHT mitschicken: ist in der DB eine GENERATED ALWAYS-Spalte
        // (amount_net + vat_amount), Postgres berechnet sie automatisch.
        vat_rate:     Number(d.mwst_satz ?? 20) as 0 | 10 | 13 | 20,
        bewirtung_anlass:     isBewirtung ? bewirtungAnlass.trim() : null,
        bewirtung_teilnehmer: isBewirtung ? bewirtungTeilnehmer.trim() : null,
        reise_typ:     isReisekosten && reiseTyp ? reiseTyp : null,
        reise_ziel:    isReisekosten ? reiseZiel.trim() : null,
        reise_zweck:   isReisekosten ? reiseZweck.trim() : null,
        reise_von:     isReisekosten ? reiseVon : null,
        reise_bis:     isReisekosten ? reiseBis : null,
        reise_km:      isReisekosten && reiseTyp === 'kilometergeld' ? parseFloat(reiseKm) : null,
        reise_stunden: isReisekosten && reiseTyp === 'diaeten' ? parseFloat(reiseStunden) : null,
      })
      .select('id')
      .single();

    if (txErr || !tx) {
      setBookErr(txErr?.message ?? 'Fehler beim Anlegen der Buchung');
      setBooking(false);
      return;
    }

    // Beleg → booked + transaction_id verknüpfen
    await supabase
      .from('receipts')
      .update({ status: 'booked', transaction_id: tx.id })
      .eq('id', selected.id);

    setReceipts(prev => prev.map(r =>
      r.id === selected.id ? { ...r, status: 'booked', transaction_id: tx.id } : r
    ));
    setSelected(null);
    setBooking(false);
    router.refresh();
  }

  // ── Drag & Drop ───────────────────────────────────────────────────────────

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const pendingCount    = receipts.filter(r => r.status === 'pending' || r.status === 'processing').length;
  const processedCount  = receipts.filter(r => r.status === 'processed').length;

  return (
    <div className="space-y-6">

      {/* Upload-Zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`rounded-xl border-2 border-dashed transition-all p-8 text-center ${
          dragOver
            ? 'border-navy bg-navy/5'
            : 'border-line-2 hover:border-navy/50 hover:bg-row'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />
        {/* Direkter Kamera-Zugriff am Smartphone: capture="environment" öffnet auf
            iOS/Android sofort die Rückkamera statt einer generischen Dateiauswahl. */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />
        {uploading ? (
          <div className="text-navy font-medium">
            <div className="text-3xl mb-2 animate-spin">⏳</div>
            Wird hochgeladen…
          </div>
        ) : (
          <>
                        <p className="font-semibold text-ink">Beleg hier ablegen</p>
            <p className="text-xs text-ink-3 mt-1 mb-4">JPG · PNG · WEBP · PDF · max. 10 MB</p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="inline-flex items-center gap-2 bg-navy hover:bg-navy-2 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
              >
                Foto aufnehmen
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 bg-white border border-line-2 hover:border-line-2 text-ink-2 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
              >
                Datei wählen
              </button>
            </div>
          </>
        )}
      </div>

      {uploadErr && (
        <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg">{uploadErr}</p>
      )}

      {/* Status-Kacheln */}
      {receipts.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="card p-4 text-center">
            <p className="num text-[24px] font-semibold text-navy">{receipts.length}</p>
            <p className="text-xs text-ink-3 mt-0.5">Belege gesamt</p>
          </div>
          <div className="card p-4 text-center">
            <p className="num text-[24px] font-semibold text-navy">{processedCount}</p>
            <p className="text-xs text-ink-3 mt-0.5">Erkannt, offen</p>
          </div>
          <div className="card p-4 text-center">
            <p className="num text-[24px] font-semibold text-navy">
              {receipts.filter(r => r.status === 'booked').length}
            </p>
            <p className="text-xs text-ink-3 mt-0.5">Verbucht</p>
          </div>
        </div>
      )}

      {/* Belegliste */}
      {receipts.length === 0 ? (
        <div className="card py-16 text-center text-ink-3">
          <ScanLine size={28} strokeWidth={1.5} className="mx-auto text-ink-3 mb-3" />
          <p className="text-sm">Noch keine Belege hochgeladen</p>
          <p className="text-xs text-ink-3 mt-1">Oben ein Foto oder PDF hineinziehen – der Rest passiert automatisch.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="px-6 py-3 border-b border-line label-mono">
            {pendingCount > 0 ? `${pendingCount} werden verarbeitet…` : 'Belegliste'}
          </div>
          <ul className="divide-y divide-line">
            {receipts.map(r => (
              <li
                key={r.id}
                onClick={() => r.status !== 'pending' && r.status !== 'processing' && openReceipt(r)}
                className={`flex items-center gap-4 px-6 py-3.5 transition-colors ${
                  r.status !== 'pending' && r.status !== 'processing'
                    ? 'cursor-pointer hover:bg-row'
                    : 'opacity-60'
                }`}
              >
                {/* Icon */}
                <span className="text-[10px] font-bold uppercase tracking-wide text-ink-3 shrink-0 w-8">
                  {r.file_type === 'application/pdf' ? 'PDF' : 'Bild'}
                </span>

                {/* Dateiname + Erkennungsergebnis */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{r.file_name}</p>
                  {r.ocr_data && (
                    <p className="text-xs text-ink-3 truncate">
                      {r.ocr_data.lieferant ?? '—'} &middot; {r.ocr_data.datum ?? '—'} &middot;{' '}
                      <span className={r.ocr_data.typ === 'einnahme' ? 'text-income' : 'text-expense'}>
                        {fmt(r.ocr_data.betrag_brutto)} €
                      </span>
                    </p>
                  )}
                  {r.ocr_error && (
                    <p className="text-xs text-red-500 truncate">{r.ocr_error}</p>
                  )}
                  {r.status === 'processing' && !r.ocr_error && (
                    <p className="text-xs text-ink-3">
                      Läuft. Bleibt es länger stehen, rechts auf „Erneut versuchen" tippen.
                    </p>
                  )}
                </div>

                {/* Dateigröße */}
                <span className="text-xs text-ink-3 shrink-0 hidden sm:block">
                  {fileSize(r.file_size)}
                </span>

                {/* Status-Badge */}
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-sm font-mono uppercase tracking-[0.03em] shrink-0 ${STATUS_COLORS[r.status]}`}>
                  {r.status === 'processing'
                    ? <span className="flex items-center gap-1"><Loader2 size={11} strokeWidth={2.5} className="animate-spin" /> Läuft…</span>
                    : STATUS_LABELS[r.status]
                  }
                </span>

                {/* Erneut versuchen – auch bei 'processing'. Bricht die
                    Serverless-Function ab (Timeout, Neustart), bleibt der
                    Status sonst für immer auf "Wird verarbeitet…" und der
                    Beleg ist über die Oberfläche nicht mehr erreichbar. */}
                {(r.status === 'error' || r.status === 'processing') && (
                  <button
                    onClick={e => { e.stopPropagation(); void startOcr(r.id); }}
                    className="text-xs text-navy hover:underline shrink-0"
                    title={r.status === 'processing'
                      ? 'Erkennung neu starten – falls sie hängengeblieben ist'
                      : 'Erkennung erneut versuchen'}
                  >
                    Erneut versuchen
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Detail-Modal */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setSelected(null)}
        >
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-line">
              <div>
                <h2 className="font-bold text-ink text-base">{selected.file_name}</h2>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-sm font-mono uppercase tracking-[0.03em] ${STATUS_COLORS[selected.status]}`}>
                  {STATUS_LABELS[selected.status]}
                </span>
              </div>
              <button onClick={() => setSelected(null)} className="text-ink-3 hover:text-navy text-xl leading-none">✕</button>
            </div>

            {/* Erkannte Daten */}
            {selected.ocr_data || selected.status === 'processed' ? (
              <div className="px-6 py-5 space-y-4">
                <p className="label-mono">
                  KI-Erkennung — bitte prüfen und ggf. korrigieren
                </p>

                {/* Plausibilitätshinweise der Erkennung. Vorher wurden
                    netto/USt/Satz ungeprüft übernommen – bei einem Beleg
                    mit mehreren Steuersätzen ergab das eine Buchung, deren
                    Steuer zu keinem der Sätze passte. */}
                {selected.ocr_data?.pruefhinweise?.length ? (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 space-y-1">
                    <p className="text-xs font-semibold text-amber-900">
                      Bitte vor dem Verbuchen prüfen
                    </p>
                    <ul className="text-xs text-amber-800 list-disc pl-4 space-y-0.5">
                      {selected.ocr_data.pruefhinweise.map((h, i) => <li key={i}>{h}</li>)}
                    </ul>
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-3">
                  {/* Typ */}
                  <div className="col-span-2">
                    <span id="gruppe-belegtyp" className="text-xs text-ink-2 font-medium block mb-1">Typ</span>
        <div role="group" aria-labelledby="gruppe-belegtyp" className="flex gap-2">
                      {(['ausgabe', 'einnahme'] as const).map(t => (
                        <button
                          key={t}
                          onClick={() => {
                            setEditing(p => ({ ...p, typ: t }));
                            setCategoryId(suggestCategoryId(t));
                          }}
                          className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-all ${
                            editing.typ === t
                              ? t === 'ausgabe'
                                ? 'border-red-500 bg-red-50 text-red-700'
                                : 'border-green-500 bg-green-50 text-green-700'
                              : 'border-line-2 text-ink-2'
                          }`}
                        >
                          {t === 'ausgabe' ? 'Ausgabe' : 'Einnahme'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Kategorie */}
                  <div className="col-span-2">
                    <label htmlFor="belegeClient-0" className="text-xs text-ink-2 font-medium block mb-1">Kategorie</label>
                    <select id="belegeClient-0"
                      value={categoryId}
                      onChange={e => setCategoryId(e.target.value)}
                      className="w-full border border-line-2 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30/30 bg-white"
                    >
                      <option value="">– bitte wählen –</option>
                      {categories
                        .filter(c => c.type === (editing.typ === 'einnahme' ? 'income' : 'expense'))
                        .map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                  </div>


                  {/* Bewirtungsspesen: Pflichtangaben für steuerliche Abzugsfähigkeit */}
                  {isBewirtung && (
                    <div className="col-span-2 rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                      <p className="text-xs text-amber-800 leading-relaxed">
                        Bewirtungsspesen sind einkommensteuerlich idR nur zu <strong>50 % abzugsfähig</strong>
                        (§ 20 EStG), die Vorsteuer bleibt idR zur Gänze abzugsfähig. Voraussetzung ist die
                        Dokumentation von Anlass und Teilnehmern – beides ist daher hier verpflichtend.
                      </p>
                      <div>
                        <label htmlFor="belegeClient-1" className="block text-xs font-medium text-amber-900 mb-1">Anlass der Bewirtung *</label>
                        <input id="belegeClient-1" type="text" required placeholder="z.B. Projektbesprechung mit Kunde XY"
                          value={bewirtungAnlass} onChange={e => setBewirtungAnlass(e.target.value)}
                          className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-400 bg-white" />
                      </div>
                      <div>
                        <label htmlFor="belegeClient-2" className="block text-xs font-medium text-amber-900 mb-1">Teilnehmer *</label>
                        <input id="belegeClient-2" type="text" required placeholder="z.B. Max Mustermann (Kunde XY GmbH), Jörgen Voehringer"
                          value={bewirtungTeilnehmer} onChange={e => setBewirtungTeilnehmer(e.target.value)}
                          className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-400 bg-white" />
                      </div>
                    </div>
                  )}

                  {/* Reisekosten: Typ, Pflichtangaben, Rechner für Kilometergeld/Diäten */}
                  {isReisekosten && (
                    <div className="col-span-2 rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                      <p className="text-xs text-amber-800 leading-relaxed">
                        Reisekosten werden steuerlich unterschiedlich behandelt: Kilometergeld und Diäten sind
                        pauschale, vorsteuerfreie Aufwandsentschädigungen (§ 4 Abs. 5 / § 26 Z 4 EStG), Fahrtkosten,
                        Nächtigung und Konsumation werden mit dem tatsächlichen Belegbetrag gebucht. Ziel, Zweck und
                        Zeitraum der Reise sind für den Nachweis verpflichtend.
                      </p>
                      <div>
                        <label htmlFor="belegeClient-3" className="block text-xs font-medium text-amber-900 mb-1">Art der Reisekosten *</label>
                        <select id="belegeClient-3" required value={reiseTyp} onChange={e => setReiseTyp(e.target.value as typeof reiseTyp)}
                          className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-400 bg-white">
                          <option value="">Bitte wählen…</option>
                          <option value="kilometergeld">Kilometergeld</option>
                          <option value="fahrtkosten">Fahrtkosten (Bahn/Flug/Taxi)</option>
                          <option value="naechtigung">Nächtigung/Hotel</option>
                          <option value="diaeten">Diäten (Verpflegungsmehraufwand)</option>
                          <option value="konsumation">Konsumation auf Reisen</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="belegeClient-4" className="block text-xs font-medium text-amber-900 mb-1">Reiseziel *</label>
                          <input id="belegeClient-4" type="text" required placeholder="z.B. Wien" value={reiseZiel}
                            onChange={e => setReiseZiel(e.target.value)}
                            className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-400 bg-white" />
                        </div>
                        <div>
                          <label htmlFor="belegeClient-5" className="block text-xs font-medium text-amber-900 mb-1">Zweck der Reise *</label>
                          <input id="belegeClient-5" type="text" required placeholder="z.B. Kundentermin XY GmbH" value={reiseZweck}
                            onChange={e => setReiseZweck(e.target.value)}
                            className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-400 bg-white" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="belegeClient-6" className="block text-xs font-medium text-amber-900 mb-1">Von *</label>
                          <input id="belegeClient-6" type="date" required value={reiseVon} onChange={e => setReiseVon(e.target.value)}
                            className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-400 bg-white" />
                        </div>
                        <div>
                          <label htmlFor="belegeClient-7" className="block text-xs font-medium text-amber-900 mb-1">Bis *</label>
                          <input id="belegeClient-7" type="date" required value={reiseBis} onChange={e => setReiseBis(e.target.value)}
                            className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-400 bg-white" />
                        </div>
                      </div>

                      {reiseTyp === 'kilometergeld' && (
                        <div className="bg-white rounded-lg border border-amber-300 p-3 space-y-2">
                          <label htmlFor="belegeClient-8" className="block text-xs font-medium text-amber-900 mb-1">Gefahrene Kilometer *</label>
                          <input id="belegeClient-8" type="number" required min="0.1" step="0.1" placeholder="z.B. 120" value={reiseKm}
                            onChange={e => {
                              const km = e.target.value;
                              setReiseKm(km);
                              const betrag = berechneKilometergeld(parseFloat(km), editing.datum);
                              setEditing(p => ({ ...p, betrag_brutto: betrag, mwst_satz: 0, mwst_betrag: 0, betrag_netto: betrag }));
                            }}
                            className="w-full border border-line-2 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-400" />
                          <p className="text-xs text-ink-2">
                            Amtliches Kilometergeld PKW: {reiseSaetzeFuer(editing.datum).kmSatz.toFixed(2)} €/km · keine Vorsteuer (Pauschale)
                          </p>
                        </div>
                      )}

                      {reiseTyp === 'diaeten' && (
                        <div className="bg-white rounded-lg border border-amber-300 p-3 space-y-2">
                          <label htmlFor="belegeClient-9" className="block text-xs font-medium text-amber-900 mb-1">Reisedauer in Stunden *</label>
                          <input id="belegeClient-9" type="number" required min="0.5" step="0.5" placeholder="z.B. 9,5" value={reiseStunden}
                            onChange={e => {
                              const val = e.target.value;
                              setReiseStunden(val);
                              const betrag = berechneDiaeten(parseFloat(val), editing.datum);
                              setEditing(p => ({ ...p, betrag_brutto: betrag, mwst_satz: 0, mwst_betrag: 0, betrag_netto: betrag }));
                            }}
                            className="w-full border border-line-2 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-400" />
                          <p className="text-xs text-ink-2">
                            Bis {reiseSaetzeFuer(editing.datum).taggeldMindestStunden} Std. kein Taggeld ·
                            darüber {(reiseSaetzeFuer(editing.datum).taggeld / 12).toFixed(2)} € je angefangener Stunde ·
                            voller Satz {reiseSaetzeFuer(editing.datum).taggeld.toFixed(2)} € ab der 12. angefangenen Stunde ·
                            Mehrtagesreisen: Gesamtstunden eintragen · keine Vorsteuer (Pauschale)
                          </p>
                        </div>
                      )}

                      {reiseTyp === 'naechtigung' && (
                        <p className="text-xs text-amber-700 bg-white rounded-lg border border-amber-300 p-3">
                          Nächtigungspauschale ohne Beleg: 17,00 €/Nacht (inkl. Frühstück). Liegt eine Hotelrechnung vor,
                          bitte den tatsächlichen Rechnungsbetrag inkl. ausgewiesener USt unten eintragen.
                        </p>
                      )}

                      {reiseTyp === 'konsumation' && (
                        <p className="text-xs text-amber-700 bg-white rounded-lg border border-amber-300 p-3">
                          Hinweis: Verpflegungskosten auf Dienstreisen sind idR bereits durch die Diäten-Pauschale
                          abgegolten – zusätzliche Konsumationsbelege sind meist nicht separat abzugsfähig. Bitte im
                          Zweifel mit der Kanzlei abstimmen.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Datum */}
                  <div>
                    <label htmlFor="belegeClient-10" className="text-xs text-ink-2 font-medium block mb-1">Datum</label>
                    <input id="belegeClient-10"
                      type="date"
                      value={editing.datum ?? ''}
                      onChange={e => setEditing(p => ({ ...p, datum: e.target.value }))}
                      className="w-full border border-line-2 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30/30"
                    />
                  </div>

                  {/* MwSt-Satz */}
                  <div>
                    <label htmlFor="belegeClient-11" className="text-xs text-ink-2 font-medium block mb-1">MwSt-Satz</label>
                    <select id="belegeClient-11"
                      value={editing.mwst_satz ?? 20}
                      disabled={isReisekosten && (reiseTyp === 'kilometergeld' || reiseTyp === 'diaeten')}
                      onChange={e => {
                        const satz  = Number(e.target.value);
                        const gross = Number(editing.betrag_brutto ?? 0);
                        const vat   = gross - gross / (1 + satz / 100);
                        setEditing(p => ({
                          ...p,
                          mwst_satz:    satz,
                          mwst_betrag:  Math.round(vat * 100) / 100,
                          betrag_netto: Math.round((gross - vat) * 100) / 100,
                        }));
                      }}
                      className="w-full border border-line-2 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30/30 bg-white disabled:bg-well disabled:cursor-not-allowed"
                    >
                      {[0, 10, 13, 20].map(s => (
                        <option key={s} value={s}>{s} %</option>
                      ))}
                    </select>
                  </div>

                  {/* Betrag Brutto */}
                  <div>
                    <label htmlFor="belegeClient-12" className="text-xs text-ink-2 font-medium block mb-1">Brutto (€)</label>
                    <input id="belegeClient-12"
                      type="number"
                      step="0.01"
                      value={editing.betrag_brutto ?? ''}
                      disabled={isReisekosten && (reiseTyp === 'kilometergeld' || reiseTyp === 'diaeten')}
                      onChange={e => {
                        const gross = Number(e.target.value);
                        const satz  = Number(editing.mwst_satz ?? 20);
                        const vat   = gross - gross / (1 + satz / 100);
                        setEditing(p => ({
                          ...p,
                          betrag_brutto: gross,
                          mwst_betrag:   Math.round(vat * 100) / 100,
                          betrag_netto:  Math.round((gross - vat) * 100) / 100,
                        }));
                      }}
                      className="w-full border border-line-2 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30/30 disabled:bg-well disabled:cursor-not-allowed"
                    />
                  </div>

                  {/* MwSt-Betrag (readonly) */}
                  <div>
                    <label htmlFor="belegeClient-13" className="text-xs text-ink-2 font-medium block mb-1">MwSt-Betrag (€)</label>
                    <input id="belegeClient-13"
                      type="number"
                      readOnly
                      value={fmt(editing.mwst_betrag ?? null)}
                      className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-row text-ink-2"
                    />
                  </div>

                  {/* Lieferant */}
                  <div className="col-span-2">
                    <label htmlFor="belegeClient-14" className="text-xs text-ink-2 font-medium block mb-1">Lieferant / Aussteller</label>
                    <input id="belegeClient-14"
                      type="text"
                      value={editing.lieferant ?? ''}
                      onChange={e => setEditing(p => ({ ...p, lieferant: e.target.value }))}
                      className="w-full border border-line-2 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30/30"
                    />
                  </div>

                  {/* Beschreibung */}
                  <div className="col-span-2">
                    <label htmlFor="belegeClient-15" className="text-xs text-ink-2 font-medium block mb-1">Beschreibung</label>
                    <input id="belegeClient-15"
                      type="text"
                      value={editing.beschreibung ?? ''}
                      onChange={e => setEditing(p => ({ ...p, beschreibung: e.target.value }))}
                      className="w-full border border-line-2 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30/30"
                    />
                  </div>
                </div>

                {bookErr && (
                  <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{bookErr}</p>
                )}

                {selected.status !== 'booked' ? (
                  <button
                    onClick={handleBook}
                    disabled={booking || !editing.betrag_brutto || !categoryId}
                    className="w-full py-3 bg-navy hover:bg-navy-2 text-white font-semibold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {booking ? 'Wird verbucht…' : 'Als Buchung übernehmen'}
                  </button>
                ) : (
                  <div className="text-center py-3 bg-green-50 rounded-xl text-green-700 font-semibold text-sm">
                    ✓ Bereits verbucht
                  </div>
                )}
              </div>
            ) : selected.status === 'error' ? (
              <div className="px-6 py-8 text-center">
                <p className="text-red-600 text-sm font-medium mb-2">OCR fehlgeschlagen</p>
                <p className="text-red-400 text-xs mb-4">{selected.ocr_error}</p>
                <button
                  onClick={() => { startOcr(selected.id); setSelected(null); }}
                  className="px-5 py-2 bg-navy text-white text-sm rounded-lg hover:bg-navy-2"
                >
                  Nochmals versuchen
                </button>
              </div>
            ) : (
              <div className="px-6 py-10 text-center text-ink-3">
                <div className="text-3xl mb-2 animate-spin">⏳</div>
                <p className="text-sm">Wird verarbeitet…</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hinweis-Box */}
      <div className="rounded-xl border border-accent/40 bg-surface-band px-5 py-4 text-sm text-navy">
        <p className="font-semibold mb-1">Wie es funktioniert</p>
        <p className="text-xs leading-relaxed opacity-80">
          Foto oder Scan hochladen (JPG, PNG, PDF) → KI erkennt automatisch Datum, Betrag, MwSt-Satz und Lieferant →
          Daten prüfen und ggf. korrigieren → „Als Buchung übernehmen" erstellt die Buchung und verknüpft den Beleg.
          Belege werden verschlüsselt in der Cloud gespeichert.
        </p>
      </div>
    </div>
  );
}
