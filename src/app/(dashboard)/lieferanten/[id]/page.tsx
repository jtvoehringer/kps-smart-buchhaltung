export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import LieferantForm from '../LieferantForm';
import StammsatzRechnungen, { type StammsatzRechnung } from '../../StammsatzRechnungen';

export default async function LieferantBearbeitenPage({ params }: { params: Promise<{ id: string }> }) {
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

  const { data: supplier } = await admin
    .from('suppliers')
    .select('*')
    .eq('id', id)
    .eq('client_id', membership.client_id)
    .maybeSingle();

  if (!supplier) notFound();

  // Alle Eingangsrechnungen dieses Lieferanten
  const { data: rechnungen } = await admin
    .from('incoming_invoices')
    .select('id, invoice_number, invoice_date, due_date, status, amount_gross')
    .eq('client_id', membership.client_id)
    .eq('supplier_id', id)
    .order('invoice_date', { ascending: false });

  const zeilen: StammsatzRechnung[] = (rechnungen ?? []).map(r => ({
    id:      r.id,
    nummer:  r.invoice_number,
    datum:   r.invoice_date,
    faellig: r.due_date,
    status:  r.status,
    brutto:  Number(r.amount_gross),
    // Eingangsrechnungen haben keine eigene Detailseite
    href:    r.status === 'open' ? '/offene-posten' : undefined,
  }));

  const initial = {
    id:           supplier.id,
    name:         supplier.name          ?? '',
    contact_person: supplier.contact_person ?? '',
    street:       supplier.street        ?? '',
    zip:          supplier.zip           ?? '',
    city:         supplier.city          ?? '',
    country:      supplier.country       ?? 'Österreich',
    email:        supplier.email         ?? '',
    phone:        supplier.phone         ?? '',
    uid_number:   supplier.uid_number    ?? '',
    iban:         supplier.iban          ?? '',
    notes:        supplier.notes         ?? '',
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/lieferanten" className="text-gray-400 hover:text-gray-600 transition-colors text-sm">
          ← Lieferanten
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold text-[#35609E]">{supplier.name}</h1>
      </div>
      <LieferantForm clientId={membership.client_id} initial={initial} />

      <div className="mt-5">
        <StammsatzRechnungen
          titel="Eingangsrechnungen"
          zeilen={zeilen}
          leerText="Für diesen Lieferanten wurde noch keine Eingangsrechnung erfasst."
        />
      </div>
    </div>
  );
}
