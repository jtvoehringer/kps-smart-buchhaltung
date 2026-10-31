'use client';

// Schnellanlage einer Opportunity (Welle 9a) – in unter einer Minute:
// Titel, Firma (vorhandene wählen oder neu anlegen), Art, Quelle,
// Bewerbungsdatum, nächste Aktion (Standard: Follow-up 1 nach 5 Werktagen)
// und optional die Pfade der erstellten Unterlagen.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  ART_LABEL, FIRMENART_LABEL, QUELLE_LABEL, defaultProbability, dokumentAusPfad, followupDatum, isoDatum,
} from '@/lib/akquise';
import type { AcqCompanyKind, AcqOpportunityKind, AcqSource, AcqStage } from '@/lib/supabase/database.types';
import { Button } from '@/components/ui';
import { inp, lbl, type FirmaKurz } from '../shared';

export default function NeuForm({ clientId, firmen, vorbelegung }: { clientId: string; firmen: FirmaKurz[]; vorbelegung: string }) {
  const router = useRouter();
  const supabase = createClient();
  const heute = isoDatum();
  const [f, setF] = useState({
    title: '',
    firma: vorbelegung,
    firmaArt: 'vermittler' as AcqCompanyKind,
    endkunde: '',
    vertraulich: false,
    kind: 'projekt' as AcqOpportunityKind,
    source: 'vermittler' as AcqSource,
    reference: '',
    stage: 'beworben' as AcqStage,
    applied_on: heute,
    next_action: 'Follow-up 1 senden',
    next_action_on: followupDatum(heute),
    dokumente: '',
  });
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState('');

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) { setF(x => ({ ...x, [k]: v })); }

  const finde = (name: string) => firmen.find(x => x.name.trim().toLowerCase() === name.trim().toLowerCase());
  const firmaNeu = f.firma.trim() !== '' && !finde(f.firma);
  const endkundeNeu = f.endkunde.trim() !== '' && !finde(f.endkunde);

  async function firmaId(name: string, kind: AcqCompanyKind): Promise<string | null> {
    if (!name.trim()) return null;
    const vorhanden = finde(name);
    if (vorhanden) return vorhanden.id;
    const { data, error } = await supabase.from('acq_companies').insert({ client_id: clientId, name: name.trim(), kind }).select('id').single();
    if (error) throw new Error(`Firma „${name}“: ${error.message}`);
    return data.id;
  }

  async function speichern(e: React.FormEvent) {
    e.preventDefault();
    if (!f.title.trim()) { setFehler('Titel ist ein Pflichtfeld.'); return; }
    if (!f.next_action_on) { setFehler('Jede Opportunity braucht ein Datum für die nächste Aktion.'); return; }
    setLaeuft(true); setFehler('');
    try {
      const company_id = await firmaId(f.firma, f.firmaArt);
      const end_company_id = await firmaId(f.endkunde, 'endkunde');
      const { data: opp, error } = await supabase.from('acq_opportunities').insert({
        client_id: clientId,
        title: f.title.trim(),
        company_id, end_company_id,
        end_customer_confidential: f.vertraulich,
        kind: f.kind,
        source: f.source,
        reference: f.reference.trim() || null,
        stage: f.stage,
        probability: defaultProbability(f.stage),
        applied_on: f.stage === 'beworben' ? f.applied_on || heute : null,
        next_action: f.next_action.trim() || null,
        next_action_on: f.next_action_on,
      }).select('id').single();
      if (error) throw new Error(error.message);

      const documents = f.dokumente.split('\n').filter(z => z.trim()).map(dokumentAusPfad);
      if (f.stage === 'beworben' || documents.length > 0) {
        const datum = f.applied_on && f.applied_on !== heute ? new Date(`${f.applied_on}T12:00:00`).toISOString() : new Date().toISOString();
        const { error: e2 } = await supabase.from('acq_activities').insert({
          client_id: clientId, opportunity_id: opp.id,
          kind: f.stage === 'beworben' ? 'bewerbung' : 'notiz',
          direction: f.stage === 'beworben' ? 'aus' : null,
          occurred_at: datum,
          summary: f.stage === 'beworben' ? `Bewerbung: ${f.title.trim()}` : 'Unterlagen erstellt',
          documents,
        });
        if (e2) throw new Error(e2.message);
      }
      router.push(`/akquise/${opp.id}`);
      router.refresh();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : String(err));
      setLaeuft(false);
    }
  }

  return (
    <form onSubmit={speichern} className="card p-6 space-y-4">
      <div>
        <label htmlFor="n-titel" className={lbl}>Titel (Rolle / Projekt) <span className="text-crit">*</span></label>
        <input id="n-titel" className={inp} value={f.title} onChange={e => set('title', e.target.value)} placeholder="z. B. Senior Requirements Engineer E-Government" required autoFocus />
      </div>

      <datalist id="n-firmen">{firmen.map(x => <option key={x.id} value={x.name} />)}</datalist>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-4">
        <div>
          <label htmlFor="n-firma" className={lbl}>Firma / Vermittler</label>
          <input id="n-firma" list="n-firmen" className={inp} value={f.firma} onChange={e => set('firma', e.target.value)} placeholder="Name eingeben oder wählen" autoComplete="off" />
          {firmaNeu && <p className="text-[11.5px] text-info mt-1">Neue Firma – wird beim Speichern angelegt.</p>}
        </div>
        {firmaNeu && (
          <div>
            <label htmlFor="n-firmaart" className={lbl}>Art der neuen Firma</label>
            <select id="n-firmaart" className={inp} value={f.firmaArt} onChange={e => set('firmaArt', e.target.value as AcqCompanyKind)}>
              {Object.entries(FIRMENART_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        )}
      </div>
      <div>
        <label htmlFor="n-end" className={lbl}>Endkunde (optional)</label>
        <input id="n-end" list="n-firmen" className={inp} value={f.endkunde} onChange={e => set('endkunde', e.target.value)} placeholder="falls bekannt" autoComplete="off" />
        {endkundeNeu && <p className="text-[11.5px] text-info mt-1">Neuer Endkunde – wird beim Speichern angelegt.</p>}
        {f.endkunde.trim() && (
          <label className="flex items-center gap-2 text-[12.5px] text-ink-2 mt-1.5">
            <input type="checkbox" checked={f.vertraulich} onChange={e => set('vertraulich', e.target.checked)} />
            Endkunde vertraulich
          </label>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label htmlFor="n-art" className={lbl}>Art</label>
          <select id="n-art" className={inp} value={f.kind} onChange={e => set('kind', e.target.value as AcqOpportunityKind)}>
            {Object.entries(ART_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="n-quelle" className={lbl}>Quelle</label>
          <select id="n-quelle" className={inp} value={f.source} onChange={e => set('source', e.target.value as AcqSource)}>
            {Object.entries(QUELLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="n-ref" className={lbl}>Referenz</label>
          <input id="n-ref" className={`${inp} num`} value={f.reference} onChange={e => set('reference', e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="n-stage" className={lbl}>Stand</label>
          <select id="n-stage" className={inp} value={f.stage} onChange={e => {
            const s = e.target.value as AcqStage;
            setF(x => ({ ...x, stage: s, next_action: s === 'recherche' ? 'Ansprechperson finden, Unterlagen erstellen' : 'Follow-up 1 senden' }));
          }}>
            <option value="beworben">Beworben</option>
            <option value="recherche">Recherche (noch nicht beworben)</option>
          </select>
        </div>
        {f.stage === 'beworben' && (
          <div>
            <label htmlFor="n-datum" className={lbl}>Beworben am</label>
            <input id="n-datum" type="date" className={inp} value={f.applied_on} max={heute} onChange={e => {
              const d = e.target.value;
              setF(x => ({ ...x, applied_on: d, next_action_on: d ? followupDatum(d) : x.next_action_on }));
            }} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-4">
        <div>
          <label htmlFor="n-na" className={lbl}>Nächste Aktion</label>
          <input id="n-na" className={inp} value={f.next_action} onChange={e => set('next_action', e.target.value)} />
        </div>
        <div>
          <label htmlFor="n-nad" className={lbl}>am <span className="text-crit">*</span></label>
          <input id="n-nad" type="date" className={inp} value={f.next_action_on} onChange={e => set('next_action_on', e.target.value)} required />
        </div>
      </div>

      <div>
        <label htmlFor="n-dok" className={lbl}>Dokumentpfade (optional, eine Zeile je Datei)</label>
        <textarea id="n-dok" rows={2} className={`${inp} resize-y font-mono text-[12px]`} value={f.dokumente} onChange={e => set('dokumente', e.target.value)} placeholder="C:\Users\joerg\Claude\Designs\CD\Claude outputs\Projektbewerbung_…_Voehringer.pdf" />
        <p className="text-[11px] text-ink-3 mt-1">Im Explorer: Datei mit Umschalt + Rechtsklick → „Als Pfad kopieren“.</p>
      </div>

      {fehler && <p className="text-crit text-sm bg-crit-bg px-3 py-2 rounded-lg">{fehler}</p>}
      <div className="flex gap-3">
        <Button variant="ghost" href="/akquise">Abbrechen</Button>
        <Button type="submit" disabled={laeuft}>{laeuft ? 'Speichern …' : 'Opportunity anlegen'}</Button>
      </div>
    </form>
  );
}
