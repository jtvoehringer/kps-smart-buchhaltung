export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Truck } from 'lucide-react';
import LieferantenClient from './LieferantenClient';

export default async function LieferantenPage() {
  const supabase = await createClient();
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

  const { data: suppliers } = await admin
    .from('suppliers')
    .select('*')
    .eq('client_id', membership.client_id)
    .eq('is_active', true)
    .order('name');

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-navy tracking-[-0.01em] flex items-center gap-2">
            <Truck size={24} strokeWidth={1.75} className="text-navy" />
            Lieferanten
          </h1>
          <p className="text-ink-2 text-sm">{suppliers?.length ?? 0} aktive Lieferanten</p>
        </div>
        <Link
          href="/lieferanten/neu"
          className="bg-navy hover:bg-navy-2 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          + Neuer Lieferant
        </Link>
      </div>
      <LieferantenClient suppliers={suppliers ?? []} clientId={membership.client_id} />
    </div>
  );
}
