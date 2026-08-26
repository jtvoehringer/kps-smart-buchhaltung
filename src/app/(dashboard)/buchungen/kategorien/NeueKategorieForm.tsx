'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Plus, ArrowUpCircle, ArrowDownCircle, Loader2 } from 'lucide-react';
import type { TransactionType, VatRate } from '@/lib/supabase/database.types';

const VAT_RATES: VatRate[] = [0, 10, 13, 20];

export default function NeueKategorieForm({ tenantId }: { tenantId: string | null }) {
  const router = useRouter();
  const supabase = createClient();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<TransactionType>('expense');
  const [vatRate, setVatRate] = useState<VatRate>(20);
  const [kontoNr, setKontoNr] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setName('');
    setType('expense');
    setVatRate(20);
    setKontoNr('');
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Bitte einen Namen eingeben.');
      return;
    }
    setSaving(true);
    setError(null);

    const { error: insertError } = await supabase.from('categories').insert({
      tenant_id: tenantId,
      name: name.trim(),
      type,
      vat_rate: vatRate,
      konto_nr: kontoNr.trim() || null,
      is_system: false,
    });

    if (insertError) {
      setError(insertError.message);
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
        className="inline-flex items-center gap-1.5 bg-navy hover:bg-navy-2 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
      >
        <Plus size={16} strokeWidth={2} />
        Neue Kategorie
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="card p-4 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm text-ink">Neue Kategorie</h3>
        <button
          type="button"
          onClick={() => { setOpen(false); resetForm(); }}
          className="text-xs text-ink-3 hover:text-navy"
        >
          Abbrechen
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="sm:col-span-2">
          <label htmlFor="neueKategorieForm-0" className="block text-xs font-medium text-ink-2 mb-1">Name</label>
          <input id="neueKategorieForm-0"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="z. B. Büromaterial"
            className="w-full border border-line-2 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30"
          />
        </div>

        <div>
          <span id="gruppe-kategorietyp" className="block text-xs font-medium text-ink-2 mb-1">Typ</span>
        <div role="group" aria-labelledby="gruppe-kategorietyp" className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setType('income')}
              className={`flex-1 inline-flex items-center justify-center gap-1 px-2 py-2 rounded-lg text-xs font-medium border transition-colors ${
                type === 'income'
                  ? 'bg-income border-income text-white'
                  : 'border-line-2 text-ink-2 hover:bg-row'
              }`}
            >
              <ArrowUpCircle size={13} strokeWidth={2} />
              Einn.
            </button>
            <button
              type="button"
              onClick={() => setType('expense')}
              className={`flex-1 inline-flex items-center justify-center gap-1 px-2 py-2 rounded-lg text-xs font-medium border transition-colors ${
                type === 'expense'
                  ? 'bg-expense border-expense text-white'
                  : 'border-line-2 text-ink-2 hover:bg-row'
              }`}
            >
              <ArrowDownCircle size={13} strokeWidth={2} />
              Ausg.
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="neueKategorieForm-1" className="block text-xs font-medium text-ink-2 mb-1">USt %</label>
          <select id="neueKategorieForm-1"
            value={vatRate}
            onChange={e => setVatRate(Number(e.target.value) as VatRate)}
            className="w-full border border-line-2 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30"
          >
            {VAT_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div>
          <label htmlFor="neueKategorieForm-2" className="block text-xs font-medium text-ink-2 mb-1">Konto-Nr. (optional)</label>
          <input id="neueKategorieForm-2"
            type="text"
            value={kontoNr}
            onChange={e => setKontoNr(e.target.value)}
            placeholder="z. B. 7300"
            className="w-full border border-line-2 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30"
          />
        </div>
      </div>

      {error && <p className="text-xs text-expense">{error}</p>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1.5 bg-navy hover:bg-navy-2 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} strokeWidth={2} className="animate-spin" /> : <Plus size={14} strokeWidth={2} />}
          Speichern
        </button>
      </div>
    </form>
  );
}
