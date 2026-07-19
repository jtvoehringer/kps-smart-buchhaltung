'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Category = { id: string; name: string; type: string; vat_rate: number };

const EAUTO_HOECHSTGRENZE = 40000;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_SIZE_MB = 10;

export default function BuchungForm({
  clientId,
  categories,
  bookingMode,
}: {
  clientId: string;
  categories: Category[];
  bookingMode: string;
}) {
  const router   = useRouter();
  const supabase = createClient();
  const isBrutto = bookingMode === 'brutto';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const today = new Date().toISOString().split('T')[0];

  const [type, setType]               = useState<'income' | 'expense'>('income');
  const [categoryId, setCategoryId]   = useState('');
  const [bookingDate, setBookingDate] = useState(today);
  const [amount, setAmount]           = useState('');
  const [vatRate, setVatRate]         = useState(20);
  const [description, setDescription] = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [isEAuto, setIsEAuto]         = useState(false);

  // Belegauswahl (optional)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileError, setFileError]         = useState('');

  const filteredCategories = categories.filter(c => c.type === type);

  useEffect(() => {
    const cat = categories.find(c => c.id === categoryId);
    if (cat) setVatRate(cat.vat_rate);
  }, [categoryId, categories]);

  useEffect(() => {
    const first = categories.find(c => c.type === type);
    if (first) { setCategoryId(first.id); setVatRate(first.vat_rate); }
    if (type === 'income') setIsEAuto(false);
  }, [type, categories]);

  useEffect(() => { if (isEAuto) setVatRate(20); }, [isEAuto]);

  const inputNum = parseFloat(amount) || 0;
  const netNum   = isBrutto ? inputNum / (1 + vatRate / 100) : inputNum;
  const grossNum = isBrutto ? inputNum : inputNum * (1 + vatRate / 100);
  const vatAmt   = grossNum - netNum;

  const eAutoAbzugsfaehigNetto    = Math.min(netNum, EAUTO_HOECHSTGRENZE);
  const eAutoVstGesamt            = Math.round(netNum * 0.20 * 100) / 100;
  const eAutoVstAbzugsfaehig      = Math.round(eAutoAbzugsfaehigNetto * 0.20 * 100) / 100;
  const eAutoVstNichtAbzugsfaehig = Math.max(0, Math.round((eAutoVstGesamt - eAutoVstAbzugsfaehig) * 100) / 100);
  const eAutoUeberschreitung      = netNum > EAUTO_HOECHSTGRENZE;
  const vatAmtSaved               = isEAuto ? eAutoVstAbzugsfaehig : vatAmt;

  const displayNet   = netNum   > 0 ? netNum.toFixed(2)   : '—';
  const displayGross = grossNum > 0 ? grossNum.toFixed(2) : '—';
  const displayVat   = vatAmt   > 0 ? vatAmt.toFixed(2)   : '—';

  function eur(val: number) {
    return new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(val);
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    setFileError('');
    const toAdd: File[] = [];
    for (const file of Array.from(files)) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setFileError('Nur PDF, JPG, PNG und WebP erlaubt.');
        continue;
      }
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        setFileError(`"${file.name}" ist zu groß (max. ${MAX_SIZE_MB} MB).`);
        continue;
      }
      toAdd.push(file);
    }
    setSelectedFiles(prev => [...prev, ...toAdd]);
  }

  function removeFile(idx: number) {
    setSelectedFiles(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) {
      setError('Bitte einen gültigen Betrag eingeben.');
      return;
    }
    setLoading(true);
    setError('');

    const descFinal = isEAuto
      ? [description, `[E-Auto: VSt abzugsfähig ${eur(eAutoVstAbzugsfaehig)} von ${eur(eAutoVstGesamt)} gesamt]`]
          .filter(Boolean).join(' ')
      : (description || null);

    // Buchung anlegen – mit ID zurückholen für Beleguploads
    const { data: newTx, error: insertError } = await supabase
      .from('transactions')
      .insert({
        client_id:    clientId,
        category_id:  categoryId,
        type,
        amount_net:   Math.round(netNum      * 100) / 100,
        // amount_gross NICHT mitschicken: ist in der DB eine GENERATED ALWAYS-Spalte
        // (amount_net + vat_amount), Postgres berechnet sie automatisch.
        vat_rate:     vatRate as 0 | 10 | 13 | 20,
        vat_amount:   Math.round(vatAmtSaved * 100) / 100,
        booking_date: bookingDate,
        description:  descFinal,
      })
      .select('id')
      .single();

    if (insertError || !newTx) {
      setError(`Fehler: ${insertError?.message ?? 'Unbekannter Fehler'}`);
      setLoading(false);
      return;
    }

    // Belege hochladen (optional – Fehler blockieren nicht die Navigation)
    if (selectedFiles.length > 0) {
      const { data: { user } } = await supabase.auth.getUser();
      for (const file of selectedFiles) {
        const ext         = file.name.split('.').pop() ?? 'bin';
        const storagePath = `${clientId}/${newTx.id}/${Date.now()}.${ext}`;

        const { error: storageErr } = await supabase.storage
          .from('belege')
          .upload(storagePath, file, { upsert: false });

        if (!storageErr) {
          await supabase.from('attachments').insert({
            transaction_id: newTx.id,
            client_id:      clientId,
            file_name:      file.name,
            storage_path:   storagePath,
            mime_type:      file.type,
            file_size:      file.size,
            uploaded_by:    user?.id,
          });
        }
      }
    }

    router.push('/buchungen');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">

      {/* Modus-Hinweis */}
      <div className={`text-xs px-3 py-2 rounded-lg font-medium ${isBrutto ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
        {isBrutto ? '🧾 Brutto-Modus: Rechnungsbetrag eingeben' : '📥 Netto-Modus: Nettobetrag eingeben'}
        <span className="ml-2 font-normal opacity-70">· in Einstellungen änderbar</span>
      </div>

      {/* Typ */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Art der Buchung</label>
        <div className="flex gap-3">
          {(['income', 'expense'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 transition-colors ${
                type === t
                  ? t === 'income' ? 'bg-[#00897B] text-white border-[#00897B]' : 'bg-[#C62828] text-white border-[#C62828]'
                  : t === 'income' ? 'bg-white text-gray-600 border-gray-200 hover:border-[#00897B]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#C62828]'
              }`}
            >
              {t === 'income' ? '↑ Einnahme' : '↓ Ausgabe'}
            </button>
          ))}
        </div>
      </div>

      {/* Datum */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Buchungsdatum</label>
        <input type="date" required value={bookingDate} onChange={e => setBookingDate(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" />
      </div>

      {/* Kategorie */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Kategorie</label>
        <select required value={categoryId} onChange={e => setCategoryId(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]">
          {filteredCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Betrag */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{isBrutto ? 'Brutto (€)' : 'Netto (€)'}</label>
          <input type="number" required min="0.01" step="0.01" placeholder="0,00" value={amount}
            onChange={e => setAmount(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">USt %</label>
          <select value={vatRate} onChange={e => setVatRate(Number(e.target.value))} disabled={isEAuto}
            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B] disabled:bg-gray-100 disabled:cursor-not-allowed">
            <option value={0}>0 %</option>
            <option value={10}>10 %</option>
            <option value={13}>13 %</option>
            <option value={20}>20 %</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{isBrutto ? 'Netto (€)' : 'Brutto (€)'}</label>
          <div className="w-full border border-gray-200 bg-gray-50 rounded-lg px-4 py-2.5 text-sm text-gray-700 font-medium">
            {isBrutto ? displayNet : displayGross}
          </div>
        </div>
      </div>

      {vatAmt > 0 && !isEAuto && (
        <p className="text-xs text-gray-500">
          USt-Betrag: <span className="font-medium">€ {displayVat}</span>
          {isBrutto && <span className="ml-3">Netto: <span className="font-medium">€ {displayNet}</span></span>}
        </p>
      )}

      {/* E-Auto Toggle */}
      {type === 'expense' && (
        <button type="button" onClick={() => setIsEAuto(v => !v)}
          className={`flex items-center gap-2.5 text-sm font-medium px-4 py-2.5 rounded-xl border-2 transition-all w-full ${
            isEAuto ? 'bg-blue-50 border-blue-400 text-blue-800' : 'bg-white border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-700'
          }`}>
          <span className="text-lg">🔋</span>
          <span className="flex-1 text-left">Elektroauto-Anschaffung (Vorsteuer-Sonderregelung)</span>
          <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs ${isEAuto ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-300'}`}>
            {isEAuto ? '✓' : ''}
          </span>
        </button>
      )}

      {/* E-Auto Berechnung */}
      {isEAuto && netNum > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-blue-800 text-sm">Vorsteuerberechnung E-Auto</span>
            <span className="text-blue-400 text-xs">§ 12 Abs. 2 Z 2 lit. b UStG</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-white rounded-lg px-3 py-2">
              <p className="text-xs text-gray-500">Kaufpreis netto</p>
              <p className="font-bold text-gray-800">{eur(netNum)}</p>
            </div>
            <div className="bg-white rounded-lg px-3 py-2">
              <p className="text-xs text-gray-500">Anschaffungshöchstgrenze</p>
              <p className="font-bold text-gray-800">{eur(EAUTO_HOECHSTGRENZE)}</p>
            </div>
            <div className={`rounded-lg px-3 py-2 ${eAutoUeberschreitung ? 'bg-amber-100' : 'bg-white'}`}>
              <p className="text-xs text-gray-500">Abzugsfähiger Nettobetrag</p>
              <p className="font-bold text-gray-800">{eur(eAutoAbzugsfaehigNetto)}</p>
            </div>
            <div className="bg-white rounded-lg px-3 py-2">
              <p className="text-xs text-gray-500">USt gesamt (20 %)</p>
              <p className="font-semibold text-gray-700">{eur(eAutoVstGesamt)}</p>
            </div>
          </div>
          <div className="border-t border-blue-200 pt-3 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-green-700 font-medium">✓ Abzugsfähige Vorsteuer</span>
              <span className="font-bold text-green-700">{eur(eAutoVstAbzugsfaehig)}</span>
            </div>
            {eAutoUeberschreitung && (
              <div className="flex justify-between text-sm">
                <span className="text-amber-700">✗ Nicht abzugsfähige VSt (Luxuslimit)</span>
                <span className="font-semibold text-amber-700">{eur(eAutoVstNichtAbzugsfaehig)}</span>
              </div>
            )}
          </div>
          {eAutoUeberschreitung ? (
            <p className="text-xs text-blue-700 bg-blue-100 rounded-lg px-3 py-2 leading-relaxed">
              Der Kaufpreis überschreitet die Anschaffungshöchstgrenze von € 40.000 netto.
              Gespeichert wird nur die abzugsfähige Vorsteuer von <strong>{eur(eAutoVstAbzugsfaehig)}</strong>.
            </p>
          ) : (
            <p className="text-xs text-blue-700">
              Kaufpreis innerhalb der Höchstgrenze – volle Vorsteuer von <strong>{eur(eAutoVstAbzugsfaehig)}</strong> abzugsfähig.
            </p>
          )}
        </div>
      )}

      {/* Beschreibung */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Beschreibung <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input type="text" placeholder="z.B. Büromaterial Dezember, Rechnung Nr. 2024-001 …"
          value={description} onChange={e => setDescription(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" />
      </div>

      {/* Belege (optional) */}
      <div className="border border-gray-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">
            📎 Beleg anhängen
            <span className="ml-1.5 text-xs text-gray-400 font-normal">(optional · PDF, JPG, PNG · max. {MAX_SIZE_MB} MB)</span>
          </span>
          <button type="button" onClick={() => fileInputRef.current?.click()}
            className="text-xs text-[#1B3A6B] hover:text-[#1565C0] font-medium border border-[#1B3A6B] hover:border-[#1565C0] px-3 py-1 rounded-lg transition-colors">
            + Datei wählen
          </button>
          <input ref={fileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={e => addFiles(e.target.files)} className="hidden" />
        </div>

        {selectedFiles.length > 0 && (
          <ul className="space-y-1.5">
            {selectedFiles.map((f, idx) => (
              <li key={idx} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 text-sm">
                <span>{f.name.endsWith('.pdf') ? '📄' : '🖼️'}</span>
                <span className="flex-1 truncate text-gray-700">{f.name}</span>
                <span className="text-xs text-gray-400 flex-shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                <button type="button" onClick={() => removeFile(idx)}
                  className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0">✕</button>
              </li>
            ))}
          </ul>
        )}

        {fileError && <p className="text-red-600 text-xs">{fileError}</p>}
      </div>

      {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      {/* Buttons */}
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={() => router.back()}
          className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors">
          Abbrechen
        </button>
        <button type="submit" disabled={loading}
          className={`flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50 ${
            type === 'income' ? 'bg-[#00897B] hover:bg-[#00796B]' : 'bg-[#C62828] hover:bg-[#B71C1C]'
          }`}>
          {loading
            ? (selectedFiles.length > 0 ? 'Speichern & Hochladen…' : 'Speichern…')
            : type === 'income' ? '↑ Einnahme speichern' : '↓ Ausgabe speichern'
          }
        </button>
      </div>
    </form>
  );
}
