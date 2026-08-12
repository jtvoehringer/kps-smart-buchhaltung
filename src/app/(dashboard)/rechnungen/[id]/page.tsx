export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import RechnungDetailClient from './RechnungDetailClient';

export default async function RechnungDetailPage({ params }: { params: Promise<{ id: string }> }) {
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

  const [{ data: invoice }, { data: branding }, { data: mandant }, { data: incomeCategories }] = await Promise.all([
    admin.from('invoices')
      .select(`*, customers(id,name,contact_person,street,zip,city,country,uid_number,email)`)
      .eq('id', id)
      .eq('client_id', membership.client_id)
      .maybeSingle(),
    admin.from('client_branding').select('*')
      .eq('client_id', membership.client_id).maybeSingle(),
    // Firmenwortlaut und eigene UID für Kopf und Fußzeile
    admin.from('clients').select('company_name, uid_number')
      .eq('id', membership.client_id).maybeSingle(),
    // Bewusst über den RLS-gebundenen Client: "categories" hat keine
    // client_id, sondern tenant_id. Der Admin-Client würde die
    // Kategorien aller Kanzleien liefern.
    supabase.from('categories')
      .select('id, name, type, vat_rate')
      .eq('type', 'income')
      .order('sort_order'),
  ]);

  if (!invoice) notFound();

  const { data: attachments } = await admin
    .from('invoice_attachments')
    .select('id, file_name, storage_path, mime_type, file_size, created_at')
    .eq('invoice_id', id)
    .eq('client_id', membership.client_id)
    .order('created_at', { ascending: true });

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/rechnungen" className="text-gray-400 hover:text-gray-600 transition-colors text-sm">
          ← Rechnungen
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold text-[#35609E]">
          {invoice.invoice_number || 'Entwurf'}
        </h1>
      </div>
      <RechnungDetailClient
        attachments={attachments ?? []}
        invoice={invoice}
        branding={branding ?? null}
        incomeCategories={incomeCategories ?? []}
        senderCompanyName={mandant?.company_name ?? ''}
        senderUid={mandant?.uid_number ?? null}
      />
    </div>
  );
}
