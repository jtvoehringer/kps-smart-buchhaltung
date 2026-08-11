'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { heute, alsDatum } from '@/lib/fehler';
import { Plus, Paperclip, Loader2 } from 'lucide-react';

type Category = { id: string; name: string; type: string; vat_rate: number };
type Supplier = { id: string; name: string; contact_person: string | null };

const VAT_RATES = [0, 10, 13, 20];
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_SIZE_MB = 10;

function todayIso() { return heute(); }
function defaultDueDate() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return alsDatum(d);
}

export default function NeueEingangsrechnungForm({
  clientId, categories, suppliers,
}: {
  clientId: string;
  categories: Category[];
  suppliers: Supplier[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [vendorName, setVendorName] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState(defaultDueDate());
  const [amountNet, setAmountNet] = useState('');
  const [vatRate, setVatRate] = useState(20);
  const [categoryId, setCategoryId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function resetForm() {
    setVendorName(''); setSupplierId(''); setInvoiceNumber(''); setInvoiceDate(todayIso()); setDueDate(defaultDueDate());
    setAmountNet(''); setVatRate(20); setCategoryId(''); setFile(null); setFileError(''); setError('');
  }

  function handleSupplierSelect(id: string) {
    setSupplierId(id);
    if (id) {
      const s = suppliers.find(s => s.id === id);
      if (s) setVendorName(s.name);
    }
  }

  function handleFileChange(files: FileList | null) {
    setFileError('');
    const f = files?.[0];
    if (!f) { setFile(null); return; }
    if (!ALLOWED_TYPES.includes(f.type)) {
      setFileError('Nur PDF, JPG, PNG und WebP erlaubt.');
      return;
    }
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      setFileError(`Datei zu groß (max. ${MAX_SIZE_MB} MB).`);
      return;
    }
    setFile(f);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const net = parseFloat(amountNet);
    if (!vendorName.trim()) { setError('Bitte einen Lieferanten angeben.'); return; }
    if (!net || net <= 0) { setError('Bitte einen gültigen Nettobetrag eingeben.'); return; }
    if (!dueDate) { setError('Bitte eine Fälligkeit angeben.'); return; }

    setSaving(true);
    setError('');

    let belegStoragePath: string | null = null;
    let belegFileName: string | null = null;
    let belegMimeType: string | null = null;
    let belegFileSize: number | null = null;

    if (file) {
      const ext = file.name.split('.').pop() ?? 'bin';
      const path = `${clientId}/eingangsrechnungen/${crypto.randomUUID()}.${ext}`;
      const { error: storageError } = await supabase.storage.from('belege').upload(path, file, { upsert: false });
      if (storageError) {
        setError(`Beleg-Upload fehlgeschlagen: ${storageError.message}`);
        setSaving(false);
        return;
      }
      belegStoragePath = path;
      belegFileName = file.name;
      belegMimeType = file.type;
      belegFileSize = file.size;
    }

    const vatAmount = Math.round(net * (vatRate / 100) * 100) / 100;

    const { error: insertError } = await supabase.from('incoming_invoices').insert({
      client_id:          clientId,
      category_id:        categoryId || null,
      supplier_id:        supplierId || null,
      vendor_name:        vendorName.trim(),
      invoice_number:     invoiceNumber.trim() || null,
      invoice_date:       invoiceDate,
      due_date:           dueDate,
      amount_net:         Math.round(net * 100) / 100,
      vat_rate:            vatRate as 0 | 10 | 13 | 20,
      vat_amount:          vatAmount,
      beleg_storage_path:  belegStoragePath,
      beleg_file_name:     belegFileName,
      beleg_mime_type:     belegMimeType,
      beleg_file_size:     belegFileSize,
    });

    if (insertError) {
      setError(`Fehler: ${insertError.message}`);
      setSaving(false);
      return;
    }

    setSaving(false);
    resetForm();
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 bg-expense hover:bg-expense-dark text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
      >
        <Plus size={16} strokeWidth={2} />
        Neue Eingangsrechnung
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm text-gray-700">Neue Eingangsrechnung</h3>
        <button type="button" onClick={() => { setOpen(false); resetForm(); }} className="text-xs text-gray-400 hover:text-gray-600">
          Abbrechen
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="sm:col-span-2">
          <label htmlFor="neueEingangsrechnungForm-0" className="block text-xs font-medium text-gray-600 mb-1">Lieferant</label>
          {suppliers.length > 0 && (
            <select id="neueEingangsrechnungForm-0" value={supplierId} onChange={e => handleSupplierSelect(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-1.5 focus:outline-none focus:ring-2 focus:ring-[#35609E]">
              <option value="">— aus Lieferantenstamm wählen —</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          <input type="text" value={vendorName} onChange={e => { setVendorName(e.target.value); setSupplierId(''); }} placeholder="z. B. Musterfirma GmbH"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E]" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="neueEingangsrechnungForm-1" className="block text-xs font-medium text-gray-600 mb-1">Rechnungsnummer <span className="text-gray-400 font-normal">(optional)</span></label>
          <input id="neueEingangsrechnungForm-1" type="text" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E]" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div>
          <label htmlFor="neueEingangsrechnungForm-2" className="block text-xs font-medium text-gray-600 mb-1">Rechnungsdatum</label>
          <input id="neueEingangsrechnungForm-2" type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E]" />
        </div>
        <div>
          <label htmlFor="neueEingangsrechnungForm-3" className="block text-xs font-medium text-gray-600 mb-1">Fälligkeit</label>
          <input id="neueEingangsrechnungForm-3" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E]" />
        </div>
        <div>
          <label htmlFor="neueEingangsrechnungForm-4" className="block text-xs font-medium text-gray-600 mb-1">Netto (€)</label>
          <input id="neueEingangsrechnungForm-4" type="number" min="0.01" step="0.01" value={amountNet} onChange={e => setAmountNet(e.target.value)} placeholder="0,00"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E]" />
        </div>
        <div>
          <label htmlFor="neueEingangsrechnungForm-5" className="block text-xs font-medium text-gray-600 mb-1">USt %</label>
          <select id="neueEingangsrechnungForm-5" value={vatRate} onChange={e => setVatRate(Number(e.target.value))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E]">
            {VAT_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="neueEingangsrechnungForm-6" className="block text-xs font-medium text-gray-600 mb-1">Kategorie <span className="text-gray-400 font-normal">(optional, Vorbelegung)</span></label>
          <select id="neueEingangsrechnungForm-6" value={categoryId} onChange={e => setCategoryId(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E]">
            <option value="">Bei Zahlung auswählen</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <p className="block text-xs font-medium text-gray-600 mb-1">Beleg <span className="text-gray-400 font-normal">(optional)</span></p>
          <button type="button" onClick={() => fileInput.current?.click()}
            className="w-full inline-flex items-center gap-1.5 justify-center text-xs text-[#35609E] hover:text-[#4F90E8] font-medium border border-[#35609E] hover:border-[#4F90E8] px-3 py-2 rounded-lg transition-colors">
            <Paperclip size={13} strokeWidth={2} />
            {file ? file.name : 'Datei wählen'}
          </button>
          <input ref={fileInput} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e => handleFileChange(e.target.files)} className="hidden" />
          {fileError && <p className="text-red-600 text-xs mt-1">{fileError}</p>}
        </div>
      </div>

      {error && <p className="text-red-600 text-xs bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      <div className="flex justify-end">
        <button type="submit" disabled={saving}
          className="inline-flex items-center gap-1.5 bg-expense hover:bg-expense-dark text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
          {saving ? <Loader2 size={14} strokeWidth={2} className="animate-spin" /> : <Plus size={14} strokeWidth={2} />}
          Erfassen
        </button>
      </div>
    </form>
  );
}
