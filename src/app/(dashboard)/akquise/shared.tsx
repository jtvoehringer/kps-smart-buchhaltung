// Gemeinsame Bausteine der Akquise-Seiten (Welle 9): Datumsanzeige,
// Badges für Stage/Art, Firmenzeile „Vermittler → Endkunde“, Formularklassen.
import { Badge } from '@/components/ui';
import { ART_LABEL, stageInfo, stageLabel } from '@/lib/akquise';
import type { AcqActivity, AcqCompany, AcqOpportunity, AcqOpportunityKind, AcqStage } from '@/lib/supabase/database.types';

export type AktivitaetKurz = Pick<AcqActivity, 'opportunity_id' | 'kind' | 'occurred_at' | 'direction'>;
export type FirmaKurz = Pick<AcqCompany, 'id' | 'name' | 'kind'>;

export const datum = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? iso + 'T00:00:00' : iso).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

export const datumKurz = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? iso + 'T00:00:00' : iso).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' }) : '—';

export function StageBadge({ stage, kind }: { stage: AcqStage; kind?: AcqOpportunityKind }) {
  return <Badge tone={stageInfo(stage).tone}>{stageLabel(stage, kind)}</Badge>;
}

export function ArtBadge({ kind }: { kind: AcqOpportunityKind }) {
  return <Badge tone={kind === 'festanstellung' ? 'navy' : kind === 'projekt' ? 'info' : 'gray'}>{ART_LABEL[kind]}</Badge>;
}

/** „Vermittler → Endkunde“; in der Suite immer mit Endkunde, auch wenn vertraulich */
export function firmaText(o: Pick<AcqOpportunity, 'company_id' | 'end_company_id'>, firmen: Map<string, Pick<AcqCompany, 'name'>>) {
  const f = o.company_id ? firmen.get(o.company_id)?.name : null;
  const e = o.end_company_id ? firmen.get(o.end_company_id)?.name : null;
  if (f && e) return `${f} → ${e}`;
  return f ?? e ?? 'ohne Firma';
}

export const inp = 'w-full border border-line-2 rounded-lg px-3.5 py-2.5 text-sm bg-card focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30';
export const inpSm = 'border border-line-2 rounded-md px-2.5 py-1.5 text-[13px] bg-card focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30';
export const lbl = 'text-xs font-medium text-ink-2 block mb-1';

/** Standard-Richtung je Aktivitätsart (aus = ich, ein = die anderen) */
export const RICHTUNG: Record<string, 'aus' | 'ein' | null> = {
  bewerbung: 'aus', followup: 'aus', antwort: 'ein', gespraech: null, interview: null,
  angebot: 'ein', absage: 'ein', zusage: 'ein', notiz: null, linkedin: 'aus',
};
