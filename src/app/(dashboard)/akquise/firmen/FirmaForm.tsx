'use client';

// Firma / Vermittler anlegen oder bearbeiten (Welle 9a)

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { FIRMENART_LABEL } from '@/lib/akquise';
import type { AcqCompany, AcqCompanyKind } from '@/lib/supabase/database.types';
import { Button } from '@/components/ui';
import { inp, lbl } from '../shared';

export default function FirmaForm({ clientId, firma }: { clientId: string; firma?: AcqCompany }) {
  const router = useRouter();
  const supabase = createClient();
  const [f, setF] = useState({
    name: firma?.name ?? '',
    kind: firma?.kind ?? ('vermittler' as AcqCompanyKind),
    website: firma?.website ?? '',
    linkedin_url: firma?.linkedin_url ?? '',
    city: firma?.city ?? '',
    country: firma?.country ?? 'AT',
    industry: firma?.industry ?? '',
    icp_fit: firma?.icp_fit == null ? '' : String(firma.icp_fit),
    rating: firma?.rating == null ? '' : String(firma.rating),
    tags: firma?.tags.join(', ') ?? '',
    notes: firma?.notes ?? '',
    is_active: firma?.is_active ?? true,
  });
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState('');
  const [gespeichert, setGespeichert] = useState(false);

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) { setF(x => ({ ...x, [k]: v })); setGespeichert(false); }

  async function speichern(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) { setFehler('Name ist ein Pflichtfeld.'); return; }
    setLaeuft(true); setFehler('');
    const payload = {
      client_id: clientId,
      name: f.name.trim(),
      kind: f.kind,
      website: f.website.trim() || null,
      linkedin_url: f.linkedin_url.trim() || null,
      city: f.city.trim() || null,
      country: f.country.trim().toUpperCase() || 'AT',
      industry: f.industry.trim() || null,
      icp_fit: f.icp_fit ? Number(f.icp_fit) : null,
      rating: f.rating ? Number(f.rating) : null,
      tags: f.tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean),
      notes: f.notes.trim() || null,
      is_active: f.is_active,
    };
    if (firma) {
      const { error } = await supabase.from('acq_companies').update(payload).eq('id', firma.id);
      setLaeuft(false);
      if (error) { setFehler(error.message); return; }
      setGespeichert(true);
      router.refresh();
    } else {
      const { data, error } = await supabase.from('acq_companies').insert(payload).select('id').single();
      if (error) { setFehler(error.message); setLaeuft(false); return; }
      router.push(`/akquise/firmen/${data.id}`);
      router.refresh();
    }
  }

  async function loeschen() {
    if (!firma) return;
    if (!confirm('Firma löschen? Ansprechpersonen werden mitgelöscht, Opportunities bleiben ohne Firma erhalten.')) return;
    setLaeuft(true);
    const { error } = await supabase.from('acq_companies').delete().eq('id', firma.id);
    if (error) { setFehler(error.message); setLaeuft(false); return; }
    router.push('/akquise/firmen');
    router.refresh();
  }

  const stufen = ['', '1', '2', '3', '4', '5'];

  return (
    <form onSubmit={speichern} className="card p-6 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-4">
        <div>
          <label htmlFor="f-name" className={lbl}>Name <span className="text-crit">*</span></label>
          <input id="f-name" className={inp} value={f.name} onChange={e => set('name', e.target.value)} required />
        </div>
        <div>
          <label htmlFor="f-art" className={lbl}>Art</label>
          <select id="f-art" className={inp} value={f.kind} onChange={e => set('kind', e.target.value as AcqCompanyKind)}>
            {Object.entries(FIRMENART_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_100px_1fr] gap-4">
        <div>
          <label htmlFor="f-ort" className={lbl}>Ort</label>
          <input id="f-ort" className={inp} value={f.city} onChange={e => set('city', e.target.value)} />
        </div>
        <div>
          <label htmlFor="f-land" className={lbl}>Land</label>
          <input id="f-land" className={`${inp} num uppercase`} maxLength={2} value={f.country} onChange={e => set('country', e.target.value)} />
        </div>
        <div>
          <label htmlFor="f-branche" className={lbl}>Branche</label>
          <input id="f-branche" className={inp} value={f.industry} onChange={e => set('industry', e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="f-web" className={lbl}>Website</label>
          <input id="f-web" type="url" className={inp} value={f.website} onChange={e => set('website', e.target.value)} placeholder="https://" />
        </div>
        <div>
          <label htmlFor="f-li" className={lbl}>LinkedIn</label>
          <input id="f-li" type="url" className={inp} value={f.linkedin_url} onChange={e => set('linkedin_url', e.target.value)} placeholder="https://www.linkedin.com/company/…" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label htmlFor="f-icp" className={lbl}>ICP-Fit (1–5)</label>
          <select id="f-icp" className={inp} value={f.icp_fit} onChange={e => set('icp_fit', e.target.value)}>
            {stufen.map(s => <option key={s} value={s}>{s || '–'}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f-rating" className={lbl}>Rating (1–5)</label>
          <select id="f-rating" className={inp} value={f.rating} onChange={e => set('rating', e.target.value)}>
            {stufen.map(s => <option key={s} value={s}>{s || '–'}</option>)}
          </select>
          <p className="text-[11px] text-ink-3 mt-1">Erfahrung: Reaktionszeit, Seriosität</p>
        </div>
        <div>
          <label htmlFor="f-tags" className={lbl}>Tags (Komma)</label>
          <input id="f-tags" className={inp} value={f.tags} onChange={e => set('tags', e.target.value)} placeholder="schweiz, banking, public" />
        </div>
      </div>
      <div>
        <label htmlFor="f-notiz" className={lbl}>Notiz</label>
        <textarea id="f-notiz" rows={3} className={`${inp} resize-none`} value={f.notes} onChange={e => set('notes', e.target.value)} />
      </div>
      {firma && (
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          <input type="checkbox" checked={f.is_active} onChange={e => set('is_active', e.target.checked)} /> aktiv
        </label>
      )}
      {fehler && <p className="text-crit text-sm bg-crit-bg px-3 py-2 rounded-lg">{fehler}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" href="/akquise/firmen">Abbrechen</Button>
        <Button type="submit" disabled={laeuft}>{laeuft ? 'Speichern …' : firma ? 'Änderungen speichern' : 'Firma anlegen'}</Button>
        {gespeichert && <span className="text-[12.5px] text-good">Gespeichert.</span>}
        {firma && <Button variant="danger" className="ml-auto" onClick={loeschen} disabled={laeuft}>Löschen</Button>}
      </div>
    </form>
  );
}
