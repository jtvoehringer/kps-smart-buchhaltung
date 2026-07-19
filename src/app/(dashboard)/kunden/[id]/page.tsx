export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import KundeForm from '../KundeForm';

export default async function KundeBearbeitenPage({ params }: { params: Promise<{ id: string }> }) {
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

  const { data: customer } = await admin
    .from('customers')
    .select('*')
    .eq('id', id)
    .eq('client_id', membership.client_id)
    .maybeSingle();

  if (!customer) notFound();

  const initial = {
    id:           customer.id,
    name:         customer.name          ?? '',
    company_name: customer.company_name  ?? '',
    street:       customer.street        ?? '',
    zip:          customer.zip           ?? '',
    city:         customer.city          ?? '',
    country:      customer.country       ?? 'Österreich',
    email:        customer.email         ?? '',
    phone:        customer.phone         ?? '',
    uid_number:   customer.uid_number    ?? '',
    notes:        customer.notes         ?? '',
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/kunden" className="text-gray-400 hover:text-gray-600 transition-colors text-sm">
          ← Kunden
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold text-[#1B3A6B]">{customer.name}</h1>
      </div>
      <KundeForm clientId={membership.client_id} initial={initial} />
    </div>
  );
}
