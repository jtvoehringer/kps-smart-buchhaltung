// Buchung bearbeiten – /buchungen/[id]/bearbeiten
import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import BuchungBearbeitenForm from './BuchungBearbeitenForm';
import { getMyClientId } from '@/lib/supabase/get-my-client';
import { Pencil, AlertTriangle } from 'lucide-react';

// TEMPORÄR: zeigt statt eines stillen Redirects den tatsächlichen Grund an,
// warum die Seite nicht laden konnte – hilft beim Debuggen des
// "Bleistift → Dashboard"-Problems. Sobald die Ursache gefunden ist,
// entfernen wir diese Debug-Ausgabe wieder.
function DebugError({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex gap-3">
        <AlertTriangle size={20} strokeWidth={2} className="text-red-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-red-800">{title}</p>
          <p className="text-sm text-red-600 mt-1 font-mono break-all">{detail}</p>
          <p className="text-xs text-red-400 mt-3">
            Temporäre Debug-Ausgabe – bitte diesen Text an Claude weitergeben, dann wird sie wieder entfernt.
          </p>
        </div>
      </div>
    </div>
  );
}

export default async function BuchungBearbeitenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const clientId = await getMyClientId(supabase, user.id);
  if (!clientId) {
    return <DebugError title="Kein Klient gefunden (clientId ist null)" detail={`user.id = ${user.id}`} />;
  }

  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, booking_mode, attachments_enabled')
    .eq('id', clientId)
    .maybeSingle();

  if (!client) {
    return (
      <DebugError
        title="Klient konnte nicht geladen werden"
        detail={`clientId = ${clientId} · Fehler: ${clientError?.message ?? clientError?.code ?? 'kein Fehler, aber leeres Ergebnis'}`}
      />
    );
  }

  // Buchung laden – nur wenn sie dem Mandanten gehört
  const { data: transaction, error: txError } = await supabase
    .from('transactions')
    .select('id, type, amount_net, vat_rate, vat_amount, booking_date, description, is_locked, category_id')
    .eq('id', id)
    .eq('client_id', client.id)
    .maybeSingle();

  if (!transaction) {
    if (txError) {
      return (
        <DebugError
          title="Buchung konnte nicht geladen werden"
          detail={`transaction id = ${id} · client.id = ${client.id} · Fehler: ${txError.message}`}
        />
      );
    }
    notFound();
  }
  if (transaction.is_locked) redirect('/buchungen');

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, type, vat_rate')
    .order('type')
    .order('sort_order');

  // Bereits vorhandene Belege dieser Buchung laden, damit sie nachträglich
  // ergänzt (oder eingesehen/gelöscht) werden können.
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
        attachmentsEnabled={client.attachments_enabled ?? false}
        attachments={attachments ?? []}
        clientId={client.id}
      />
    </div>
  );
}
