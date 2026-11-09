'use client';

// Pipeline (Welle 9a): Kacheln, Filter, Kanban mit Drag & Drop (HTML5,
// ohne Bibliothek) und Listenansicht. Ein Verschieben schreibt die Stage
// und legt eine Notiz-Aktivität „Stage geändert: A → B“ an.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Columns3, LayoutList, MessageSquarePlus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/utils';
import {
  ART_LABEL, OFFENE_STAGES, QUELLE_LABEL, STAGES, addTage, antwortquote, defaultProbability, faelligkeit,
  gewichteterWert, isoDatum, letzteAktivitaet, stageLabel, tageZwischen,
} from '@/lib/akquise';
import type { AcqOpportunity, AcqOpportunityKind, AcqSource, AcqStage } from '@/lib/supabase/database.types';
import { Button, Card, CardHeader, Note, Td, Th, Tile, Tr } from '@/components/ui';
import { ArtBadge, StageBadge, datum, datumKurz, firmaText, inpSm, type AktivitaetKurz, type FirmaKurz } from './shared';

type Ansicht = 'auto' | 'kanban' | 'liste';

export default function PipelineClient({
  clientId,
  initialOpps,
  firmen,
  initialAktivitaeten,
  gespraechWaehlen,
}: {
  clientId: string;
  initialOpps: AcqOpportunity[];
  firmen: FirmaKurz[];
  initialAktivitaeten: AktivitaetKurz[];
  /** aus der Befehlspalette „Gespräch notieren“: erst Opportunity wählen */
  gespraechWaehlen: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const heute = useMemo(() => isoDatum(), []);
  const [opps, setOpps] = useState(initialOpps);
  const [akt, setAkt] = useState(initialAktivitaeten);
  const [ansicht, setAnsicht] = useState<Ansicht>('auto');
  const [fehler, setFehler] = useState('');
  const [ziehe, setZiehe] = useState<string | null>(null);
  const [ueber, setUeber] = useState<AcqStage | null>(null);

  // Filter
  const [art, setArt] = useState<AcqOpportunityKind | ''>('');
  const [quelle, setQuelle] = useState<AcqSource | ''>('');
  const [firma, setFirma] = useState('');
  const [zeitraum, setZeitraum] = useState('');
  const [abgeschlossene, setAbgeschlossene] = useState(false);
  const [stageFilter, setStageFilter] = useState<AcqStage | ''>('');

  const firmenMap = useMemo(() => new Map(firmen.map(f => [f.id, f])), [firmen]);
  const letzte = useMemo(() => letzteAktivitaet(akt), [akt]);

  const gefiltert = useMemo(() => opps.filter(o =>
    (!art || o.kind === art)
    && (!quelle || o.source === quelle)
    && (!firma || o.company_id === firma || o.end_company_id === firma)
    && (!zeitraum || (o.applied_on ?? '') >= addTage(heute, -Number(zeitraum))),
  ), [opps, art, quelle, firma, zeitraum, heute]);

  const offen = gefiltert.filter(o => OFFENE_STAGES.includes(o.stage));
  const ueberfaellig = offen.filter(o => faelligkeit(o, heute) === 'ueberfaellig').length;
  const quote = antwortquote(gefiltert, akt, addTage(heute, -30));
  const wert = gewichteterWert(gefiltert);
  const geschlossen = {
    gewonnen: gefiltert.filter(o => o.stage === 'gewonnen').length,
    verloren: gefiltert.filter(o => o.stage === 'verloren').length,
    pausiert: gefiltert.filter(o => o.stage === 'pausiert').length,
  };
  const firmenMitOpps = firmen.filter(f => opps.some(o => o.company_id === f.id || o.end_company_id === f.id));

  async function verschieben(id: string, ziel: AcqStage) {
    const o = opps.find(x => x.id === id);
    if (!o || o.stage === ziel) return;
    setFehler('');
    const vorher = o;
    const neu = { ...o, stage: ziel, probability: defaultProbability(ziel), next_action_on: o.next_action_on ?? heute };
    setOpps(list => list.map(x => x.id === id ? neu : x));
    const { error } = await supabase.from('acq_opportunities')
      .update({ stage: neu.stage, probability: neu.probability, next_action_on: neu.next_action_on })
      .eq('id', id);
    if (error) {
      setOpps(list => list.map(x => x.id === id ? vorher : x));
      setFehler(`Verschieben fehlgeschlagen: ${error.message}`);
      return;
    }
    const jetzt = new Date().toISOString();
    await supabase.from('acq_activities').insert({
      client_id: clientId, opportunity_id: id, kind: 'notiz', occurred_at: jetzt,
      summary: `Stage geändert: ${stageLabel(vorher.stage, o.kind)} → ${stageLabel(ziel, o.kind)}`,
    });
    setAkt(a => [...a, { opportunity_id: id, kind: 'notiz', occurred_at: jetzt, direction: null }]);
    router.refresh();
  }

  function karte(o: AcqOpportunity) {
    const f = faelligkeit(o, heute);
    const l = letzte.get(o.id);
    const tage = l ? tageZwischen(l, heute) : null;
    return (
      <div
        key={o.id}
        draggable
        onDragStart={e => { e.dataTransfer.setData('text/plain', o.id); e.dataTransfer.effectAllowed = 'move'; setZiehe(o.id); }}
        onDragEnd={() => { setZiehe(null); setUeber(null); }}
        className={`card p-3 cursor-grab active:cursor-grabbing transition-colors hover:border-signal ${ziehe === o.id ? 'opacity-50' : ''}`}
      >
        <Link href={`/akquise/${o.id}`} className="block text-[13.5px] font-semibold text-ink leading-snug hover:underline" draggable={false}>
          {o.title}
        </Link>
        <p className="text-[12px] text-ink-2 mt-0.5 truncate">{firmaText(o, firmenMap)}</p>
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <ArtBadge kind={o.kind} />
          {tage != null && <span className="font-mono text-[10.5px] text-ink-3">vor {tage} T.</span>}
        </div>
        {o.next_action_on && (
          <p className={`text-[12px] mt-2 pt-2 border-t border-line ${f === 'ueberfaellig' ? 'text-crit font-medium' : f === 'heute' ? 'text-warn font-medium' : 'text-ink-2'}`}>
            <span className="num">{datumKurz(o.next_action_on)}</span> · {o.next_action || 'nächste Aktion'}
          </p>
        )}
      </div>
    );
  }

  const kanbanKlasse = ansicht === 'kanban' ? 'block' : ansicht === 'liste' ? 'hidden' : 'hidden md:block';
  const listeKlasse  = ansicht === 'liste'  ? 'block' : ansicht === 'kanban' ? 'hidden' : 'block md:hidden';
  // Eine gewählte Stage zeigt die Liste immer – auch Gewonnen/Absage
  // ohne das Häkchen „auch gewonnene/abgesagte“
  const listenOpps = stageFilter
    ? gefiltert.filter(o => o.stage === stageFilter)
    : abgeschlossene ? gefiltert : gefiltert.filter(o => o.stage !== 'gewonnen' && o.stage !== 'verloren');

  return (
    <>
      {gespraechWaehlen && <GespraechWaehlen opps={opps.filter(o => o.stage !== 'gewonnen' && o.stage !== 'verloren')} firmen={firmenMap} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile label="Offene Opportunities" value={offen.length} detail={`${geschlossen.pausiert} pausiert · ${geschlossen.gewonnen} gewonnen · ${geschlossen.verloren} Absagen`} />
        <Tile label="Nächste Aktion überfällig" value={ueberfaellig} tone={ueberfaellig > 0 ? 'crit' : 'good'} detail={ueberfaellig > 0 ? 'Follow-ups nachholen' : 'alles im Plan'} />
        <Tile
          label="Antwortquote 30 Tage"
          value={quote.quote == null ? '—' : `${Math.round(quote.quote * 100)} %`}
          tone="ink"
          detail={`${quote.beantwortet} von ${quote.beworben} Bewerbungen mit Reaktion`}
        />
        <Tile
          label="Gewichteter Pipeline-Wert"
          value={formatCurrency(wert.wert)}
          tone="ink"
          detail={wert.ohneAngaben > 0 ? `${wert.ohneAngaben} Projekte ohne Tagessatz/Dauer` : 'Tagessatz × Dauer × Wahrscheinlichkeit'}
        />
      </div>

      {/* Filter und Ansicht */}
      <div className="flex flex-wrap items-center gap-2 mt-5 mb-3">
        <select aria-label="Art" className={inpSm} value={art} onChange={e => setArt(e.target.value as AcqOpportunityKind | '')}>
          <option value="">Alle Arten</option>
          {Object.entries(ART_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="Quelle" className={inpSm} value={quelle} onChange={e => setQuelle(e.target.value as AcqSource | '')}>
          <option value="">Alle Quellen</option>
          {Object.entries(QUELLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="Firma" className={`${inpSm} max-w-[220px]`} value={firma} onChange={e => setFirma(e.target.value)}>
          <option value="">Alle Firmen</option>
          {firmenMitOpps.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <select aria-label="Zeitraum" className={inpSm} value={zeitraum} onChange={e => setZeitraum(e.target.value)}>
          <option value="">Gesamter Zeitraum</option>
          <option value="30">Beworben letzte 30 Tage</option>
          <option value="90">Beworben letzte 90 Tage</option>
          <option value="365">Beworben letzte 12 Monate</option>
        </select>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant={ansicht === 'kanban' ? 'primary' : 'ghost'} onClick={() => setAnsicht('kanban')}><Columns3 size={14} />Kanban</Button>
          <Button size="sm" variant={ansicht === 'liste' ? 'primary' : 'ghost'} onClick={() => setAnsicht('liste')}><LayoutList size={14} />Liste</Button>
        </div>
      </div>

      {fehler && <p className="text-crit text-sm bg-crit-bg px-3 py-2 rounded-lg mb-3">{fehler}</p>}

      {/* Kanban: Spalten = offene Stages */}
      <div className={kanbanKlasse}>
        {/* Scrollleiste oben statt unter langen Spalten (Wunsch 09.11.2026):
            Container und Inhalt werden je einmal gespiegelt */}
        <div className="overflow-x-auto pb-3 -scale-y-100">
        <div className="flex gap-3 -scale-y-100">
          {STAGES.filter(s => s.offen).map(s => {
            // Neueste Bewerbung oben (Wunsch 03.11.2026); ohne Datum ans Ende
            const karten = offen.filter(o => o.stage === s.key)
              .sort((a, b) => (b.applied_on ?? '').localeCompare(a.applied_on ?? ''));
            return (
              <section
                key={s.key}
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (ueber !== s.key) setUeber(s.key); }}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setUeber(null); }}
                onDrop={e => { e.preventDefault(); setUeber(null); const id = e.dataTransfer.getData('text/plain'); if (id) void verschieben(id, s.key); }}
                className={`bg-well rounded-lg p-2.5 w-[250px] shrink-0 min-h-[220px] border-2 transition-colors ${ueber === s.key ? 'border-signal' : 'border-transparent'}`}
                aria-label={`Spalte ${s.label}`}
              >
                <header className="flex items-center justify-between px-1 pb-2">
                  <h3 className="label-mono">{s.label}</h3>
                  <span className="num text-[11.5px] text-ink-3">{karten.length}</span>
                </header>
                <div className="space-y-2">
                  {karten.map(karte)}
                  {karten.length === 0 && <p className="text-[11.5px] text-ink-3 px-1 py-4 text-center">Karte hierher ziehen</p>}
                </div>
              </section>
            );
          })}
        </div>
        </div>
        <p className="text-[12px] text-ink-3 mt-1">
          Karten zwischen den Spalten ziehen, um den Stand zu setzen. Gewonnen, Absage und Pausieren im Detail der Opportunity.
          {(geschlossen.gewonnen + geschlossen.verloren + geschlossen.pausiert) > 0 && (
            <> Abgeschlossene und pausierte zeigt die <button type="button" className="text-navy hover:underline" onClick={() => { setAnsicht('liste'); setAbgeschlossene(true); }}>Liste</button>.</>
          )}
        </p>
      </div>

      {/* Liste */}
      <div className={listeKlasse}>
        <Card padded={false}>
          <CardHeader title="Opportunities" border>
            <div className="flex flex-wrap items-center gap-3">
              <select aria-label="Stage" className={inpSm} value={stageFilter} onChange={e => setStageFilter(e.target.value as AcqStage | '')}>
                <option value="">Alle Stages</option>
                {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              {!stageFilter && (
                <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
                  <input type="checkbox" checked={abgeschlossene} onChange={e => setAbgeschlossene(e.target.checked)} />
                  auch gewonnene/abgesagte
                </label>
              )}
            </div>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr><Th>Opportunity</Th><Th>Art</Th><Th>Stage</Th><Th>Beworben</Th><Th>Nächste Aktion</Th></tr></thead>
              <tbody>
                {[...listenOpps]
                  .sort((a, b) => (a.next_action_on ?? '9').localeCompare(b.next_action_on ?? '9'))
                  .map(o => {
                    const f = faelligkeit(o, heute);
                    return (
                      <Tr key={o.id}>
                        <Td>
                          <Link href={`/akquise/${o.id}`} className="font-medium text-ink hover:underline">{o.title}</Link>
                          <span className="block text-[11.5px] text-ink-3">{firmaText(o, firmenMap)}</span>
                        </Td>
                        <Td><ArtBadge kind={o.kind} /></Td>
                        <Td><StageBadge stage={o.stage} kind={o.kind} /></Td>
                        <Td className="num text-[12.5px] text-ink-2">{datum(o.applied_on)}</Td>
                        <Td className={f === 'ueberfaellig' ? 'text-crit' : f === 'heute' ? 'text-warn' : 'text-ink-2'}>
                          {f === 'keine' ? '—' : <><span className="num text-[12.5px]">{datum(o.next_action_on)}</span> · {o.next_action || '—'}</>}
                        </Td>
                      </Tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}

/** Auswahl der Opportunity für „Gespräch notieren“ (Befehlspalette) */
function GespraechWaehlen({ opps, firmen }: { opps: AcqOpportunity[]; firmen: Map<string, FirmaKurz> }) {
  const router = useRouter();
  const [id, setId] = useState('');
  return (
    <Note className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <MessageSquarePlus size={16} className="shrink-0" />
        <span className="font-medium">Gespräch notieren – zu welcher Opportunity?</span>
        <select aria-label="Opportunity" className={`${inpSm} flex-1 min-w-[240px]`} value={id} onChange={e => setId(e.target.value)} autoFocus>
          <option value="">– wählen –</option>
          {opps.map(o => <option key={o.id} value={o.id}>{o.title} · {firmaText(o, firmen)}</option>)}
        </select>
        <Button size="sm" disabled={!id} onClick={() => router.push(`/akquise/${id}?erfassen=gespraech`)}>Weiter</Button>
      </div>
    </Note>
  );
}
