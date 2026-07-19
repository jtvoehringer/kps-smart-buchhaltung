// Neuen Dauerauftrag anlegen – /dauerauftraege/neu
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import DauerauftragForm from './DauerauftragForm';
import { getMyClientId } from '@/lib/supabase/get-my-client';

export default async function DauerauftragNeuPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const clientId = await getMyClientId(supabase, user.id);
  const { data: client } = !clientId ? { data: null } : await supabase
    .from('clients')
    .select('id, booking_mode')
    .eq('id', clientId)
    .maybeSingle();

  if (!client) redirect('/dashboard');

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, type, vat_rate')
    .order('type')
    .order('sort_order');

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#1B3A6B]">Neuer Dauerauftrag</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Wiederkehrende Buchung anlegen – wird automatisch täglich verarbeitet
        </p>
      </div>
      <DauerauftragForm
        clientId={client.id}
        bookingMode={client.booking_mode ?? 'netto'}
        categories={categories ?? []}
      />
    </div>
  );
}
