'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { alsDatum } from '@/lib/fehler';

type Category = { id: string; name: string; type: string; vat_rate: number };

const INTERVAL_OPTIONS = [
  { value: 'monthly',     label: 'Monatlich' },
  { value: 'quarterly',   label: 'Vierteljährlich' },
  { value: 'semi-annual', label: 'Halbjährlich' },
  { value: 'annual',      label: 'Jährlich' },
];

export default function DauerauftragForm({
  clientId,
  bookingMode,
  categories,
}: {
  clientId: string;
  bookingMode: string;
  categories: Category[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const isBrutto = bookingMode === 'brutto';

  // Standardmäßig nächster Monatserster
  const firstOfNextMonth = (() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    return alsDatum(d);
  })();

  const [type, setType]             = useState<'income' | 'expense'>('expense');
  const [name, setName]             = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount]         = useState('');
  const [vatRate, setVatRate]       = useState(20);
  const [interval, setInterval]     = useState('monthly');
  const [nextRunDate, setNextRunDate] = useState(firstOfNextMonth);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  const filteredCategories = categories.filter(c => c.type === type);

  useEffect(() => {
    const first = categories.find(c => c.type === type);
    if (first) {
      setCategoryId(first.id);
      setVatRate(first.vat_rate);
    }
  }, [type, categories]);

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
    if (!name.trim()) { setError('Bitte einen Namen eingeben.'); return; }
    if (!amount || parseFloat(amount) <= 0) { setError('Bitte einen gültigen Betrag eingeben.'); return; }
    if (!nextRunDate) { setError('Bitte ein Datum für die erste Ausführung wählen.'); return; }

    const dayOfMonth = new Date(nextRunDate).getDate();
    if (dayOfMonth > 28) {
      setError('Bitte einen Tag zwischen 1 und 28 wählen, damit alle Monate abgedeckt sind.');
      return;
    }

    setLoading(true);
    setError('');

    const { error: insertError } = await supabase
      .from('recurring_transactions')
      .insert({
        client_id:    clientId,
        category_id:  categoryId,
        name:         name.trim(),
        type,
        amount_net:   Math.round(netNum * 100) / 100,
        vat_rate:     vatRate as 0 | 10 | 13 | 20,
        interval:     interval as 'monthly' | 'quarterly' | 'semi-annual' | 'annual',
        day_of_month: dayOfMonth,
        next_run_date: nextRunDate,
        is_active:    true,
      });

    if (insertError) {
      setError('Fehler: ' + insertError.message);
      setLoading(false);
    } else {
      router.push('/dauerauftraege');
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">

      {/* Modus-Hinweis */}
      <div className={`text-xs px-3 py-2 rounded-lg font-medium ${isBrutto ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
        {isBrutto ? 'Brutto-Modus' : 'Netto-Modus'}
        <span className="ml-2 font-normal opacity-70">· in Einstellungen änderbar</span>
      </div>

      {/* Name */}
      <div>
        <label htmlFor="dauerauftragForm-0" className="block text-sm font-medium text-gray-700 mb-1">
          Bezeichnung <span className="text-red-400">*</span>
        </label>
        <input id="dauerauftragForm-0"
          type="text"
          required
          placeholder="z.B. Büromiete, Steuerberater-Honorar …"
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      {/* Typ */}
      <div>
        <span id="gruppe-buchungsart" className="block text-sm font-medium text-gray-700 mb-2">Art der Buchung</span>
        <div role="group" aria-labelledby="gruppe-buchungsart" className="flex gap-3">
          <button
            type="button"
            onClick={() => setType('income')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 transition-colors ${
              type === 'income'
                ? 'bg-income text-white border-income'
                : 'bg-white text-gray-600 border-gray-200 hover:border-income'
            }`}
          >
            ↑ Einnahme
          </button>
          <button
            type="button"
            onClick={() => setType('expense')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 transition-colors ${
              type === 'expense'
                ? 'bg-expense text-white border-expense'
                : 'bg-white text-gray-600 border-gray-200 hover:border-expense'
            }`}
          >
            ↓ Ausgabe
          </button>
        </div>
      </div>

      {/* Kategorie */}
      <div>
        <label htmlFor="dauerauftragForm-1" className="block text-sm font-medium text-gray-700 mb-1">Kategorie</label>
        <select id="dauerauftragForm-1"
          required
          value={categoryId}
          onChange={e => setCategoryId(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        >
          {filteredCategories.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Betrag */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label htmlFor="dauerauftragForm-2" className="block text-sm font-medium text-gray-700 mb-1">
            {isBrutto ? 'Brutto (€)' : 'Netto (€)'}
          </label>
          <input id="dauerauftragForm-2"
            type="number"
            required
            min="0.01"
            step="0.01"
            placeholder="0,00"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
        <div>
          <label htmlFor="dauerauftragForm-3" className="block text-sm font-medium text-gray-700 mb-1">USt %</label>
          <select id="dauerauftragForm-3"
            value={vatRate}
            onChange={e => setVatRate(Number(e.target.value))}
            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          >
            {[0, 10, 13, 20].map(r => <option key={r} value={r}>{r} %</option>)}
          </select>
        </div>
        <div>
          <p className="block text-sm font-medium text-gray-700 mb-1">
            {isBrutto ? 'Netto (€)' : 'Brutto (€)'}
          </p>
          <div className="w-full border border-gray-200 bg-gray-50 rounded-lg px-4 py-2.5 text-sm text-gray-700 font-medium">
            {inputNum > 0 ? (isBrutto ? netNum.toFixed(2) : grossNum.toFixed(2)) : '—'}
          </div>
        </div>
      </div>

      {vatAmt > 0 && (
        <p className="text-xs text-gray-500">
          USt-Betrag: <span className="font-medium">€ {vatAmt.toFixed(2)}</span>
        </p>
      )}

      {/* Intervall */}
      <div>
        <span id="gruppe-intervall" className="block text-sm font-medium text-gray-700 mb-2">Wiederholungsintervall</span>
        <div role="group" aria-labelledby="gruppe-intervall" className="grid grid-cols-2 gap-2">
          {INTERVAL_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setInterval(opt.value)}
              className={`py-2.5 rounded-lg text-sm font-medium border-2 transition-colors ${
                interval === opt.value
                  ? 'bg-brand text-white border-brand'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-brand/40'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Erste Ausführung */}
      <div>
        <label htmlFor="dauerauftragForm-4" className="block text-sm font-medium text-gray-700 mb-1">
          Erste Ausführung
        </label>
        <input id="dauerauftragForm-4"
          type="date"
          required
          value={nextRunDate}
          onChange={e => setNextRunDate(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <p className="text-xs text-gray-400 mt-1">
          Der Tag des Monats ({nextRunDate ? new Date(nextRunDate).getDate() : '—'}) wird als Fälligkeitstag verwendet. Bitte Tag 1–28 wählen.
        </p>
      </div>

      {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.push('/dauerauftraege')}
          className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Abbrechen
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-brand hover:bg-[#152d54] transition-colors disabled:opacity-50"
        >
          {loading ? 'Speichern…' : 'Dauerauftrag anlegen'}
        </button>
      </div>
    </form>
  );
}
