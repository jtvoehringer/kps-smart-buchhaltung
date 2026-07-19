'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import BelegUpload from './BelegUpload';

type Category = { id: string; name: string; type: string; vat_rate: number };
type Transaction = {
  id: string; type: string; amount_net: number; vat_rate: number;
  vat_amount: number; booking_date: string; description: string | null; category_id: string;
};
type Attachment = { id: string; file_name: string; storage_path: string; uploaded_at: string };

export default function BuchungBearbeitenForm({
  transaction, clientId, bookingMode, categories, attachmentsEnabled, attachments,
}: {
  transaction: Transaction;
  clientId: string;
  bookingMode: string;
  categories: Category[];
  attachmentsEnabled: boolean;
  attachments: Attachment[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const isBrutto = bookingMode === 'brutto';

  const initAmount = isBrutto
    ? (transaction.amount_net + transaction.vat_amount).toFixed(2)
    : transaction.amount_net.toFixed(2);

  const [type, setType]               = useState<'income' | 'expense'>(transaction.type as 'income' | 'expense');
  const [categoryId, setCategoryId]   = useState(transaction.category_id);
  const [bookingDate, setBookingDate] = useState(transaction.booking_date);
  const [amount, setAmount]           = useState(initAmount);
  const [vatRate, setVatRate]         = useState(transaction.vat_rate);
  const [description, setDescription] = useState(transaction.description ?? '');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');

  const filteredCategories = categories.filter(c => c.type === type);

  useEffect(() => {
    const cat = categories.find(c => c.id === categoryId);
    if (cat) setVatRate(cat.vat_rate);
  }, [categoryId, categories]);

  const inputNum = parseFloat(amount) || 0;
  const netNum   = isBrutto ? inputNum / (1 + vatRate / 100) : inputNum;
  const grossNum = isBrutto ? inputNum : inputNum * (1 + vatRate / 100);
  const vatAmt   = grossNum - netNum;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) {
      setError('Bitte einen gültigen Betrag eingeben.');
      return;
    }
    setLoading(true);
    setError('');

    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        type,
        category_id:  categoryId,
        amount_net:   Math.round(netNum  * 100) / 100,
        vat_rate:     vatRate as 0 | 10 | 13 | 20,
        vat_amount:   Math.round(vatAmt  * 100) / 100,
        booking_date: bookingDate,
        description:  description || null,
      })
      .eq('id', transaction.id);

    if (updateError) {
      setError(`Fehler: ${updateError.message}`);
      setLoading(false);
    } else {
      router.push('/buchungen');
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">

      <div className={`text-xs px-3 py-2 rounded-lg font-medium ${isBrutto ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
        {isBrutto ? '🧾 Brutto-Modus' : '📥 Netto-Modus'}
        <span className="ml-2 font-normal opacity-70">· in Einstellungen änderbar</span>
      </div>

      {/* Typ */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Art der Buchung</label>
        <div className="flex gap-3">
          {(['income', 'expense'] as const).map(t => (
            <button key={t} type="button" onClick={() => setType(t)}
              style={type === t ? { backgroundColor: t === 'income' ? '#00897B' : '#C62828', color: 'white', borderColor: t === 'income' ? '#00897B' : '#C62828' } : {}}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 transition-colors ${type !== t ? 'bg-white text-gray-600 border-gray-200 hover:border-gray-400' : ''}`}
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
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E]" />
      </div>

      {/* Kategorie */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Kategorie</label>
        <select required value={categoryId} onChange={e => setCategoryId(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E]">
          {filteredCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Betrag */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{isBrutto ? 'Brutto (€)' : 'Netto (€)'}</label>
          <input type="number" required min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E]" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">USt %</label>
          <select value={vatRate} onChange={e => setVatRate(Number(e.target.value))}
            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E]">
            {[0, 10, 13, 20].map(r => <option key={r} value={r}>{r} %</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{isBrutto ? 'Netto (€)' : 'Brutto (€)'}</label>
          <div className="w-full border border-gray-200 bg-gray-50 rounded-lg px-4 py-2.5 text-sm text-gray-700 font-medium">
            {inputNum > 0 ? (isBrutto ? netNum.toFixed(2) : grossNum.toFixed(2)) : '—'}
          </div>
        </div>
      </div>

      {vatAmt > 0 && (
        <p className="text-xs text-gray-500">USt-Betrag: <span className="font-medium">€ {vatAmt.toFixed(2)}</span></p>
      )}

      {/* Beschreibung */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Beschreibung <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input type="text" placeholder="z.B. Rechnung Nr. 2024-001 …" value={description}
          onChange={e => setDescription(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E]" />
      </div>

      {/* Belegverwaltung */}
      {attachmentsEnabled && (
        <div className="border-t border-gray-100 pt-5">
          <BelegUpload
            transactionId={transaction.id}
            clientId={clientId}
            initialAttachments={attachments}
          />
        </div>
      )}

      {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={() => router.push('/buchungen')}
          className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors">
          Abbrechen
        </button>
        <button type="submit" disabled={loading}
          className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-[#35609E] hover:bg-[#4F90E8] transition-colors disabled:opacity-50">
          {loading ? 'Speichern…' : 'Änderungen speichern'}
        </button>
      </div>
    </form>
  );
}
