export const dynamic = 'force-dynamic';

// Akquise-Pipeline – /akquise (Welle 9a)
// Kanban (Desktop) bzw. Liste (mobil) aller Opportunities mit nächster
// Aktion. Rechenlogik: src/lib/akquise.ts

import { redirect } from 'next/navigation';
import { Plus, SquareKanban } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getMyClientId } from '@/lib/supabase/get-my-client';
import type { AcqOpportunity } from '@/lib/supabase/database.types';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import { Button } from '@/components/ui';
import PipelineClient from './PipelineClient';
import type { AktivitaetKurz, FirmaKurz } from './shared';

export default async function AkquisePage({ searchParams }: { searchParams: Promise<{ aktion?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const clientId = await getMyClientId(supabase, user.id);
  if (!clientId) redirect('/dashboard');

  const [{ data: opps }, { data: firmen }, { data: akt }] = await Promise.all([
    supabase.from('acq_opportunities').select('*').eq('client_id', clientId).order('next_action_on', { ascending: true }),
    supabase.from('acq_companies').select('id, name, kind').eq('client_id', clientId).order('name'),
    supabase.from('acq_activities').select('opportunity_id, kind, occurred_at, direction').eq('client_id', clientId),
  ]);
  const { aktion } = await searchParams;

  return (
    <div className="px-6 py-7 max-w-[1400px] mx-auto">
      <PageHeader
        title="Akquise-Pipeline"
        subtitle="Bewerbungen und Projekte mit Stand und nächster Aktion – jede offene Opportunity hat genau eine"
        icon={SquareKanban}
      >
        <Button href="/akquise/neu"><Plus size={16} strokeWidth={2.5} />Opportunity anlegen</Button>
      </PageHeader>

      {(opps ?? []).length === 0 ? (
        <EmptyState
          icon={SquareKanban}
          text="Noch keine Opportunity erfasst."
          hinweis="Bestehende Bewerbungen einmalig mit scripts/akquise-import.ts übernehmen – oder die erste hier anlegen."
          href="/akquise/neu"
          cta="Erste Opportunity anlegen"
        />
      ) : (
        <PipelineClient
          clientId={clientId}
          initialOpps={(opps ?? []) as AcqOpportunity[]}
          firmen={(firmen ?? []) as FirmaKurz[]}
          initialAktivitaeten={(akt ?? []) as AktivitaetKurz[]}
          gespraechWaehlen={aktion === 'gespraech'}
        />
      )}
    </div>
  );
}
