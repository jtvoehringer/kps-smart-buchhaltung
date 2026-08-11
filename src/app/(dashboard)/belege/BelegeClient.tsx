'use client';

import { useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter }    from 'next/navigation';

// ── Typen ────────────────────────────────────────────────────────────────────

type OcrData = {
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

const STATUS_COLORS: Record<Receipt['status'], string> = {
  pending:    'bg-gray-100 text-gray-600',
  processing: 'bg-blue-100 text-blue-700',
  processed:  'bg-amber-100 text-amber-700',
  booked:     'bg-green-100 text-green-700',
  error:      'bg-red-100 text-red-700',
};

function fmt(n: number | null | undefined, digits = 2) {
  if (n == null) return '—';
  return n.toLocaleString('de-AT', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

const BEWIRTUNG_KATEGORIE_NAME = 'Bewirtungsspesen (Geschäftsessen)';

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

  const [receipts, setReceipts]     = useState<Receipt[]>(initialReceipts);
  const [uploading, setUploading]   = useState(false);
  const [uploadErr, setUploadErr]   = useState('');
  const [dragOver, setDragOver]     = useState(false);
  const [selected, setSelected]     = useState<Receipt | null>(null);
  const [editing, setEditing]       = useState<Partial<OcrData>>({});
  const [categoryId, setCategoryId] = useState('');
  const [bewirtungAnlass, setBewirtungAnlass]         = useState('');
  const [bewirtungTeilnehmer, setBewirtungTeilnehmer] = useState('');
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

    const res  = await fetch('/api/ocr/process', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ receiptId }),
    });
    const data = await res.json();

    if (!res.ok) {
      setReceipts(prev => prev.map(r =>
        r.id === receiptId ? { ...r, status: 'error', ocr_error: data.error } : r
      ));
    } else {
      setReceipts(prev => prev.map(r =>
        r.id === receiptId ? { ...r, status: 'processed', ocr_data: data.ocrData } : r
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
    setBookErr('');
  }

  const isBewirtung = categories.find(c => c.id === categoryId)?.name === BEWIRTUNG_KATEGORIE_NAME;

  // ── Als Buchung übernehmen ────────────────────────────────────────────────

  async function handleBook() {
    if (!selected) return;
    if (!categoryId) { setBookErr('Bitte eine Kategorie auswählen.'); return; }
    if (isBewirtung && (!bewirtungAnlass.trim() || !bewirtungTeilnehmer.trim())) {
      setBookErr('Bei Bewirtungsspesen bitte Anlass und Teilnehmer angeben (Voraussetzung für die steuerliche Abzugsfähigkeit).');
      return;
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
        booking_date: d.datum ?? new Date().toISOString().split('T')[0],
        description:  `${d.lieferant ? d.lieferant + ' – ' : ''}${d.beschreibung ?? ''}`.trim(),
        type,
        amount_net:   net,
        vat_amount:   vat,
        // amount_gross NICHT mitschicken: ist in der DB eine GENERATED ALWAYS-Spalte
        // (amount_net + vat_amount), Postgres berechnet sie automatisch.
        vat_rate:     Number(d.mwst_satz ?? 20) as 0 | 10 | 13 | 20,
        bewirtung_anlass:     isBewirtung ? bewirtungAnlass.trim() : null,
        bewirtung_teilnehmer: isBewirtung ? bewirtungTeilnehmer.trim() : null,
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
            ? 'border-[#35609E] bg-[#35609E]/5'
            : 'border-gray-300 hover:border-[#35609E]/50 hover:bg-gray-50'
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
          <div className="text-[#35609E] font-medium">
            <div className="text-3xl mb-2 animate-spin">⏳</div>
            Wird hochgeladen…
          </div>
        ) : (
          <>
            <div className="text-4xl mb-3">📎</div>
            <p className="font-semibold text-gray-700">Beleg hier ablegen</p>
            <p className="text-xs text-gray-400 mt-1 mb-4">JPG · PNG · WEBP · PDF · max. 10 MB</p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="inline-flex items-center gap-2 bg-[#35609E] hover:bg-[#4F90E8] text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
              >
                📷 Foto aufnehmen
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 bg-white border border-gray-200 hover:border-gray-300 text-gray-600 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
              >
                📁 Datei wählen
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
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <p className="text-2xl font-bold text-[#35609E]">{receipts.length}</p>
            <p className="text-xs text-gray-400 mt-0.5">Belege gesamt</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{processedCount}</p>
            <p className="text-xs text-gray-400 mt-0.5">Erkannt, offen</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <p className="text-2xl font-bold text-green-600">
              {receipts.filter(r => r.status === 'booked').length}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">Verbucht</p>
          </div>
        </div>
      )}

      {/* Belegliste */}
      {receipts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 py-16 text-center text-gray-400">
          <div className="text-4xl mb-3">🗂️</div>
          <p className="text-sm">Noch keine Belege hochgeladen</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-3 border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            {pendingCount > 0 ? `${pendingCount} werden verarbeitet…` : 'Belegliste'}
          </div>
          <ul className="divide-y divide-gray-50">
            {receipts.map(r => (
              <li
                key={r.id}
                onClick={() => r.status !== 'pending' && r.status !== 'processing' && openReceipt(r)}
                className={`flex items-center gap-4 px-6 py-3.5 transition-colors ${
                  r.status !== 'pending' && r.status !== 'processing'
                    ? 'cursor-pointer hover:bg-gray-50'
                    : 'opacity-60'
                }`}
              >
                {/* Icon */}
                <span className="text-xl flex-shrink-0">
                  {r.file_type === 'application/pdf' ? '📄' : '🖼️'}
                </span>

                {/* Dateiname + Erkennungsergebnis */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{r.file_name}</p>
                  {r.ocr_data && (
                    <p className="text-xs text-gray-400 truncate">
                      {r.ocr_data.lieferant ?? '—'} &middot; {r.ocr_data.datum ?? '—'} &middot;{' '}
                      <span className={r.ocr_data.typ === 'einnahme' ? 'text-green-600' : 'text-red-600'}>
                        {fmt(r.ocr_data.betrag_brutto)} €
                      </span>
                    </p>
                  )}
                  {r.ocr_error && (
                    <p className="text-xs text-red-500 truncate">{r.ocr_error}</p>
                  )}
                </div>

                {/* Dateigröße */}
                <span className="text-xs text-gray-400 flex-shrink-0 hidden sm:block">
                  {fileSize(r.file_size)}
                </span>

                {/* Status-Badge */}
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLORS[r.status]}`}>
                  {r.status === 'processing'
                    ? <span className="flex items-center gap-1"><span className="animate-spin">⏳</span> Läuft…</span>
                    : STATUS_LABELS[r.status]
                  }
                </span>

                {/* Retry-Button bei Fehler */}
                {r.status === 'error' && (
                  <button
                    onClick={e => { e.stopPropagation(); startOcr(r.id); }}
                    className="text-xs text-[#35609E] hover:underline flex-shrink-0"
                  >
                    Retry
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-800 text-base">{selected.file_name}</h2>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[selected.status]}`}>
                  {STATUS_LABELS[selected.status]}
                </span>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            {/* Erkannte Daten */}
            {selected.ocr_data || selected.status === 'processed' ? (
              <div className="px-6 py-5 space-y-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  KI-Erkennung — bitte prüfen und ggf. korrigieren
                </p>

                <div className="grid grid-cols-2 gap-3">
                  {/* Typ */}
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 font-medium block mb-1">Typ</label>
                    <div className="flex gap-2">
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
                              : 'border-gray-200 text-gray-500'
                          }`}
                        >
                          {t === 'ausgabe' ? '📤 Ausgabe' : '📥 Einnahme'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Kategorie */}
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 font-medium block mb-1">Kategorie</label>
                    <select
                      value={categoryId}
                      onChange={e => setCategoryId(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E]/30 bg-white"
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
                        <label className="block text-xs font-medium text-amber-900 mb-1">Anlass der Bewirtung *</label>
                        <input type="text" required placeholder="z.B. Projektbesprechung mit Kunde XY"
                          value={bewirtungAnlass} onChange={e => setBewirtungAnlass(e.target.value)}
                          className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-amber-900 mb-1">Teilnehmer *</label>
                        <input type="text" required placeholder="z.B. Max Mustermann (Kunde XY GmbH), Jörgen Voehringer"
                          value={bewirtungTeilnehmer} onChange={e => setBewirtungTeilnehmer(e.target.value)}
                          className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
                      </div>
                    </div>
                  )}

                  {/* Datum */}
                  <div>
                    <label className="text-xs text-gray-500 font-medium block mb-1">Datum</label>
                    <input
                      type="date"
                      value={editing.datum ?? ''}
                      onChange={e => setEditing(p => ({ ...p, datum: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E]/30"
                    />
                  </div>

                  {/* MwSt-Satz */}
                  <div>
                    <label className="text-xs text-gray-500 font-medium block mb-1">MwSt-Satz</label>
                    <select
                      value={editing.mwst_satz ?? 20}
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
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E]/30 bg-white"
                    >
                      {[0, 10, 13, 20].map(s => (
                        <option key={s} value={s}>{s} %</option>
                      ))}
                    </select>
                  </div>

                  {/* Betrag Brutto */}
                  <div>
                    <label className="text-xs text-gray-500 font-medium block mb-1">Brutto (€)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editing.betrag_brutto ?? ''}
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
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E]/30"
                    />
                  </div>

                  {/* MwSt-Betrag (readonly) */}
                  <div>
                    <label className="text-xs text-gray-500 font-medium block mb-1">MwSt-Betrag (€)</label>
                    <input
                      type="number"
                      readOnly
                      value={fmt(editing.mwst_betrag ?? null)}
                      className="w-full border border-gray-100 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500"
                    />
                  </div>

                  {/* Lieferant */}
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 font-medium block mb-1">Lieferant / Aussteller</label>
                    <input
                      type="text"
                      value={editing.lieferant ?? ''}
                      onChange={e => setEditing(p => ({ ...p, lieferant: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E]/30"
                    />
                  </div>

                  {/* Beschreibung */}
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 font-medium block mb-1">Beschreibung</label>
                    <input
                      type="text"
                      value={editing.beschreibung ?? ''}
                      onChange={e => setEditing(p => ({ ...p, beschreibung: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E]/30"
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
                    className="w-full py-3 bg-[#35609E] hover:bg-[#4F90E8] text-white font-semibold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {booking ? 'Wird verbucht…' : '✅ Als Buchung übernehmen'}
                  </button>
                ) : (
                  <div className="text-center py-3 bg-green-50 rounded-xl text-green-700 font-semibold text-sm">
                    ✅ Bereits verbucht
                  </div>
                )}
              </div>
            ) : selected.status === 'error' ? (
              <div className="px-6 py-8 text-center">
                <p className="text-red-600 text-sm font-medium mb-2">OCR fehlgeschlagen</p>
                <p className="text-red-400 text-xs mb-4">{selected.ocr_error}</p>
                <button
                  onClick={() => { startOcr(selected.id); setSelected(null); }}
                  className="px-5 py-2 bg-[#35609E] text-white text-sm rounded-lg hover:bg-[#4F90E8]"
                >
                  Nochmals versuchen
                </button>
              </div>
            ) : (
              <div className="px-6 py-10 text-center text-gray-400">
                <div className="text-3xl mb-2 animate-spin">⏳</div>
                <p className="text-sm">Wird verarbeitet…</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hinweis-Box */}
      <div className="rounded-xl border border-accent/40 bg-surface-band px-5 py-4 text-sm text-accent-dark">
        <p className="font-semibold mb-1">ℹ️ Wie es funktioniert</p>
        <p className="text-xs leading-relaxed opacity-80">
          Foto oder Scan hochladen (JPG, PNG, PDF) → KI erkennt automatisch Datum, Betrag, MwSt-Satz und Lieferant →
          Daten prüfen und ggf. korrigieren → „Als Buchung übernehmen" erstellt die Buchung und verknüpft den Beleg.
          Belege werden verschlüsselt in der Cloud gespeichert.
        </p>
      </div>
    </div>
  );
}
