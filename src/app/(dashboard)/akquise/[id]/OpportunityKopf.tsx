'use client';

// Kopf der Opportunity (Welle 9a): klickbarer Stage-Stepper und die
// Abschlüsse Gewonnen → Kunde anlegen, Absage (vom Kunden oder eigene,
// mit Grund – letzter Schritt im Stepper), Pausieren (mit Wiedervorlage).
// Jede Änderung hinterlässt eine Aktivität.

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CirclePause, Trophy } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ABSAGE_VON_LABEL, STAGES, addWerktage, defaultProbability, isoDatum, stageLabel } from '@/lib/akquise';
import type { AcqCompany, AcqLostBy, AcqOpportunity, AcqPerson, AcqStage } from '@/lib/supabase/database.types';
import { Button, Card, Note } from '@/components/ui';
import { datum, inp, lbl } from '../shared';

type Dialog = null | 'gewonnen' | 'verloren' | 'pausiert';

export default function OpportunityKopf({
  clientId, opp, firma, endkunde, kontakt,
}: {
  clientId: string;
  opp: AcqOpportunity;
  firma: AcqCompany | null;
  endkunde: AcqCompany | null;
  kontakt: AcqPerson | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const heute = isoDatum();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState('');
  const [grund, setGrund] = useState('');
  const [absageVon, setAbsageVon] = useState<AcqLostBy>('kunde');
  const [wiedervorlage, setWiedervorlage] = useState(addWerktage(heute, 20));
  const [kundeAus, setKundeAus] = useState<'firma' | 'endkunde'>(firma ? 'firma' : 'endkunde');

  const rang = STAGES.findIndex(s => s.key === opp.stage);
  const abgeschlossen = opp.stage === 'gewonnen' || opp.stage === 'verloren';

  async function notiz(summary: string, kind: 'notiz' | 'zusage' | 'absage' = 'notiz', direction: 'ein' | 'aus' = 'ein') {
    await supabase.from('acq_activities').insert({
      client_id: clientId, opportunity_id: opp.id, kind, summary,
      direction: kind === 'notiz' ? null : direction,
    });
  }

  async function stageSetzen(ziel: AcqStage) {
    if (ziel === opp.stage || laeuft) return;
    setLaeuft(true); setFehler('');
    const { error } = await supabase.from('acq_opportunities').update({
      stage: ziel,
      probability: defaultProbability(ziel),
      next_action_on: opp.next_action_on ?? heute,
      closed_on: null,
    }).eq('id', opp.id);
    if (error) { setFehler(error.message); setLaeuft(false); return; }
    await notiz(`Stage geändert: ${stageLabel(opp.stage, opp.kind)} → ${stageLabel(ziel, opp.kind)}`);
    router.refresh();
  }

  async function gewinnen() {
    const quelle = kundeAus === 'endkunde' ? endkunde : firma;
    setLaeuft(true); setFehler('');
    let kundeId = quelle?.customer_id ?? null;
    if (!kundeId) {
      const kontaktName = kontakt ? [kontakt.first_name, kontakt.last_name].filter(Boolean).join(' ') : null;
      const { data: k, error } = await supabase.from('customers').insert({
        client_id: clientId,
        name: quelle?.name ?? opp.title,
        contact_person: kundeAus === 'firma' ? kontaktName || null : null,
        email: kundeAus === 'firma' ? kontakt?.email ?? null : null,
        phone: kundeAus === 'firma' ? kontakt?.phone ?? null : null,
        city: quelle?.city ?? null,
        country: quelle?.country ?? 'AT',
        notes: `Aus der Akquise: ${opp.title}${opp.reference ? ` (Ref. ${opp.reference})` : ''}`,
      }).select('id').single();
      if (error || !k) { setFehler(error?.message ?? 'Kunde konnte nicht angelegt werden.'); setLaeuft(false); return; }
      kundeId = k.id;
      if (quelle) await supabase.from('acq_companies').update({ customer_id: kundeId }).eq('id', quelle.id);
    }
    const { error } = await supabase.from('acq_opportunities').update({
      stage: 'gewonnen', probability: 100, closed_on: heute, customer_id: kundeId,
    }).eq('id', opp.id);
    if (error) { setFehler(error.message); setLaeuft(false); return; }
    await notiz('Gewonnen – als Kunde angelegt', 'zusage');
    router.refresh();
  }

  async function verlieren() {
    if (!grund.trim()) { setFehler('Bitte einen Grund angeben – er fließt später in die Auswertung.'); return; }
    setLaeuft(true); setFehler('');
    const { error } = await supabase.from('acq_opportunities').update({
      stage: 'verloren', probability: 0, closed_on: heute, lost_reason: grund.trim(), lost_by: absageVon,
    }).eq('id', opp.id);
    if (error) { setFehler(error.message); setLaeuft(false); return; }
    await notiz(`${ABSAGE_VON_LABEL[absageVon]}: ${grund.trim()}`, 'absage', absageVon === 'eigene' ? 'aus' : 'ein');
    router.refresh();
  }

  async function pausieren() {
    if (!wiedervorlage) { setFehler('Wiedervorlage-Datum fehlt.'); return; }
    setLaeuft(true); setFehler('');
    const { error } = await supabase.from('acq_opportunities').update({
      stage: 'pausiert', probability: null, next_action: 'Wiedervorlage', next_action_on: wiedervorlage, closed_on: null,
    }).eq('id', opp.id);
    if (error) { setFehler(error.message); setLaeuft(false); return; }
    await notiz(`Pausiert bis ${datum(wiedervorlage)}`);
    router.refresh();
  }

  return (
    <Card className="space-y-4">
      {/* Stepper: offene Stages anklickbar */}
      <ol className="flex flex-wrap gap-1.5" aria-label="Stage">
        {STAGES.filter(s => s.offen).map((s, i) => {
          const aktiv = s.key === opp.stage;
          const erledigt = !abgeschlossen && opp.stage !== 'pausiert' && i < rang;
          return (
            <li key={s.key}>
              <button
                type="button"
                disabled={laeuft}
                onClick={() => stageSetzen(s.key)}
                aria-current={aktiv ? 'step' : undefined}
                className={`px-3 py-1.5 rounded-md text-[12.5px] font-medium border transition-colors ${
                  aktiv ? 'bg-navy border-navy text-white'
                    : erledigt ? 'bg-info-bg border-info-line text-navy hover:bg-well'
                    : 'bg-card border-line-2 text-ink-2 hover:bg-row'
                }`}
              >
                <span className="num text-[11px] opacity-70 mr-1">{i + 1}</span>{stageLabel(s.key, opp.kind)}
              </button>
            </li>
          );
        })}
        {/* Absage: letzter Schritt, öffnet die Erfassung (wer, warum) */}
        <li>
          <button
            type="button"
            disabled={laeuft || opp.stage === 'verloren'}
            onClick={() => setDialog(dialog === 'verloren' ? null : 'verloren')}
            aria-current={opp.stage === 'verloren' ? 'step' : undefined}
            className={`px-3 py-1.5 rounded-md text-[12.5px] font-medium border transition-colors ${
              opp.stage === 'verloren' ? 'bg-crit border-crit text-white'
                : dialog === 'verloren' ? 'bg-crit-bg border-crit text-crit'
                : 'bg-card border-line-2 text-crit hover:bg-crit-bg'
            }`}
          >
            {stageLabel('verloren')}
          </button>
        </li>
      </ol>

      {abgeschlossen && (
        <Note tone={opp.stage === 'gewonnen' ? 'good' : 'crit'}>
          {opp.stage === 'gewonnen' ? 'Gewonnen' : opp.lost_by ? ABSAGE_VON_LABEL[opp.lost_by] : 'Absage'} am {datum(opp.closed_on)}
          {opp.stage === 'verloren' && opp.lost_reason && <> – {opp.lost_reason}</>}
          {opp.customer_id && <> · <Link href={`/kunden/${opp.customer_id}`} className="underline">zum Kunden</Link></>}
          . Ein Klick auf eine Stage oben nimmt die Opportunity wieder auf.
        </Note>
      )}
      {opp.stage === 'pausiert' && (
        <Note tone="warn">Pausiert – Wiedervorlage am {datum(opp.next_action_on)}. Ein Klick auf eine Stage nimmt sie wieder auf.</Note>
      )}

      <div className="flex flex-wrap gap-2">
        {opp.stage !== 'gewonnen' && (
          <Button size="sm" variant="secondary" onClick={() => setDialog(dialog === 'gewonnen' ? null : 'gewonnen')}><Trophy size={14} />Gewonnen → Kunde anlegen</Button>
        )}
        {opp.stage !== 'pausiert' && !abgeschlossen && (
          <Button size="sm" variant="ghost" onClick={() => setDialog(dialog === 'pausiert' ? null : 'pausiert')}><CirclePause size={14} />Pausieren</Button>
        )}
      </div>

      {dialog === 'gewonnen' && (
        <div className="border border-line rounded-lg p-4 bg-row space-y-3">
          <p className="text-[13px] text-ink-2">
            Legt einen Kunden in der Fakturierung an (oder verwendet den bereits verknüpften), setzt die Stage auf „Gewonnen“ und notiert eine Zusage.
          </p>
          {firma && endkunde && (
            <div>
              <label htmlFor="kunde-aus" className={lbl}>Rechnungsempfänger</label>
              <select id="kunde-aus" className={inp} value={kundeAus} onChange={e => setKundeAus(e.target.value as 'firma' | 'endkunde')}>
                <option value="firma">{firma.name} (Vermittler/Firma)</option>
                <option value="endkunde">{endkunde.name} (Endkunde)</option>
              </select>
            </div>
          )}
          {(kundeAus === 'endkunde' ? endkunde : firma)?.customer_id && (
            <p className="text-[12.5px] text-ink-3">Diese Firma ist bereits als Kunde verknüpft – es wird kein neuer angelegt.</p>
          )}
          <Button size="sm" disabled={laeuft} onClick={gewinnen}>{laeuft ? 'Speichern …' : 'Als gewonnen buchen'}</Button>
        </div>
      )}
      {dialog === 'verloren' && (
        <div className="border border-line rounded-lg p-4 bg-row space-y-3">
          <fieldset>
            <legend className={lbl}>Wer hat abgesagt?</legend>
            <div className="flex flex-wrap gap-4 text-[13px] text-ink">
              {(['kunde', 'eigene'] as const).map(v => (
                <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="absage-von" value={v} checked={absageVon === v} onChange={() => setAbsageVon(v)} />
                  {ABSAGE_VON_LABEL[v]}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="verlust" className={lbl}>Grund <span className="text-crit">*</span></label>
            <input id="verlust" className={inp} value={grund} onChange={e => setGrund(e.target.value)}
              placeholder={absageVon === 'eigene'
                ? 'z. B. Tagessatz zu niedrig, Projekt passt nicht, anderes Projekt zugesagt'
                : 'z. B. Tagessatz zu hoch, Projekt intern besetzt, keine Rückmeldung'} autoFocus />
          </div>
          <Button size="sm" variant="danger" disabled={laeuft} onClick={verlieren}>Absage speichern</Button>
        </div>
      )}
      {dialog === 'pausiert' && (
        <div className="border border-line rounded-lg p-4 bg-row space-y-3">
          <div className="max-w-[220px]">
            <label htmlFor="wv" className={lbl}>Wiedervorlage am</label>
            <input id="wv" type="date" className={inp} value={wiedervorlage} onChange={e => setWiedervorlage(e.target.value)} />
          </div>
          <Button size="sm" variant="secondary" disabled={laeuft} onClick={pausieren}>Pausieren</Button>
        </div>
      )}

      {fehler && <p className="text-crit text-sm bg-crit-bg px-3 py-2 rounded-lg">{fehler}</p>}
    </Card>
  );
}
