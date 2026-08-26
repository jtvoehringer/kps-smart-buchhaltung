// Buchung erfassen – /buchungen/neu
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import BuchungForm from './BuchungForm';
import { getMyClientId } from '@/lib/supabase/get-my-client';
import { ReceiptText } from 'lucide-react';

export default async function BuchungNeuPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Client-ID + booking_mode laden
  const clientId = await getMyClientId(supabase, user.id);
  const { data: client } = !clientId ? { data: null } : await supabase
    .from('clients')
    .select('id, booking_mode')
    .eq('id', clientId)
    .maybeSingle();

  if (!client) redirect('/dashboard');

  // Kategorien laden
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, type, vat_rate')
    .order('type')
    .order('sort_order');

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-navy tracking-[-0.01em] flex items-center gap-2">
          <ReceiptText size={24} strokeWidth={1.75} className="text-navy" />
          Buchung erfassen
        </h1>
        <p className="text-ink-2 text-sm mt-0.5">Neue Einnahme oder Ausgabe eingeben</p>
      </div>
      <BuchungForm clientId={client.id} categories={categories ?? []} bookingMode={client.booking_mode ?? 'netto'} />
    </div>
  );
}
