export const dynamic = 'force-dynamic';

// Opportunity-Detail – /akquise/[id] (Welle 9a): Stage-Stepper, Stammdaten,
// Timeline der Aktivitäten mit Schnellerfassung, Gewonnen/Verloren/Pausieren.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMyClientId } from '@/lib/supabase/get-my-client';
import type { AcqActivity, AcqCompany, AcqOpportunity, AcqPerson } from '@/lib/supabase/database.types';
import { ArtBadge, StageBadge } from '../shared';
import OpportunityKopf from './OpportunityKopf';
import StammdatenForm from './StammdatenForm';
import Timeline from './Timeline';

export default async function OpportunityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erfassen?: string }>;
}) {
  const { id } = await params;
  const { erfassen } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const clientId = await getMyClientId(supabase, user.id);
  if (!clientId) redirect('/dashboard');

  const { data: o } = await supabase.from('acq_opportunities').select('*').eq('id', id).eq('client_id', clientId).maybeSingle();
  if (!o) notFound();
  const opp = o as AcqOpportunity;

  const firmenIds = [opp.company_id, opp.end_company_id].filter((x): x is string => !!x);
  const [{ data: firmen }, { data: personen }, { data: akt }] = await Promise.all([
    supabase.from('acq_companies').select('*').eq('client_id', clientId).order('name'),
    firmenIds.length
      ? supabase.from('acq_people').select('*').in('company_id', firmenIds).order('last_name')
      : Promise.resolve({ data: [] as AcqPerson[] }),
    supabase.from('acq_activities').select('*').eq('opportunity_id', id).order('occurred_at', { ascending: false }),
  ]);
  const alleFirmen = (firmen ?? []) as AcqCompany[];

  return (
    <div className="px-6 py-7 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Link href="/akquise" className="text-ink-3 hover:text-navy transition-colors text-sm">← Pipeline</Link>
        <span className="text-ink-3">/</span>
        <h1 className="text-2xl font-semibold text-navy tracking-[-0.01em] min-w-0">{opp.title}</h1>
        <StageBadge stage={opp.stage} kind={opp.kind} />
        <ArtBadge kind={opp.kind} />
      </div>

      <OpportunityKopf
        key={`kopf-${opp.updated_at}`}
        clientId={clientId}
        opp={opp}
        firma={alleFirmen.find(f => f.id === opp.company_id) ?? null}
        endkunde={alleFirmen.find(f => f.id === opp.end_company_id) ?? null}
        kontakt={((personen ?? []) as AcqPerson[]).find(p => p.id === opp.contact_id) ?? null}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-5 items-start mt-5">
        <StammdatenForm
          key={`form-${opp.updated_at}`}
          clientId={clientId}
          opp={opp}
          firmen={alleFirmen.map(f => ({ id: f.id, name: f.name, kind: f.kind }))}
          personen={(personen ?? []) as AcqPerson[]}
        />
        <Timeline
          clientId={clientId}
          opp={opp}
          aktivitaeten={(akt ?? []) as AcqActivity[]}
          startArt={erfassen === 'gespraech' ? 'gespraech' : undefined}
        />
      </div>
    </div>
  );
}
