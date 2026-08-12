'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { parseBetrag } from '@/lib/parsers/betrag';

type AccountType = 'kontokorrent' | 'kreditkarte' | 'kreditkonto';

type AccountInput = {
  id?: string;
  name: string;
  type: AccountType;
  iban: string;
  note: string;
  openingBalance: string;
  openingDate: string;
};

const EMPTY: AccountInput = {
  name: '', type: 'kontokorrent', iban: '', note: '',
  openingBalance: '', openingDate: '',
};

const TYPE_LABELS: Record<AccountType, string> = {
  kontokorrent: 'Kontokorrent (Girokonto)',
  kreditkarte:  'Kreditkarte',
  kreditkonto:  'Kreditkonto (Darlehen)',
};

export default function KontoForm({
  clientId,
  initial,
}: {
  clientId: string;
  initial?: AccountInput;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [form, setForm] = useState<AccountInput>(initial ?? EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function set<K extends keyof AccountInput>(field: K, value: AccountInput[K]) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Bezeichnung ist ein Pflichtfeld.'); return; }
    setLoading(true);
    setError('');

    const payload = {
      client_id: clientId,
      name:      form.name.trim(),
      type:      form.type,
      iban:      form.iban.trim() || null,
      note:      form.note.trim() || null,
      opening_balance: parseBetrag(form.openingBalance) ?? 0,
      opening_date:    form.openingDate || null,
    };

    let err;
    if (form.id) {
      ({ error: err } = await supabase.from('accounts').update(payload).eq('id', form.id));
    } else {
      ({ error: err } = await supabase.from('accounts').insert(payload));
    }

    if (err) {
      setError(err.message);
    } else {
      router.push('/konten');
      router.refresh();
    }
    setLoading(false);
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand';

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
        <h2 className="font-semibold text-gray-800">Kontodaten</h2>

        <div>
          <label htmlFor="kontoForm-0" className="text-xs font-medium text-gray-500 block mb-1">Bezeichnung <span className="text-red-400">*</span></label>
          <input id="kontoForm-0" type="text" placeholder="z.B. Firmenkonto Erste Bank" value={form.name}
            onChange={e => set('name', e.target.value)} className={inputCls} required />
        </div>

        <div>
          <label htmlFor="kontoForm-1" className="text-xs font-medium text-gray-500 block mb-1">Kontoart <span className="text-red-400">*</span></label>
          <select id="kontoForm-1" value={form.type} onChange={e => set('type', e.target.value as AccountType)} className={inputCls}>
            {(Object.keys(TYPE_LABELS) as AccountType[]).map(t => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="kontoForm-2" className="text-xs font-medium text-gray-500 block mb-1">IBAN (optional)</label>
          <input id="kontoForm-2" type="text" placeholder="AT00 0000 0000 0000 0000" value={form.iban}
            onChange={e => set('iban', e.target.value)} className={inputCls} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-800">Eröffnungssaldo</h2>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            Der Stand laut Kontoauszug an dem Tag, ab dem Sie hier buchen. Ohne
            diese Angabe beginnt die Kontoabstimmung bei null und lässt sich nie
            mit der Bank zur Deckung bringen. Bei Kreditkarten und Kreditkonten
            ist der Wert üblicherweise negativ.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="kontoForm-3" className="text-xs font-medium text-gray-500 block mb-1">Stichtag</label>
            <input id="kontoForm-3" type="date" value={form.openingDate}
              onChange={e => set('openingDate', e.target.value)} className={inputCls} />
            <p className="text-[11px] text-gray-400 mt-1">
              Buchungen bis einschließlich dieses Tages gelten als im Saldo enthalten.
            </p>
          </div>
          <div>
            <label htmlFor="kontoForm-4" className="text-xs font-medium text-gray-500 block mb-1">Saldo am Stichtag</label>
            <input id="kontoForm-4" type="text" inputMode="decimal" placeholder="z.B. 1.234,56 oder -890,00"
              value={form.openingBalance}
              onChange={e => set('openingBalance', e.target.value)} className={inputCls} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-3">Notiz (intern)</h2>
        <textarea rows={3} placeholder="Interne Anmerkungen…" value={form.note}
          onChange={e => set('note', e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none" />
      </div>

      {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => router.push('/konten')}
          className="flex-1 py-3 rounded-xl border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Abbrechen
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 py-3 rounded-xl bg-brand hover:bg-accent text-white text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {loading ? 'Speichern…' : form.id ? 'Änderungen speichern' : 'Konto anlegen'}
        </button>
      </div>
    </form>
  );
}
