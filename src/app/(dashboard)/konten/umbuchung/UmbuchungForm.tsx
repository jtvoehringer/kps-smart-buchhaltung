'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { heute, meldeFehler } from '@/lib/fehler';
import { ArrowDown } from 'lucide-react';

type Konto = { id: string; name: string; type: string };

const TYPE_LABELS: Record<string, string> = {
  kontokorrent: 'Kontokorrent',
  kreditkarte:  'Kreditkarte',
  kreditkonto:  'Kreditkonto',
};

export default function UmbuchungForm({
  clientId,
  accounts,
}: {
  clientId: string;
  accounts: Konto[];
}) {
  const router = useRouter();
  const supabase = createClient();

  // Typischer Fall vorbelegt: vom Girokonto (Kontokorrent) auf die Kreditkarte
  const giro = accounts.find(a => a.type === 'kontokorrent') ?? accounts[0];
  const kk   = accounts.find(a => a.id !== giro.id && a.type === 'kreditkarte')
            ?? accounts.find(a => a.id !== giro.id)!;

  const [fromId, setFromId]   = useState(giro.id);
  const [toId, setToId]       = useState(kk.id);
  const [datum, setDatum]     = useState(heute());
  const [betrag, setBetrag]   = useState('');
  const [text, setText]       = useState('');
  const [saving, setSaving]   = useState(false);
  const [fehler, setFehler]   = useState('');

  const kontoName = (id: string) => accounts.find(a => a.id === id)?.name ?? '';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFehler('');

    // Beträge kommen mit Komma („1.234,56") oder Punkt („1250.50") –
    // beides zulassen: mit Komma sind Punkte Tausendertrenner.
    const norm = betrag.includes(',')
      ? betrag.replace(/\./g, '').replace(',', '.')
      : betrag;
    const amount = Number(norm.trim());
    if (!Number.isFinite(amount) || amount <= 0) {
      setFehler('Bitte einen Betrag größer als 0 angeben.');
      return;
    }
    if (fromId === toId) {
      setFehler('Quelle und Ziel müssen verschiedene Konten sein.');
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('account_transfers').insert({
      client_id:       clientId,
      from_account_id: fromId,
      to_account_id:   toId,
      transfer_date:   datum,
      amount,
      description:     text.trim() || null,
    });
    if (!meldeFehler('Umbuchung speichern', error, setFehler)) {
      // Direkt in die Abstimmung des Quellkontos – dort taucht die
      // Umbuchung als Minus auf und kann gleich abgehakt werden.
      router.push(`/konten/${fromId}/abstimmung`);
      router.refresh();
      return;
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="card p-6 space-y-4">
        <p className="text-sm text-ink-2 leading-relaxed">
          Eine Umbuchung verschiebt Geld zwischen zwei eigenen Konten –
          zum Beispiel den monatlichen Ausgleich des Kreditkartensaldos vom
          Girokonto. Sie ist <strong>keine Ausgabe</strong> und zählt daher
          weder in der UVA noch in der Einnahmen-Ausgaben-Rechnung noch im
          BMD-Export. Sichtbar wird sie in der Kontoabstimmung beider Konten.
        </p>

        {fehler && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
            {fehler}
          </p>
        )}

        <div>
          <label htmlFor="umb-von" className="block text-sm font-medium text-ink mb-1">
            Von Konto <span className="text-ink-3 font-normal">(wird belastet)</span>
          </label>
          <select
            id="umb-von"
            value={fromId}
            onChange={e => {
              const v = e.target.value;
              setFromId(v);
              // Ziel darf nie gleich der Quelle sein
              if (toId === v) setToId(accounts.find(a => a.id !== v)!.id);
            }}
            className="w-full border border-line-2 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30"
          >
            {accounts.map(a => (
              <option key={a.id} value={a.id}>
                {a.name} ({TYPE_LABELS[a.type] ?? a.type})
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-center text-ink-3">
          <ArrowDown size={18} strokeWidth={2} />
        </div>

        <div>
          <label htmlFor="umb-nach" className="block text-sm font-medium text-ink mb-1">
            Auf Konto <span className="text-ink-3 font-normal">(erhält den Betrag)</span>
          </label>
          <select
            id="umb-nach"
            value={toId}
            onChange={e => setToId(e.target.value)}
            className="w-full border border-line-2 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30"
          >
            {accounts.filter(a => a.id !== fromId).map(a => (
              <option key={a.id} value={a.id}>
                {a.name} ({TYPE_LABELS[a.type] ?? a.type})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="umb-datum" className="block text-sm font-medium text-ink mb-1">Datum</label>
            <input
              id="umb-datum"
              type="date"
              value={datum}
              onChange={e => setDatum(e.target.value)}
              required
              className="w-full border border-line-2 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30"
            />
          </div>
          <div>
            <label htmlFor="umb-betrag" className="block text-sm font-medium text-ink mb-1">Betrag (€)</label>
            <input
              id="umb-betrag"
              type="text"
              inputMode="decimal"
              value={betrag}
              onChange={e => setBetrag(e.target.value)}
              placeholder="z. B. 1.250,00"
              required
              className="w-full border border-line-2 rounded-lg px-3 py-2 text-sm text-right num focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30"
            />
          </div>
        </div>

        <div>
          <label htmlFor="umb-text" className="block text-sm font-medium text-ink mb-1">
            Beschreibung <span className="text-ink-3 font-normal">(optional)</span>
          </label>
          <input
            id="umb-text"
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="z. B. Kreditkartenabrechnung Juli"
            className="w-full border border-line-2 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => router.push('/konten')}
          className="px-4 py-2.5 text-sm border border-line-2 text-ink-2 rounded-xl hover:bg-row transition-colors font-medium"
        >
          Abbrechen
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2.5 text-sm bg-navy text-white rounded-xl hover:bg-navy-2 transition-colors font-semibold disabled:opacity-50"
        >
          {saving ? 'Wird gespeichert…' : `Umbuchen: ${kontoName(fromId)} → ${kontoName(toId)}`}
        </button>
      </div>
    </form>
  );
}
