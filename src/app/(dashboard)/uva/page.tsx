// UVA – Umsatzsteuervoranmeldung /uva
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import UVAClient from './UVAClient';
import { getMyClientId } from '@/lib/supabase/get-my-client';

export default async function UVAPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const clientId = await getMyClientId(supabase, user.id);
  const { data: client } = !clientId ? { data: null } : await supabase
    .from('clients')
    .select('id, company_name, vat_liable, vat_period, fiscal_year_start')
    .eq('id', clientId)
    .maybeSingle();

  if (!client) redirect('/dashboard');

  // Alle Buchungen laden – Filterung passiert client-seitig nach Jahr/Quartal
  const { data: transactions } = await supabase
    .from('transactions')
    .select('id, type, amount_net, vat_rate, vat_amount, booking_date')
    .eq('client_id', client.id)
    .order('booking_date', { ascending: true });

  return (
    <UVAClient
      companyName={client.company_name}
      vatLiable={client.vat_liable ?? true}
      vatPeriod={client.vat_period ?? 'quarterly'}
      transactions={transactions ?? []}
    />
  );
}
