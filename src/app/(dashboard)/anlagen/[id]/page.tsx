export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMyClientId } from '@/lib/supabase/get-my-client';
import AnlageForm, { type AnlageInput } from '../AnlageForm';

export default async function AnlagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const clientId = await getMyClientId(supabase, user.id);
  if (!clientId) redirect('/dashboard');

  const { data: a } = await supabase.from('assets').select('*').eq('id', id).eq('client_id', clientId).maybeSingle();
  if (!a) notFound();

  const betrag = (n: number | null) => n == null ? '' : Number(n).toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const initial: AnlageInput = {
    id: a.id,
    name: a.name,
    asset_group: a.asset_group ?? '',
    konto_nr: a.konto_nr ?? '',
    acquired_on: a.acquired_on,
    cost_net: betrag(a.cost_net),
    useful_life_years: String(a.useful_life_years),
    method: a.method,
    degressive_rate: a.degressive_rate == null ? '30' : String(a.degressive_rate),
    residual_value: betrag(a.residual_value),
    disposed_on: a.disposed_on ?? '',
    disposal_proceeds: betrag(a.disposal_proceeds),
    notes: a.notes ?? '',
  };

  return (
    <div className="px-6 py-7 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/anlagen" className="text-ink-3 hover:text-navy transition-colors text-sm">← Anlagenverzeichnis</Link>
        <span className="text-ink-3">/</span>
        <h1 className="text-2xl font-semibold text-navy tracking-[-0.01em] truncate">{a.name}</h1>
      </div>
      <AnlageForm clientId={clientId} initial={initial} />
    </div>
  );
}
