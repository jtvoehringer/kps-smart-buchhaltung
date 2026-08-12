// Monatsübersicht – eigene Auswertungsseite unter "Einnahmen & Ausgaben".
// Design-Review August 2026: die Tabelle wandert aus dem Dashboard
// hierher; das Dashboard konzentriert sich auf Kennzahlen und offene
// Posten.
export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getMyClientId } from '@/lib/supabase/get-my-client';
import MonatsuebersichtClient from './MonatsuebersichtClient';

export default async function MonatsuebersichtPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const clientId = await getMyClientId(supabase, user.id);
  if (!clientId) redirect('/dashboard');

  const { data: monatssummen } = await supabase.rpc('monatssummen', {
    p_client_id: clientId,
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <MonatsuebersichtClient monatssummen={monatssummen ?? []} />
    </div>
  );
}
