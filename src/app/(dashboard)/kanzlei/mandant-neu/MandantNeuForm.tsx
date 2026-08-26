'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createMandant } from './actions';

export default function MandantNeuForm({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const formData = new FormData(e.currentTarget);
    const result = await createMandant(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
    // Bei Erfolg: redirect passiert in der Server Action
  }

  return (
    <form onSubmit={handleSubmit} className="card p-6 space-y-5">

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label htmlFor="mandantNeuForm-0" className="block text-sm font-medium text-ink mb-1">
            Firmenname / Name <span className="text-red-400">*</span>
          </label>
          <input id="mandantNeuForm-0" name="company_name" type="text" required placeholder="Mustermann GmbH"
            className="w-full border border-line-2 rounded-lg px-4 py-2.5 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30" />
        </div>

        <div>
          <label htmlFor="mandantNeuForm-1" className="block text-sm font-medium text-ink mb-1">
            E-Mail <span className="text-red-400">*</span>
          </label>
          <input id="mandantNeuForm-1" name="email" type="email" required placeholder="max@mustermann.at"
            className="w-full border border-line-2 rounded-lg px-4 py-2.5 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30" />
        </div>

        <div>
          <label htmlFor="mandantNeuForm-2" className="block text-sm font-medium text-ink mb-1">Ansprechperson</label>
          <input id="mandantNeuForm-2" name="full_name" type="text" placeholder="Max Mustermann"
            className="w-full border border-line-2 rounded-lg px-4 py-2.5 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30" />
        </div>

        <div>
          <label htmlFor="mandantNeuForm-3" className="block text-sm font-medium text-ink mb-1">UID-Nummer</label>
          <input id="mandantNeuForm-3" name="uid_number" type="text" placeholder="ATU12345678"
            className="w-full border border-line-2 rounded-lg px-4 py-2.5 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30" />
        </div>

        <div>
          <label htmlFor="mandantNeuForm-4" className="block text-sm font-medium text-ink mb-1">UVA-Zeitraum</label>
          <select id="mandantNeuForm-4" name="vat_period"
            className="w-full border border-line-2 rounded-lg px-4 py-2.5 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30">
            <option value="quarterly">Vierteljährlich</option>
            <option value="monthly">Monatlich</option>
          </select>
        </div>
      </div>

      <div className="bg-blue-50 text-blue-700 text-sm px-4 py-3 rounded-lg">
        Der Mandant erhält eine Einladungs-E-Mail und kann sich damit ein Passwort setzen.
      </div>

      {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={() => router.push('/kanzlei')}
          className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-line-2 text-ink-2 hover:bg-row transition-colors">
          Abbrechen
        </button>
        <button type="submit" disabled={loading}
          className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-navy hover:bg-navy-2 transition-colors disabled:opacity-50">
          {loading ? 'Anlegen…' : 'Mandant anlegen & einladen'}
        </button>
      </div>
    </form>
  );
}
