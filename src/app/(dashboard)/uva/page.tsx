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
    .select('id, company_name, vat_liable, vat_period, fiscal_year_start, betriebsbeginn')
    .eq('id', clientId)
    .maybeSingle();

  if (!client) redirect('/dashboard');

  // Die Summen holt der Client je Zeitraum über uva_summe() direkt aus
  // der Datenbank. Vorher wurden hier ALLE Buchungen aller Jahre geladen
  // und im Browser summiert – PostgREST schneidet aber bei db.max_rows
  // (Default 1000) still ab, und zwar nach aufsteigendem Buchungsdatum,
  // also ausgerechnet die neuesten. Ab rund 1000 Buchungen meldete der
  // Mandant damit unbemerkt eine zu niedrige Zahllast.
  const { data: jahre } = await supabase.rpc('buchungsjahre', { p_client_id: client.id });

  // Gespeicherte UVA-Meldungen (Entwurf/übermittelt) und die
  // Monatsabschlüsse laden – die Übermittlung setzt seit Migration 043
  // voraus, dass alle Monate des Zeitraums abgeschlossen sind.
  const [{ data: taxReturns }, { data: monthClosures }] = await Promise.all([
    supabase
      .from('tax_returns')
      .select('id, period_year, period_month, status, submitted_at')
      .eq('client_id', client.id)
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false }),
    supabase
      .from('month_closures')
      .select('period_year, period_month, reopened_at')
      .eq('client_id', client.id),
  ]);

  return (
    <UVAClient
      clientId={client.id}
      companyName={client.company_name}
      vatLiable={client.vat_liable ?? true}
      vatPeriod={client.vat_period ?? 'quarterly'}
      jahre={(jahre ?? []).map((j: { jahr: number }) => j.jahr)}
      taxReturns={taxReturns ?? []}
      monthClosures={monthClosures ?? []}
      betriebsbeginn={client.betriebsbeginn ?? null}
    />
  );
}
