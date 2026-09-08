export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMyClientId } from '@/lib/supabase/get-my-client';
import AnlageForm, { type AnlageInput } from '../AnlageForm';
import { ladeBuchungsKandidaten } from '../kandidaten';

export default async function NeueAnlagePage({ searchParams }: { searchParams: Promise<{ buchung?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const clientId = await getMyClientId(supabase, user.id);
  if (!clientId) redirect('/dashboard');

  const { buchung } = await searchParams;
  const kandidaten = await ladeBuchungsKandidaten(supabase, clientId);
  const vorlage = buchung ? kandidaten.find(k => k.id === buchung) : undefined;
  const initial: AnlageInput | undefined = vorlage ? {
    transaction_id: vorlage.id,
    name: vorlage.description ?? '',
    asset_group: '', konto_nr: '',
    acquired_on: vorlage.booking_date,
    cost_net: Number(vorlage.amount_net).toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    useful_life_years: '3', method: Number(vorlage.amount_net) <= 1000 ? 'gwg' : 'linear', degressive_rate: '30', residual_value: '0',
    disposed_on: '', disposal_proceeds: '', notes: '',
  } : undefined;

  return (
    <div className="px-6 py-7 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/anlagen" className="text-ink-3 hover:text-navy transition-colors text-sm">← Anlagenverzeichnis</Link>
        <span className="text-ink-3">/</span>
        <h1 className="text-2xl font-semibold text-navy tracking-[-0.01em]">Anlage erfassen</h1>
      </div>
      <AnlageForm clientId={clientId} initial={initial} buchungen={kandidaten} />
    </div>
  );
}
