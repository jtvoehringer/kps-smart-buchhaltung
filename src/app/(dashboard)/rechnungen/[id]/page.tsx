export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import RechnungDetailClient from './RechnungDetailClient';

export default async function RechnungDetailPage({ params }: { params: Promise<{ id: string }> }) {
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

  const [{ data: invoice }, { data: customers }, { data: branding }] = await Promise.all([
    admin.from('invoices')
      .select(`*, customers(id,name,company_name,street,zip,city,country,uid_number,email)`)
      .eq('id', params.id)
      .eq('client_id', membership.client_id)
      .maybeSingle(),
    admin.from('customers')
      .select('id,name,company_name,street,zip,city,country,uid_number,email')
      .eq('client_id', membership.client_id).eq('is_active', true).order('name'),
    admin.from('client_branding').select('*')
      .eq('client_id', membership.client_id).maybeSingle(),
  ]);

  if (!invoice) notFound();

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/rechnungen" className="text-gray-400 hover:text-gray-600 transition-colors text-sm">
          ← Rechnungen
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold text-[#1B3A6B]">
          {invoice.invoice_number || 'Entwurf'}
        </h1>
      </div>
      <RechnungDetailClient
        invoice={invoice}
        customers={customers ?? []}
        branding={branding ?? null}
        clientId={membership.client_id}
      />
    </div>
  );
}
