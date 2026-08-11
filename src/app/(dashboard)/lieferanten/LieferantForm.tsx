'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type SupplierInput = {
  id?: string;
  name: string;
  contact_person: string;
  street: string;
  zip: string;
  city: string;
  country: string;
  email: string;
  phone: string;
  uid_number: string;
  iban: string;
  notes: string;
};

const EMPTY: SupplierInput = {
  name: '', contact_person: '', street: '', zip: '', city: '',
  country: 'Österreich', email: '', phone: '', uid_number: '', iban: '', notes: '',
};

export default function LieferantForm({
  clientId,
  initial,
}: {
  clientId: string;
  initial?: SupplierInput;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [form, setForm] = useState<SupplierInput>(initial ?? EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function set(field: keyof SupplierInput, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Bezeichnung ist ein Pflichtfeld.'); return; }
    setLoading(true);
    setError('');

    const payload = {
      client_id:    clientId,
      name:         form.name.trim(),
      contact_person: form.contact_person.trim() || null,
      street:       form.street.trim()        || null,
      zip:          form.zip.trim()           || null,
      city:         form.city.trim()          || null,
      country:      form.country.trim()       || 'Österreich',
      email:        form.email.trim()         || null,
      phone:        form.phone.trim()         || null,
      uid_number:   form.uid_number.trim()    || null,
      iban:         form.iban.trim()          || null,
      notes:        form.notes.trim()         || null,
    };

    let err;
    if (form.id) {
      ({ error: err } = await supabase.from('suppliers').update(payload).eq('id', form.id));
    } else {
      ({ error: err } = await supabase.from('suppliers').insert(payload));
    }

    if (err) {
      setError(err.message);
    } else {
      router.push('/lieferanten');
      router.refresh();
    }
    setLoading(false);
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E]';

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl">

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
        <h2 className="font-semibold text-gray-800">Stammdaten</h2>

        <div>
          <label htmlFor="lieferantForm-0" className="text-xs font-medium text-gray-500 block mb-1">Bezeichnung <span className="text-red-400">*</span></label>
          <input id="lieferantForm-0" type="text" placeholder="Musterfirma GmbH – oder Vorname Nachname" value={form.name}
            onChange={e => set('name', e.target.value)} className={inputCls} required />
          <p className="text-xs text-gray-400 mt-1">Erscheint als Rechnungsempfänger.</p>
        </div>

        <div>
          <label htmlFor="lieferantForm-1" className="text-xs font-medium text-gray-500 block mb-1">Kontakt (optional)</label>
          <input id="lieferantForm-1" type="text" placeholder="Fr./Hrn. Vorname Nachname" value={form.contact_person}
            onChange={e => set('contact_person', e.target.value)} className={inputCls} />
        </div>

        <div>
          <label htmlFor="lieferantForm-2" className="text-xs font-medium text-gray-500 block mb-1">UID-Nummer (optional)</label>
          <input id="lieferantForm-2" type="text" placeholder="ATU12345678" value={form.uid_number}
            onChange={e => set('uid_number', e.target.value)} className={inputCls} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
        <h2 className="font-semibold text-gray-800">Adresse</h2>

        <input type="text" placeholder="Straße und Hausnummer" value={form.street}
          onChange={e => set('street', e.target.value)} className={inputCls} />

        <div className="flex gap-3">
          <input type="text" placeholder="PLZ" value={form.zip}
            onChange={e => set('zip', e.target.value)}
            className="w-28 border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E]" />
          <input type="text" placeholder="Ort" value={form.city}
            onChange={e => set('city', e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E]" />
        </div>

        <input type="text" placeholder="Land" value={form.country}
          onChange={e => set('country', e.target.value)} className={inputCls} />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
        <h2 className="font-semibold text-gray-800">Kontakt &amp; Zahlung</h2>

        <div className="flex gap-3">
          <div className="flex-1">
            <label htmlFor="lieferantForm-3" className="text-xs font-medium text-gray-500 block mb-1">E-Mail</label>
            <input id="lieferantForm-3" type="email" placeholder="office@beispiel.at" value={form.email}
              onChange={e => set('email', e.target.value)} className={inputCls} />
          </div>
          <div className="flex-1">
            <label htmlFor="lieferantForm-4" className="text-xs font-medium text-gray-500 block mb-1">Telefon</label>
            <input id="lieferantForm-4" type="tel" placeholder="+43 1 234 567" value={form.phone}
              onChange={e => set('phone', e.target.value)} className={inputCls} />
          </div>
        </div>

        <div>
          <label htmlFor="lieferantForm-5" className="text-xs font-medium text-gray-500 block mb-1">IBAN (optional)</label>
          <input id="lieferantForm-5" type="text" placeholder="AT…" value={form.iban}
            onChange={e => set('iban', e.target.value)} className={inputCls} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-3">Notiz (intern)</h2>
        <textarea rows={3} placeholder="Interne Anmerkungen…" value={form.notes}
          onChange={e => set('notes', e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E] resize-none" />
      </div>

      {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => router.push('/lieferanten')}
          className="flex-1 py-3 rounded-xl border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Abbrechen
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 py-3 rounded-xl bg-[#35609E] hover:bg-[#4F90E8] text-white text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {loading ? 'Speichern…' : form.id ? 'Änderungen speichern' : 'Lieferanten anlegen'}
        </button>
      </div>
    </form>
  );
}
