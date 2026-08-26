export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import RechnungForm from '../RechnungForm';

export default async function NeueRechnungPage() {
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

  const [{ data: customers }, { data: branding }, { data: client }] = await Promise.all([
    admin.from('customers').select('id,name,contact_person,payment_days,street,zip,city,country,uid_number,email')
      .eq('client_id', membership.client_id).eq('is_active', true).order('name'),
    admin.from('client_branding').select('invoice_prefix,invoice_next_nr,invoice_nr_digits,payment_days')
      .eq('client_id', membership.client_id).maybeSingle(),
    admin.from('clients').select('booking_mode').eq('id', membership.client_id).maybeSingle(),
  ]);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/rechnungen" className="text-ink-3 hover:text-navy transition-colors text-sm">
          ← Rechnungen
        </Link>
        <span className="text-ink-3">/</span>
        <h1 className="text-2xl font-semibold text-navy tracking-[-0.01em]">Neue Rechnung</h1>
      </div>
      {(!customers || customers.length === 0) ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-700">
          <p className="font-semibold mb-1">Noch keine Kunden angelegt</p>
          <p>Bitte zuerst mindestens einen Kunden anlegen.</p>
          <Link href="/kunden/neu" className="inline-block mt-3 bg-navy text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-navy-2 transition-colors">
            Kunden anlegen
          </Link>
        </div>
      ) : (
        <RechnungForm
          clientId={membership.client_id}
          customers={customers}
          branding={branding ?? null}
          bookingMode={client?.booking_mode ?? 'netto'}
        />
      )}
    </div>
  );
}
