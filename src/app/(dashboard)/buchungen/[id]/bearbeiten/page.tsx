// Buchung bearbeiten – /buchungen/[id]/bearbeiten
import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import BuchungBearbeitenForm from './BuchungBearbeitenForm';
import { getMyClientId } from '@/lib/supabase/get-my-client';
import { Pencil } from 'lucide-react';

export default async function BuchungBearbeitenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  // Buchung laden – nur wenn sie dem Mandanten gehört
  const { data: transaction } = await supabase
    .from('transactions')
    .select('id, type, amount_net, vat_rate, vat_amount, booking_date, description, is_locked, category_id')
    .eq('id', id)
    .eq('client_id', client.id)
    .maybeSingle();

  if (!transaction) notFound();
  if (transaction.is_locked) redirect('/buchungen');

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, type, vat_rate')
    .order('type')
    .order('sort_order');

  // Bereits vorhandene Belege dieser Buchung laden, damit sie nachträglich
  // ergänzt (oder eingesehen/gelöscht) werden können. Die Belegverwaltung
  // ist – wie im Neu-Formular – immer verfügbar, kein Freischalt-Flag nötig.
  const { data: attachments } = await supabase
    .from('attachments')
    .select('id, file_name, storage_path, uploaded_at')
    .eq('transaction_id', transaction.id)
    .order('uploaded_at', { ascending: true });

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#35609E] flex items-center gap-2">
          <Pencil size={24} strokeWidth={1.75} className="text-accent-dark" />
          Buchung bearbeiten
        </h1>
        <p className="text-gray-500 text-sm mt-0.5">Änderungen werden sofort gespeichert.</p>
      </div>
      <BuchungBearbeitenForm
        transaction={transaction}
        categories={categories ?? []}
        bookingMode={client.booking_mode ?? 'netto'}
        attachmentsEnabled={true}
        attachments={attachments ?? []}
        clientId={client.id}
      />
    </div>
  );
}
