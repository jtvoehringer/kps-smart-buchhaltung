// Anschaffungsbuchungen, die sich mit einer Anlage verknüpfen lassen:
// Ausgaben in Kategorien der Kontenklasse 0 ohne bestehende Zuordnung
// (bzw. die Buchung der gerade bearbeiteten Anlage).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BuchungsKandidat } from './AnlageForm';

export async function ladeBuchungsKandidaten(
  supabase: SupabaseClient,
  clientId: string,
  eigeneTransactionId: string | null = null,
): Promise<BuchungsKandidat[]> {
  const [{ data: buchungen }, { data: belegt }] = await Promise.all([
    supabase
      .from('transactions')
      .select('id, booking_date, description, amount_net, beleg_nr, categories!inner(name, konto_nr)')
      .eq('client_id', clientId)
      .eq('type', 'expense')
      .like('categories.konto_nr', '0%')
      .order('booking_date', { ascending: false })
      .limit(200),
    supabase
      .from('assets')
      .select('transaction_id')
      .eq('client_id', clientId)
      .not('transaction_id', 'is', null),
  ]);
  const vergeben = new Set((belegt ?? []).map(a => a.transaction_id as string));
  if (eigeneTransactionId) vergeben.delete(eigeneTransactionId);
  type Kat = { name: string; konto_nr: string | null } | { name: string; konto_nr: string | null }[] | null;
  return (buchungen ?? [])
    .filter(b => !vergeben.has(b.id))
    .map(b => {
      const k = b.categories as unknown as Kat;
      const kat = (Array.isArray(k) ? k[0] : k)?.name ?? '';
      return { id: b.id, booking_date: b.booking_date, description: b.description, amount_net: Number(b.amount_net), kategorie: kat, beleg_nr: b.beleg_nr ?? null };
    });
}
