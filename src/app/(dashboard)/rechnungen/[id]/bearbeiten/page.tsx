export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import RechnungForm from '../../RechnungForm';

export default async function RechnungBearbeitenPage({ params }: { params: Promise<{ id: string }> }) {
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

  const [{ data: invoice }, { data: customers }, { data: branding }, { data: client }] = await Promise.all([
    admin.from('invoices').select('*')
      .eq('id', id)
      .eq('client_id', membership.client_id)
      .maybeSingle(),
    admin.from('customers')
      .select('id,name,contact_person,payment_days,street,zip,city,country,uid_number,email')
      .eq('client_id', membership.client_id).eq('is_active', true).order('name'),
    admin.from('client_branding')
      .select('invoice_prefix,invoice_next_nr,invoice_nr_digits,payment_days')
      .eq('client_id', membership.client_id).maybeSingle(),
    admin.from('clients').select('booking_mode').eq('id', membership.client_id).maybeSingle(),
  ]);

  if (!invoice) notFound();
  // Nur Entwürfe dürfen bearbeitet werden
  if (invoice.status !== 'draft') redirect(`/rechnungen/${id}`);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/rechnungen/${id}`}
          className="text-ink-3 hover:text-navy transition-colors text-sm">
          ← Rechnung
        </Link>
        <span className="text-ink-3">/</span>
        <h1 className="text-2xl font-semibold text-navy tracking-[-0.01em]">Entwurf bearbeiten</h1>
      </div>
      <RechnungForm
        clientId={membership.client_id}
        customers={customers ?? []}
        branding={branding ?? null}
        bookingMode={client?.booking_mode ?? 'netto'}
        existing={{
          id:              invoice.id,
          invoice_number:  invoice.invoice_number ?? '',
          contact_person:  invoice.contact_person ?? '',
          invoice_date:    invoice.invoice_date,
          due_date:        invoice.due_date,
          status:          invoice.status,
          items:           invoice.items ?? [],
          notes:           invoice.notes ?? null,
          footer_override: invoice.footer_override ?? null,
          customer_id:     invoice.customer_id ?? null,
          total_net:       invoice.total_net,
          total_vat:       invoice.total_vat,
          total_gross:     invoice.total_gross,
        }}
      />
    </div>
  );
}
