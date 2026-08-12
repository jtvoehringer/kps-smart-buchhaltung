// Einstellungen – /einstellungen
export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import EinstellungenForm from './EinstellungenForm';

export default async function EinstellungenPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  // Membership laden
  const { data: membership, error: membershipError } = await admin
    .from('client_memberships')
    .select('client_id')
    .eq('user_id', user.id)
    .order('created_at')
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership?.client_id) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-brand mb-6">Einstellungen</h1>
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-sm text-red-700 space-y-2">
          <p className="font-semibold">Kein Mandantenzugang gefunden</p>
          <p><strong>User-ID:</strong> {user.id}</p>
          <p><strong>E-Mail:</strong> {user.email}</p>
          {membershipError && <p><strong>Fehler:</strong> {membershipError.message}</p>}
          {!membership && !membershipError && <p>Keine Membership in client_memberships für diese User-ID.</p>}
        </div>
      </div>
    );
  }

  // Client-Daten laden
  const { data: client, error: clientError } = await admin
    .from('clients')
    .select(`
      id, company_name, uid_number, vat_period, booking_mode,
      ust_status, regelbesteuerung_optiert, regelbesteuerung_options_jahr, regelbesteuerung_bindung_bis
    `)
    .eq('id', membership.client_id)
    .maybeSingle();

  if (clientError || !client) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-brand mb-6">Einstellungen</h1>
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-sm text-red-700 space-y-2">
          <p className="font-semibold">Mandant nicht gefunden</p>
          <p><strong>Client-ID:</strong> {membership.client_id}</p>
          {clientError && <p><strong>Fehler:</strong> {clientError.message}</p>}
          {!client && !clientError && <p>Kein Client in clients-Tabelle für diese ID.</p>}
        </div>
      </div>
    );
  }

  // Branding laden – Fehler ignorieren falls Tabelle noch nicht existiert
  let branding = null;
  try {
    const { data } = await admin
      .from('client_branding')
      .select('*')
      .eq('client_id', client.id)
      .maybeSingle();
    branding = data;
  } catch {
    // Tabelle existiert noch nicht → kein Branding
  }

  // Laufender Jahresumsatz (Einnahmen, brutto) – Hinweis für die
  // Kleinunternehmer-Grenzen (55.000 € / Toleranz 60.500 €, § 6 Abs. 1 Z 27 UStG)
  let currentYearRevenue = 0;
  try {
    const yearStart = `${new Date().getFullYear()}-01-01`;
    const { data: incomeRows } = await admin
      .from('transactions')
      .select('amount_gross')
      .eq('client_id', client.id)
      // Privatumsätze zählen steuerlich nicht mit (F-5)
      .eq('is_private', false)
      .eq('type', 'income')
      .gte('booking_date', yearStart);
    currentYearRevenue = (incomeRows ?? []).reduce(
      (sum, r) => sum + (Number((r as { amount_gross?: number }).amount_gross) || 0), 0
    );
  } catch {
    // Buchungen konnten nicht geladen werden → Hinweis wird ohne Betrag angezeigt
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand">Einstellungen</h1>
        <p className="text-gray-500 text-sm">Buchführungs-Einstellungen für {client.company_name}</p>
      </div>
      <EinstellungenForm client={client} branding={branding ?? null} currentYearRevenue={currentYearRevenue} userEmail={user.email ?? ''} />
    </div>
  );
}
