export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeftRight, CreditCard } from 'lucide-react';
import KontenClient from './KontenClient';

export default async function KontenPage() {
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

  const { data: accounts } = await admin
    .from('accounts')
    .select('*')
    .eq('client_id', membership.client_id)
    .eq('is_active', true)
    .order('name');

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-navy tracking-[-0.01em] flex items-center gap-2">
            <CreditCard size={24} strokeWidth={1.75} className="text-navy" />
            Konten
          </h1>
          <p className="text-ink-2 text-sm">Kontokorrent, Kreditkarte, Kreditkonto – Grundlage für Bank-Import und Kontoabstimmung</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/konten/umbuchung"
            className="inline-flex items-center gap-1.5 border border-line-2 text-ink hover:bg-row text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
          >
            <ArrowLeftRight size={15} strokeWidth={2} />
            Umbuchung erfassen
          </Link>
          <Link
            href="/konten/neu"
            className="bg-navy hover:bg-navy-2 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
          >
            + Neues Konto
          </Link>
        </div>
      </div>
      <KontenClient accounts={accounts ?? []} />
    </div>
  );
}
