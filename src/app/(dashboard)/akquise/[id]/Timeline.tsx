'use client';

// Timeline einer Opportunity (Welle 9a): Schnellerfassung oben, darunter
// alle Aktivitäten (neueste zuerst). Gesprächsfelder (Temperatur,
// Einwände, Budget, nächster Schritt) sind ausklappbar. Dokumente sind
// lokale Pfade in „Claude outputs“ – der Browser öffnet sie nicht, daher
// „Pfad kopieren“. Antworten/Gespräche heben die Stage per DB-Trigger an.

import { useRef, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownLeft, ArrowUpRight, Copy, FileText } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { AKTIVITAET_LABEL, addWerktage, dokumentAusPfad, isoDatum, stageAnheben, stageLabel } from '@/lib/akquise';
import type { AcqActivity, AcqActivityKind, AcqOpportunity } from '@/lib/supabase/database.types';
import { Badge, Button, Card, CardHeader } from '@/components/ui';
import { RICHTUNG, datum, inp, lbl } from '../shared';

const TEMPERATUR = { heiss: 'heiß', warm: 'warm', kalt: 'kalt' } as const;
const GESPRAECHSARTEN: AcqActivityKind[] = ['gespraech', 'interview'];

export default function Timeline({
  clientId, opp, aktivitaeten, startArt,
}: {
  clientId: string;
  opp: AcqOpportunity;
  aktivitaeten: AcqActivity[];
  startArt?: AcqActivityKind;
}) {
  const router = useRouter();
  const supabase = createClient();
  const heute = isoDatum();
  const leer = {
    kind: (startArt ?? 'followup') as AcqActivityKind,
    datum: heute,
    summary: '',
    body: '',
    temperature: '' as '' | keyof typeof TEMPERATUR,
    objections: '',
    budget_note: '',
    next_step: '',
    quality: '',
    dokumente: '',
    next_action: opp.next_action ?? '',
    next_action_on: opp.next_action_on ?? '',
  };
  const [f, setF] = useState(leer);
  const [details, setDetails] = useState(!!startArt && GESPRAECHSARTEN.includes(startArt));
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState('');
  const [kopiert, setKopiert] = useState<string | null>(null);
  const summaryRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (startArt) summaryRef.current?.focus(); }, [startArt]);

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) { setF(x => ({ ...x, [k]: v })); }

  function artWaehlen(kind: AcqActivityKind) {
    setF(x => {
      // Vorschlag für die nächste Aktion nach einem Follow-up
      if (kind === 'followup' && /follow-up 1/i.test(x.next_action)) {
        return { ...x, kind, next_action: 'Follow-up 2 senden', next_action_on: addWerktage(heute, 5) };
      }
      return { ...x, kind };
    });
    if (GESPRAECHSARTEN.includes(kind)) setDetails(true);
  }

  const neueStage = stageAnheben(opp.stage, f.kind);
  const schliesst = neueStage === 'gewonnen' || neueStage === 'verloren';

  async function speichern(e: React.FormEvent) {
    e.preventDefault();
    if (!f.summary.trim() && !f.body.trim()) { setFehler('Bitte eine Zeile zur Aktivität eingeben.'); return; }
    setLaeuft(true); setFehler('');
    const occurred_at = f.datum === heute ? new Date().toISOString() : new Date(`${f.datum}T12:00:00`).toISOString();
    const { error } = await supabase.from('acq_activities').insert({
      client_id: clientId,
      opportunity_id: opp.id,
      kind: f.kind,
      occurred_at,
      direction: RICHTUNG[f.kind] ?? null,
      summary: f.summary.trim() || null,
      body: f.body.trim() || null,
      temperature: f.temperature || null,
      objections: f.objections.trim() ? f.objections.split(/[,;\n]/).map(s => s.trim()).filter(Boolean) : null,
      budget_note: f.budget_note.trim() || null,
      next_step: f.next_step.trim() || null,
      quality: f.quality ? Number(f.quality) : null,
      documents: f.dokumente.split('\n').filter(z => z.trim()).map(dokumentAusPfad),
    });
    if (error) { setFehler(error.message); setLaeuft(false); return; }
    // Nächste Aktion fortschreiben (bei Abschluss durch Zusage/Absage nicht nötig)
    if (!schliesst && (f.next_action !== (opp.next_action ?? '') || f.next_action_on !== (opp.next_action_on ?? '')) && f.next_action_on) {
      await supabase.from('acq_opportunities').update({ next_action: f.next_action.trim() || null, next_action_on: f.next_action_on }).eq('id', opp.id);
    }
    setF({ ...leer, kind: 'followup', next_action: f.next_action, next_action_on: f.next_action_on });
    setDetails(false);
    setLaeuft(false);
    router.refresh();
  }

  async function kopieren(pfad: string) {
    try {
      await navigator.clipboard.writeText(pfad);
      setKopiert(pfad);
      setTimeout(() => setKopiert(k => (k === pfad ? null : k)), 1500);
    } catch {
      setFehler('Kopieren nicht möglich – Pfad bitte markieren und mit Strg+C kopieren.');
    }
  }

  return (
    <Card padded={false} className="lg:sticky lg:top-4">
      <CardHeader title="Timeline" border>
        <span className="font-mono text-[11px] text-ink-3">{aktivitaeten.length} {aktivitaeten.length === 1 ? 'Eintrag' : 'Einträge'}</span>
      </CardHeader>

      {/* Schnellerfassung */}
      <form onSubmit={speichern} className="px-5 py-4 border-b border-line space-y-3 bg-row">
        <div className="grid grid-cols-[1fr_140px] gap-2">
          <select aria-label="Art der Aktivität" className={inp} value={f.kind} onChange={e => artWaehlen(e.target.value as AcqActivityKind)}>
            {(Object.keys(AKTIVITAET_LABEL) as AcqActivityKind[]).map(k => <option key={k} value={k}>{AKTIVITAET_LABEL[k]}</option>)}
          </select>
          <input aria-label="Datum" type="date" className={inp} value={f.datum} max={heute} onChange={e => set('datum', e.target.value)} />
        </div>
        <input ref={summaryRef} aria-label="Zusammenfassung" className={inp} value={f.summary} onChange={e => set('summary', e.target.value)} placeholder="Eine Zeile: was ist passiert?" />
        {neueStage && (
          <p className="text-[12px] text-info">Stage wird auf „{stageLabel(neueStage, opp.kind)}“ angehoben.</p>
        )}

        <button type="button" className="text-[12.5px] text-navy hover:underline" onClick={() => setDetails(d => !d)}>
          {details ? '– Gesprächsfelder ausblenden' : '+ Gesprächsfelder, Notiz, Dokumente'}
        </button>
        {details && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="t-temp" className={lbl}>Temperatur</label>
                <select id="t-temp" className={inp} value={f.temperature} onChange={e => set('temperature', e.target.value as typeof f.temperature)}>
                  <option value="">–</option>
                  {Object.entries(TEMPERATUR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="t-qual" className={lbl}>Qualität (1–10)</label>
                <input id="t-qual" type="number" min={1} max={10} className={`${inp} num`} value={f.quality} onChange={e => set('quality', e.target.value)} />
              </div>
            </div>
            <div>
              <label htmlFor="t-einw" className={lbl}>Einwände (durch Komma getrennt)</label>
              <input id="t-einw" className={inp} value={f.objections} onChange={e => set('objections', e.target.value)} placeholder="Tagessatz, Verfügbarkeit, Branchenerfahrung" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="t-budget" className={lbl}>Budget / Tagessatz</label>
                <input id="t-budget" className={inp} value={f.budget_note} onChange={e => set('budget_note', e.target.value)} />
              </div>
              <div>
                <label htmlFor="t-step" className={lbl}>Vereinbarter nächster Schritt</label>
                <input id="t-step" className={inp} value={f.next_step} onChange={e => set('next_step', e.target.value)} />
              </div>
            </div>
            <div>
              <label htmlFor="t-body" className={lbl}>Notiz</label>
              <textarea id="t-body" rows={4} className={`${inp} resize-y`} value={f.body} onChange={e => set('body', e.target.value)} />
            </div>
            <div>
              <label htmlFor="t-dok" className={lbl}>Dokumentpfade (eine Zeile je Datei)</label>
              <textarea id="t-dok" rows={2} className={`${inp} resize-y font-mono text-[12px]`} value={f.dokumente} onChange={e => set('dokumente', e.target.value)} placeholder="C:\Users\joerg\Claude\Designs\CD\Claude outputs\…pdf" />
            </div>
          </div>
        )}

        {!schliesst && (
          <div className="grid grid-cols-[1fr_140px] gap-2">
            <div>
              <label htmlFor="t-na" className={lbl}>Danach: nächste Aktion</label>
              <input id="t-na" className={inp} value={f.next_action} onChange={e => set('next_action', e.target.value)} />
            </div>
            <div>
              <label htmlFor="t-nad" className={lbl}>am</label>
              <input id="t-nad" type="date" className={inp} value={f.next_action_on} onChange={e => set('next_action_on', e.target.value)} />
            </div>
          </div>
        )}

        {fehler && <p className="text-crit text-sm bg-crit-bg px-3 py-2 rounded-lg">{fehler}</p>}
        <Button type="submit" size="sm" disabled={laeuft}>{laeuft ? 'Speichern …' : 'Aktivität erfassen'}</Button>
      </form>

      {/* Verlauf */}
      {aktivitaeten.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-ink-3">Noch keine Aktivität – die Bewerbung oben als erste erfassen.</p>
      ) : (
        <ol className="max-h-[70vh] overflow-y-auto">
          {aktivitaeten.map(a => (
            <li key={a.id} className="px-5 py-3 border-b border-line last:border-b-0">
              <div className="flex items-center gap-2">
                <Badge tone={a.kind === 'zusage' ? 'good' : a.kind === 'absage' ? 'crit' : GESPRAECHSARTEN.includes(a.kind) ? 'navy' : a.kind === 'notiz' ? 'gray' : 'info'}>
                  {AKTIVITAET_LABEL[a.kind]}
                </Badge>
                {a.direction === 'ein' && <ArrowDownLeft size={14} className="text-ink-3" aria-label="eingehend" />}
                {a.direction === 'aus' && <ArrowUpRight size={14} className="text-ink-3" aria-label="ausgehend" />}
                <span className="num text-[11.5px] text-ink-3 ml-auto">{datum(a.occurred_at)}</span>
              </div>
              {a.summary && <p className="text-[13.5px] text-ink mt-1">{a.summary}</p>}
              {(a.temperature || a.quality || a.budget_note || a.next_step || (a.objections?.length ?? 0) > 0) && (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12px] mt-1.5">
                  {a.temperature && <><dt className="text-ink-3">Temperatur</dt><dd className="text-ink-2">{TEMPERATUR[a.temperature]}</dd></>}
                  {a.quality && <><dt className="text-ink-3">Qualität</dt><dd className="num text-ink-2">{a.quality}/10</dd></>}
                  {a.objections && a.objections.length > 0 && <><dt className="text-ink-3">Einwände</dt><dd className="text-ink-2">{a.objections.join(', ')}</dd></>}
                  {a.budget_note && <><dt className="text-ink-3">Budget</dt><dd className="text-ink-2">{a.budget_note}</dd></>}
                  {a.next_step && <><dt className="text-ink-3">Nächster Schritt</dt><dd className="text-ink-2">{a.next_step}</dd></>}
                </dl>
              )}
              {a.body && <p className="text-[12.5px] text-ink-2 mt-1.5 whitespace-pre-line">{a.body}</p>}
              {a.documents.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {a.documents.map(d => (
                    <li key={d.path} className="flex items-center gap-2 text-[12px]">
                      <FileText size={13} className="text-ink-3 shrink-0" />
                      <span className="truncate flex-1 min-w-0 text-ink-2" title={d.path}>{d.path.split(/[\\/]/).pop()}</span>
                      <span className="font-mono text-[10.5px] text-ink-3 uppercase">{d.type}</span>
                      <button type="button" onClick={() => kopieren(d.path)} className="inline-flex items-center gap-1 text-navy hover:underline shrink-0">
                        <Copy size={12} />{kopiert === d.path ? 'kopiert' : 'Pfad kopieren'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
