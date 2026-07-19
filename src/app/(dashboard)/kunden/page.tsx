export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import KundenClient from './KundenClient';

export default async function KundenPage() {
  const supabase = await createClient();
  // Modul-Schutz wird weiter unten nach membership-Load geprüft
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  const { data: membership } = await admin
    .from('client_memberships')
    .select('client_id')
    .eq('user_id', user.id)
    .order('created_at')
    .limit(1)
    .maybeSingle();

  if (!membership?.client_id) redirect('/dashboard');

  // Modul-Schutz
  const { data: clientData } = await admin
    .from('clients').select('modules_enabled').eq('id', membership.client_id).maybeSingle();
  const modules: string[] = (clientData as { modules_enabled?: string[] } | null)?.modules_enabled ?? [];
  if (!modules.includes('invoicing')) redirect('/dashboard');

  const { data: customers } = await admin
    .from('customers')
    .select('*')
    .eq('client_id', membership.client_id)
    .eq('is_active', true)
    .order('name');

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#35609E]">Kunden</h1>
          <p className="text-gray-500 text-sm">{customers?.length ?? 0} aktive Kunden</p>
        </div>
        <Link
          href="/kunden/neu"
          className="bg-[#35609E] hover:bg-[#4F90E8] text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          + Neuer Kunde
        </Link>
      </div>
      <KundenClient customers={customers ?? []} clientId={membership.client_id} />
    </div>
  );
}
