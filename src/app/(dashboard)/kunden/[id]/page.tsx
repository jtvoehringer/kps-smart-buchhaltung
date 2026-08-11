export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import KundeForm from '../KundeForm';
import StammsatzRechnungen, { type StammsatzRechnung } from '../../StammsatzRechnungen';

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

  // Alle Rechnungen dieses Kunden – Grundlage für die Auswertung je Kunde
  const { data: rechnungen } = await admin
    .from('invoices')
    .select('id, invoice_number, invoice_date, due_date, status, total_gross')
    .eq('client_id', membership.client_id)
    .eq('customer_id', id)
    .order('invoice_date', { ascending: false });

  const zeilen: StammsatzRechnung[] = (rechnungen ?? []).map(r => ({
    id:      r.id,
    nummer:  r.invoice_number,
    datum:   r.invoice_date,
    faellig: r.due_date,
    status:  r.status,
    brutto:  Number(r.total_gross),
    href:    `/rechnungen/${r.id}`,
  }));

  const initial = {
    id:           customer.id,
    name:         customer.name          ?? '',
    contact_person: customer.contact_person ?? '',
    payment_days:   customer.payment_days ?? 14,
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
        <h1 className="text-2xl font-bold text-[#35609E]">{customer.name}</h1>
      </div>
      <KundeForm clientId={membership.client_id} initial={initial} />

      <div className="mt-5">
        <StammsatzRechnungen
          titel="Rechnungen"
          zeilen={zeilen}
          leerText="Für diesen Kunden wurde noch keine Rechnung erstellt."
        />
      </div>
    </div>
  );
}
