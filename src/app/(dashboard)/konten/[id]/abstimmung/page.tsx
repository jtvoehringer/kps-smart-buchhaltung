export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { Scale } from 'lucide-react';
import AbstimmungClient from './AbstimmungClient';

export default async function KontoabstimmungPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  const { data: account } = await admin
    .from('accounts')
    .select('*')
    .eq('id', id)
    .eq('client_id', membership.client_id)
    .maybeSingle();

  if (!account) notFound();

  const { data: transactions } = await admin
    .from('transactions')
    .select('id, booking_date, description, type, amount_gross, is_private, is_reconciled, category:categories(name)')
    .eq('client_id', membership.client_id)
    .eq('account_id', id)
    .order('booking_date', { ascending: false });

  const rows = (transactions ?? []).map(t => ({
    ...t,
    category: Array.isArray(t.category) ? (t.category[0] ?? null) : t.category,
  }));

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/konten" className="text-gray-400 hover:text-gray-600 transition-colors text-sm">
          ← Konten
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold text-[#35609E] flex items-center gap-2">
          <Scale size={22} strokeWidth={1.75} className="text-accent-dark" />
          Kontoabstimmung – {account.name}
        </h1>
      </div>
      <AbstimmungClient accountName={account.name} rows={rows} />
    </div>
  );
}
