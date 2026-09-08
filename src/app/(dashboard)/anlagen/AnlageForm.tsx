'use client';

// Anlage erfassen / bearbeiten (Welle 7). Speichert direkt über den
// Supabase-Browser-Client (RLS: eigener Mandant). Zeigt beim Tippen
// schon den AfA-Plan, damit man sieht, was die Eingaben bedeuten.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { parseBetrag } from '@/lib/parsers/betrag';
import { formatCurrency } from '@/lib/utils';
import { afaPlan, type AfaMethode, type Anlage } from '@/lib/anlagen';
import { Button, Note, Td, Th, Tr } from '@/components/ui';

export type BuchungsKandidat = {
  id: string;
  booking_date: string;
  description: string | null;
  amount_net: number;
  kategorie: string;
  beleg_nr: number | null;
};

export type AnlageInput = {
  id?: string;
  transaction_id: string;
  name: string;
  asset_group: string;
  konto_nr: string;
  acquired_on: string;
  cost_net: string;
  useful_life_years: string;
  method: AfaMethode;
  degressive_rate: string;
  residual_value: string;
  disposed_on: string;
  disposal_proceeds: string;
  notes: string;
};

const LEER: AnlageInput = {
  transaction_id: '',
  name: '', asset_group: '', konto_nr: '', acquired_on: new Date().toLocaleDateString('en-CA'),
  cost_net: '', useful_life_years: '3', method: 'linear', degressive_rate: '30', residual_value: '0',
  disposed_on: '', disposal_proceeds: '', notes: '',
};

// Übliche Gruppen mit Konto (EKR Klasse 0) und typischer Nutzungsdauer
const GRUPPEN: { name: string; konto: string; nd: number }[] = [
  { name: 'Betriebs- und Geschäftsausstattung', konto: '0660', nd: 5 },
  { name: 'EDV / Computer',                     konto: '0620', nd: 3 },
  { name: 'Büromöbel',                          konto: '0660', nd: 10 },
  { name: 'Fahrzeuge (PKW)',                    konto: '0630', nd: 8 },
  { name: 'Maschinen und Geräte',               konto: '0400', nd: 5 },
  { name: 'Software / Lizenzen',                konto: '0100', nd: 3 },
  { name: 'Gebäude / Investitionen in Gebäude', konto: '0300', nd: 40 },
];

export default function AnlageForm({
  clientId,
  initial,
  buchungen = [],
}: {
  clientId: string;
  initial?: AnlageInput;
  /** Anschaffungsbuchungen (Kontenklasse 0), die noch keiner – oder dieser – Anlage zugeordnet sind */
  buchungen?: BuchungsKandidat[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [form, setForm] = useState<AnlageInput>(initial ?? LEER);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function set<K extends keyof AnlageInput>(k: K, v: AnlageInput[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }
  // Buchung auswählen: Datum, Kosten und (falls leer) Bezeichnung übernehmen
  function buchungWaehlen(id: string) {
    const b = buchungen.find(x => x.id === id);
    setForm(f => ({
      ...f,
      transaction_id: id,
      ...(b ? {
        acquired_on: b.booking_date,
        cost_net: Number(b.amount_net).toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        name: f.name.trim() ? f.name : (b.description ?? ''),
      } : {}),
    }));
  }
  function gruppeWaehlen(name: string) {
    const g = GRUPPEN.find(x => x.name === name);
    setForm(f => ({ ...f, asset_group: name, konto_nr: g?.konto ?? f.konto_nr, useful_life_years: g ? String(g.nd) : f.useful_life_years }));
  }

  const kosten = parseBetrag(form.cost_net) ?? 0;
  const gwgMoeglich = kosten > 0 && kosten <= 1000;

  const vorschau: Anlage | null = useMemo(() => {
    if (!form.acquired_on || kosten <= 0) return null;
    return {
      id: 'neu', name: form.name, asset_group: form.asset_group || null, konto_nr: form.konto_nr || null,
      acquired_on: form.acquired_on, cost_net: kosten,
      useful_life_years: Math.max(1, Number(form.useful_life_years) || 1),
      method: form.method, degressive_rate: form.method === 'degressiv' ? Number(form.degressive_rate) || 30 : null,
      residual_value: parseBetrag(form.residual_value) ?? 0,
      disposed_on: form.disposed_on || null, disposal_proceeds: parseBetrag(form.disposal_proceeds),
    };
  }, [form, kosten]);
  const plan = vorschau ? afaPlan(vorschau) : [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Bezeichnung ist ein Pflichtfeld.'); return; }
    if (!form.acquired_on) { setError('Anschaffungsdatum fehlt.'); return; }
    if (kosten <= 0) { setError('Anschaffungskosten müssen größer als 0 sein.'); return; }
    const nd = Number(form.useful_life_years);
    if (form.method !== 'gwg' && (!nd || nd < 1)) { setError('Nutzungsdauer in Jahren angeben.'); return; }
    if (form.disposed_on && form.disposed_on < form.acquired_on) { setError('Der Abgang kann nicht vor der Anschaffung liegen.'); return; }

    setLoading(true); setError('');
    const payload = {
      client_id: clientId,
      name: form.name.trim(),
      asset_group: form.asset_group.trim() || null,
      konto_nr: form.konto_nr.trim() || null,
      acquired_on: form.acquired_on,
      cost_net: kosten,
      useful_life_years: form.method === 'gwg' ? 1 : nd,
      method: form.method,
      degressive_rate: form.method === 'degressiv' ? Math.min(30, Number(form.degressive_rate) || 30) : null,
      residual_value: parseBetrag(form.residual_value) ?? 0,
      disposed_on: form.disposed_on || null,
      disposal_proceeds: form.disposed_on ? (parseBetrag(form.disposal_proceeds) ?? 0) : null,
      notes: form.notes.trim() || null,
      transaction_id: form.transaction_id || null,
    };
    const { error: err } = form.id
      ? await supabase.from('assets').update(payload).eq('id', form.id)
      : await supabase.from('assets').insert(payload);
    if (err) { setError(err.message); setLoading(false); return; }
    router.push('/anlagen');
    router.refresh();
  }

  async function handleDelete() {
    if (!form.id || !confirm('Anlage wirklich löschen? Der AfA-Plan geht damit verloren.')) return;
    setLoading(true);
    const { error: err } = await supabase.from('assets').delete().eq('id', form.id);
    if (err) { setError(err.message); setLoading(false); return; }
    router.push('/anlagen');
    router.refresh();
  }

  const inp = 'w-full border border-line-2 rounded-lg px-3.5 py-2.5 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30';
  const lbl = 'text-xs font-medium text-ink-2 block mb-1';

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5 items-start">
      <div className="space-y-5">
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-ink">Anlage</h2>
          <div>
            <label htmlFor="an-buchung" className={lbl}>Zugehörige Buchung (Anschaffung)</label>
            <select id="an-buchung" className={inp} value={form.transaction_id} onChange={e => buchungWaehlen(e.target.value)}>
              <option value="">– keine Verknüpfung –</option>
              {buchungen.map(b => (
                <option key={b.id} value={b.id}>
                  {new Date(b.booking_date + 'T00:00:00').toLocaleDateString('de-AT')} · {b.description || b.kategorie}
                  {b.beleg_nr != null ? ` · B-${b.beleg_nr}` : ''} · {formatCurrency(Number(b.amount_net))} netto
                </option>
              ))}
            </select>
            <p className="text-[11px] text-ink-3 mt-1">
              Angeboten werden Ausgaben in Kategorien der Kontenklasse 0, die noch keiner Anlage zugeordnet sind. Datum und Kosten werden übernommen.
            </p>
          </div>
          <div>
            <label htmlFor="an-name" className={lbl}>Bezeichnung <span className="text-crit">*</span></label>
            <input id="an-name" className={inp} value={form.name} onChange={e => set('name', e.target.value)} placeholder="z. B. ThinkPad X1, Schreibtisch, Firmenwagen" required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-4">
            <div>
              <label htmlFor="an-gruppe" className={lbl}>Anlagengruppe</label>
              <input id="an-gruppe" list="an-gruppen" className={inp} value={form.asset_group} onChange={e => gruppeWaehlen(e.target.value)} placeholder="Betriebs- und Geschäftsausstattung" />
              <datalist id="an-gruppen">{GRUPPEN.map(g => <option key={g.name} value={g.name} />)}</datalist>
            </div>
            <div>
              <label htmlFor="an-konto" className={lbl}>Konto (Klasse 0)</label>
              <input id="an-konto" className={`${inp} num`} value={form.konto_nr} onChange={e => set('konto_nr', e.target.value)} placeholder="0660" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="an-datum" className={lbl}>Anschaffung / Inbetriebnahme <span className="text-crit">*</span></label>
              <input id="an-datum" type="date" className={inp} value={form.acquired_on} onChange={e => set('acquired_on', e.target.value)} required />
            </div>
            <div>
              <label htmlFor="an-kosten" className={lbl}>Anschaffungskosten netto (€) <span className="text-crit">*</span></label>
              <input id="an-kosten" inputMode="decimal" className={inp} value={form.cost_net} onChange={e => set('cost_net', e.target.value)} placeholder="z. B. 2.490,00" required />
            </div>
          </div>
        </div>

        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-ink">Abschreibung</h2>
          <div className="flex flex-wrap gap-2">
            {([['linear', 'Linear'], ['degressiv', 'Degressiv (max. 30 %)'], ['gwg', 'GWG – Sofortabschreibung']] as [AfaMethode, string][]).map(([m, t]) => (
              <button key={m} type="button" onClick={() => set('method', m)}
                className={`px-3 py-1.5 rounded-md text-[13px] font-medium border transition-colors ${form.method === m ? 'bg-navy border-navy text-white' : 'bg-card border-line-2 text-ink-2 hover:bg-row'}`}>
                {t}
              </button>
            ))}
          </div>
          {form.method === 'gwg' && !gwgMoeglich && kosten > 0 && (
            <Note tone="warn">Geringwertige Wirtschaftsgüter sind bis 1.000 € netto möglich – bei {formatCurrency(kosten)} bitte linear oder degressiv abschreiben.</Note>
          )}
          {form.method !== 'gwg' && gwgMoeglich && (
            <Note>Bis 1.000 € netto darf sofort abgeschrieben werden (GWG). Wahlrecht – über die Nutzungsdauer geht auch.</Note>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {form.method !== 'gwg' && (
              <div>
                <label htmlFor="an-nd" className={lbl}>Nutzungsdauer (Jahre) <span className="text-crit">*</span></label>
                <input id="an-nd" type="number" min={1} max={100} className={`${inp} num`} value={form.useful_life_years} onChange={e => set('useful_life_years', e.target.value)} />
              </div>
            )}
            {form.method === 'degressiv' && (
              <div>
                <label htmlFor="an-satz" className={lbl}>Satz (% vom Buchwert)</label>
                <input id="an-satz" type="number" min={1} max={30} step={0.5} className={`${inp} num`} value={form.degressive_rate} onChange={e => set('degressive_rate', e.target.value)} />
              </div>
            )}
            {form.method !== 'gwg' && (
              <div>
                <label htmlFor="an-rest" className={lbl}>Restwert (€)</label>
                <input id="an-rest" inputMode="decimal" className={`${inp} num`} value={form.residual_value} onChange={e => set('residual_value', e.target.value)} placeholder="0,00" />
              </div>
            )}
          </div>
        </div>

        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-ink">Abgang <span className="text-ink-3 font-normal text-sm">(nur bei Verkauf oder Ausscheiden)</span></h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="an-abgang" className={lbl}>Abgangsdatum</label>
              <input id="an-abgang" type="date" className={inp} value={form.disposed_on} onChange={e => set('disposed_on', e.target.value)} />
            </div>
            <div>
              <label htmlFor="an-erloes" className={lbl}>Veräußerungserlös netto (€)</label>
              <input id="an-erloes" inputMode="decimal" className={`${inp} num`} value={form.disposal_proceeds} onChange={e => set('disposal_proceeds', e.target.value)} placeholder="0,00" disabled={!form.disposed_on} />
            </div>
          </div>
        </div>

        <div className="card p-6">
          <h2 className="font-semibold text-ink mb-3">Notiz</h2>
          <textarea rows={3} className={`${inp} resize-none`} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Seriennummer, Lieferant, Rechnungsnummer …" />
        </div>

        {error && <p className="text-crit text-sm bg-crit-bg px-3 py-2 rounded-lg">{error}</p>}

        <div className="flex flex-wrap gap-3">
          <Button variant="ghost" href="/anlagen">Abbrechen</Button>
          <Button type="submit" disabled={loading}>{loading ? 'Speichern …' : form.id ? 'Änderungen speichern' : 'Anlage anlegen'}</Button>
          {form.id && <Button variant="danger" className="ml-auto" onClick={handleDelete} disabled={loading}>Löschen</Button>}
        </div>
      </div>

      {/* AfA-Plan live */}
      <div className="card p-5 lg:sticky lg:top-4">
        <h2 className="text-[17px] font-semibold text-navy mb-3">AfA-Plan</h2>
        {plan.length === 0 ? (
          <p className="text-[13px] text-ink-3">Anschaffungsdatum und -kosten eingeben – der Plan erscheint hier.</p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead><tr><Th>Jahr</Th><Th num>AfA</Th><Th num>Buchwert 31.12.</Th></tr></thead>
              <tbody>
                {plan.map(z => (
                  <Tr key={z.jahr}>
                    <Td className="num text-ink">{z.jahr}{z.halb && <span className="text-[11px] text-ink-3"> ½</span>}{z.abgang && <span className="text-[11px] text-ink-3"> Abgang</span>}</Td>
                    <Td num className="text-ink-2">{formatCurrency(z.afa)}</Td>
                    <Td num className="font-semibold text-navy">{formatCurrency(z.buchwertEnde)}</Td>
                  </Tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11.5px] text-ink-3 mt-3">½ = halbe Jahres-AfA (Halbjahresregel). Summe AfA {formatCurrency(plan.reduce((s, z) => s + z.afa, 0))}.</p>
          </>
        )}
      </div>
    </form>
  );
}
