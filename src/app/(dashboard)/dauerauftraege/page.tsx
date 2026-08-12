// Daueraufträge – /dauerauftraege
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import DauerauftraegeClient from './DauerauftraegeClient';
import { getMyClientId } from '@/lib/supabase/get-my-client';

export default async function DauerauftraegePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const clientId = await getMyClientId(supabase, user.id);
  const { data: client } = !clientId ? { data: null } : await supabase
    .from('clients')
    .select('id, company_name, booking_mode')
    .eq('id', clientId)
    .maybeSingle();

  if (!client) redirect('/dashboard');

  const { data: recurring } = await supabase
    .from('recurring_transactions')
    .select(`
      id, name, type, amount_net, vat_rate,
      interval, day_of_month, next_run_date, is_active,
      category_id,
      categories ( name )
    `)
    .eq('client_id', client.id)
    .order('name');

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, type, vat_rate')
    .order('type')
    .order('sort_order');

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand">Daueraufträge</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Wiederkehrende Buchungen – werden automatisch täglich verarbeitet
          </p>
        </div>
      </div>
      <DauerauftraegeClient
        recurring={recurring ?? []}
        bookingMode={client.booking_mode ?? 'netto'}
      />
    </div>
  );
}
