export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMyClientId } from '@/lib/supabase/get-my-client';
import type { FirmaKurz } from '../shared';
import NeuForm from './NeuForm';

export default async function NeueOpportunityPage({ searchParams }: { searchParams: Promise<{ firma?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const clientId = await getMyClientId(supabase, user.id);
  if (!clientId) redirect('/dashboard');

  const { firma } = await searchParams;
  const { data } = await supabase.from('acq_companies').select('id, name, kind').eq('client_id', clientId).order('name');
  const firmen = (data ?? []) as FirmaKurz[];

  return (
    <div className="px-6 py-7 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/akquise" className="text-ink-3 hover:text-navy transition-colors text-sm">← Pipeline</Link>
        <span className="text-ink-3">/</span>
        <h1 className="text-2xl font-semibold text-navy tracking-[-0.01em]">Opportunity anlegen</h1>
      </div>
      <NeuForm clientId={clientId} firmen={firmen} vorbelegung={firmen.find(f => f.id === firma)?.name ?? ''} />
    </div>
  );
}
