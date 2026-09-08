// Steuerberater-Export – /bmd-export
// E/A-Buchungen im BMD-NTCS-Format für den Steuerberater. Welle 7: nur
// noch der eigene Betrieb, keine Rollen, keine Mandantenauswahl.
export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { Upload } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getMyClientId } from '@/lib/supabase/get-my-client';
import PageHeader from '@/components/PageHeader';
import BmdExportClient from './BmdExportClient';

export default async function BmdExportPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const clientId = await getMyClientId(supabase, user.id);
  if (!clientId) redirect('/dashboard');
  const { data: client } = await supabase
    .from('clients')
    .select('id, company_name')
    .eq('id', clientId)
    .maybeSingle();
  if (!client) redirect('/dashboard');

  return (
    <div className="px-6 py-7 max-w-3xl mx-auto">
      <PageHeader
        title="Steuerberater-Export"
        subtitle="Buchungen eines Zeitraums als BMD-NTCS-Datei (CSV, Windows-1252) – zum Weitergeben an den Steuerberater"
        icon={Upload}
      />
      <BmdExportClient companyName={client.company_name} />
    </div>
  );
}
