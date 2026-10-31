'use client';

// Stammdaten einer Opportunity (Welle 9a) – Aufbau wie AnlageForm.tsx,
// speichert direkt über den Supabase-Browser-Client (RLS: eigener Mandant).

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { parseBetrag } from '@/lib/parsers/betrag';
import { ART_LABEL, QUELLE_LABEL, addWerktage, istOffen, isoDatum } from '@/lib/akquise';
import type { AcqOpportunity, AcqOpportunityKind, AcqPerson, AcqSource } from '@/lib/supabase/database.types';
import { Button } from '@/components/ui';
import { inp, lbl, type FirmaKurz } from '../shared';

const betrag = (n: number | null) => n == null ? '' : Number(n).toLocaleString('de-AT', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const zahl = (s: string) => s.trim() === '' ? null : Number(s);

export default function StammdatenForm({
  clientId, opp, firmen, personen,
}: {
  clientId: string;
  opp: AcqOpportunity;
  firmen: FirmaKurz[];
  personen: AcqPerson[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [f, setF] = useState({
    title: opp.title,
    company_id: opp.company_id ?? '',
    end_company_id: opp.end_company_id ?? '',
    end_customer_confidential: opp.end_customer_confidential,
    contact_id: opp.contact_id ?? '',
    kind: opp.kind,
    source: opp.source,
    reference: opp.reference ?? '',
    probability: opp.probability == null ? '' : String(opp.probability),
    rate_per_day: betrag(opp.rate_per_day),
    salary_year: betrag(opp.salary_year),
    hours_per_week: opp.hours_per_week == null ? '' : String(opp.hours_per_week),
    start_on: opp.start_on ?? '',
    duration_months: opp.duration_months == null ? '' : String(opp.duration_months),
    location: opp.location ?? '',
    remote_share: opp.remote_share == null ? '' : String(opp.remote_share),
    applied_on: opp.applied_on ?? '',
    next_action: opp.next_action ?? '',
    next_action_on: opp.next_action_on ?? '',
    notes: opp.notes ?? '',
  });
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState('');
  const [gespeichert, setGespeichert] = useState(false);

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF(x => ({ ...x, [k]: v }));
    setGespeichert(false);
  }

  const fest = f.kind === 'festanstellung';
  const offen = istOffen(opp.stage) || opp.stage === 'pausiert';

  async function speichern(e: React.FormEvent) {
    e.preventDefault();
    if (!f.title.trim()) { setFehler('Titel ist ein Pflichtfeld.'); return; }
    if (offen && !f.next_action_on) { setFehler('Jede offene Opportunity braucht ein Datum für die nächste Aktion.'); return; }
    setLaeuft(true); setFehler('');
    const { error } = await supabase.from('acq_opportunities').update({
      title: f.title.trim(),
      company_id: f.company_id || null,
      end_company_id: f.end_company_id || null,
      end_customer_confidential: f.end_customer_confidential,
      contact_id: f.contact_id || null,
      kind: f.kind,
      source: f.source,
      reference: f.reference.trim() || null,
      probability: zahl(f.probability),
      rate_per_day: fest ? null : parseBetrag(f.rate_per_day),
      salary_year: fest ? parseBetrag(f.salary_year) : null,
      hours_per_week: zahl(f.hours_per_week),
      start_on: f.start_on || null,
      duration_months: zahl(f.duration_months),
      location: f.location.trim() || null,
      remote_share: zahl(f.remote_share),
      applied_on: f.applied_on || null,
      next_action: f.next_action.trim() || null,
      next_action_on: f.next_action_on || null,
      notes: f.notes.trim() || null,
    }).eq('id', opp.id);
    setLaeuft(false);
    if (error) { setFehler(error.message); return; }
    setGespeichert(true);
    router.refresh();
  }

  async function loeschen() {
    if (!confirm('Opportunity mit allen Aktivitäten löschen? Das lässt sich nicht rückgängig machen.')) return;
    setLaeuft(true);
    const { error } = await supabase.from('acq_opportunities').delete().eq('id', opp.id).eq('client_id', clientId);
    if (error) { setFehler(error.message); setLaeuft(false); return; }
    router.push('/akquise');
    router.refresh();
  }

  const kontaktName = (p: AcqPerson) => [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || 'Ohne Namen';

  return (
    <form onSubmit={speichern} className="space-y-5">
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-ink">Opportunity</h2>
        <div>
          <label htmlFor="o-titel" className={lbl}>Titel (Rolle / Projekt) <span className="text-crit">*</span></label>
          <input id="o-titel" className={inp} value={f.title} onChange={e => set('title', e.target.value)} required />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="o-firma" className={lbl}>Firma / Vermittler</label>
            <select id="o-firma" className={inp} value={f.company_id} onChange={e => set('company_id', e.target.value)}>
              <option value="">– keine –</option>
              {firmen.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="o-end" className={lbl}>Endkunde (falls bekannt)</label>
            <select id="o-end" className={inp} value={f.end_company_id} onChange={e => set('end_company_id', e.target.value)}>
              <option value="">– keiner / unbekannt –</option>
              {firmen.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <label className="flex items-center gap-2 text-[12.5px] text-ink-2 mt-1.5">
              <input type="checkbox" checked={f.end_customer_confidential} onChange={e => set('end_customer_confidential', e.target.checked)} />
              Endkunde vertraulich (in Exporten/Drucken nicht nennen)
            </label>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="o-kontakt" className={lbl}>Ansprechperson</label>
            <select id="o-kontakt" className={inp} value={f.contact_id} onChange={e => set('contact_id', e.target.value)}>
              <option value="">– keine –</option>
              {personen.map(p => <option key={p.id} value={p.id}>{kontaktName(p)}{p.role ? ` · ${p.role}` : ''}</option>)}
            </select>
            {f.company_id && (
              <Link href={`/akquise/firmen/${f.company_id}`} className="text-[11.5px] text-navy hover:underline">Personen pflegen →</Link>
            )}
          </div>
          <div>
            <label htmlFor="o-art" className={lbl}>Art</label>
            <select id="o-art" className={inp} value={f.kind} onChange={e => set('kind', e.target.value as AcqOpportunityKind)}>
              {Object.entries(ART_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="o-quelle" className={lbl}>Quelle</label>
            <select id="o-quelle" className={inp} value={f.source} onChange={e => set('source', e.target.value as AcqSource)}>
              {Object.entries(QUELLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="o-ref" className={lbl}>Referenz</label>
            <input id="o-ref" className={`${inp} num`} value={f.reference} onChange={e => set('reference', e.target.value)} />
          </div>
          <div>
            <label htmlFor="o-beworben" className={lbl}>Beworben am</label>
            <input id="o-beworben" type="date" className={inp} value={f.applied_on} onChange={e => set('applied_on', e.target.value)} />
          </div>
          <div>
            <label htmlFor="o-prob" className={lbl}>Wahrscheinlichkeit (%)</label>
            <input id="o-prob" type="number" min={0} max={100} className={`${inp} num`} value={f.probability} onChange={e => set('probability', e.target.value)} placeholder="Standard je Stage" />
          </div>
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-ink">Nächste Aktion</h2>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-4">
          <div>
            <label htmlFor="o-na" className={lbl}>Was</label>
            <input id="o-na" className={inp} value={f.next_action} onChange={e => set('next_action', e.target.value)} placeholder="Follow-up 1 senden, Gespräch vorbereiten …" />
          </div>
          <div>
            <label htmlFor="o-nad" className={lbl}>Wann {offen && <span className="text-crit">*</span>}</label>
            <input id="o-nad" type="date" className={inp} value={f.next_action_on} onChange={e => set('next_action_on', e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[2, 5, 10].map(n => (
            <Button key={n} size="sm" variant="ghost" onClick={() => set('next_action_on', addWerktage(isoDatum(), n))}>+{n} Werktage</Button>
          ))}
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-ink">Konditionen <span className="text-ink-3 font-normal text-sm">(optional – für den gewichteten Pipeline-Wert)</span></h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {fest ? (
            <div>
              <label htmlFor="o-gehalt" className={lbl}>Jahresgehalt brutto (€)</label>
              <input id="o-gehalt" inputMode="decimal" className={`${inp} num`} value={f.salary_year} onChange={e => set('salary_year', e.target.value)} />
            </div>
          ) : (
            <div>
              <label htmlFor="o-satz" className={lbl}>Tagessatz netto (€)</label>
              <input id="o-satz" inputMode="decimal" className={`${inp} num`} value={f.rate_per_day} onChange={e => set('rate_per_day', e.target.value)} placeholder="z. B. 950" />
            </div>
          )}
          <div>
            <label htmlFor="o-std" className={lbl}>Stunden / Woche</label>
            <input id="o-std" type="number" min={1} max={80} className={`${inp} num`} value={f.hours_per_week} onChange={e => set('hours_per_week', e.target.value)} placeholder="40" />
          </div>
          <div>
            <label htmlFor="o-dauer" className={lbl}>Dauer (Monate)</label>
            <input id="o-dauer" type="number" min={0} className={`${inp} num`} value={f.duration_months} onChange={e => set('duration_months', e.target.value)} />
          </div>
          <div>
            <label htmlFor="o-start" className={lbl}>Start</label>
            <input id="o-start" type="date" className={inp} value={f.start_on} onChange={e => set('start_on', e.target.value)} />
          </div>
          <div>
            <label htmlFor="o-ort" className={lbl}>Einsatzort</label>
            <input id="o-ort" className={inp} value={f.location} onChange={e => set('location', e.target.value)} />
          </div>
          <div>
            <label htmlFor="o-remote" className={lbl}>Remote-Anteil (%)</label>
            <input id="o-remote" type="number" min={0} max={100} className={`${inp} num`} value={f.remote_share} onChange={e => set('remote_share', e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card p-6">
        <h2 className="font-semibold text-ink mb-3">Notiz</h2>
        <textarea rows={3} className={`${inp} resize-none`} value={f.notes} onChange={e => set('notes', e.target.value)} />
      </div>

      {fehler && <p className="text-crit text-sm bg-crit-bg px-3 py-2 rounded-lg">{fehler}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={laeuft}>{laeuft ? 'Speichern …' : 'Änderungen speichern'}</Button>
        {gespeichert && <span className="text-[12.5px] text-good">Gespeichert.</span>}
        <Button variant="danger" className="ml-auto" onClick={loeschen} disabled={laeuft}>Löschen</Button>
      </div>
    </form>
  );
}
