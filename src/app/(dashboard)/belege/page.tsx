// Belege (OCR) – /belege  (nur wenn Modul 'ocr' aktiv)
export const dynamic = 'force-dynamic';

import { createClient }      from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect }          from 'next/navigation';
import { getMyClientId }     from '@/lib/supabase/get-my-client';
import BelegeClient          from './BelegeClient';

export default async function BelegePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin    = createAdminClient();
  const clientId = await getMyClientId(supabase, user.id);
  if (!clientId) redirect('/dashboard');

  // Modul-Guard
  const { data: client } = await admin
    .from('clients')
    .select('company_name, modules_enabled')
    .eq('id', clientId)
    .maybeSingle();

  const modules: string[] = (client as { modules_enabled?: string[] } | null)?.modules_enabled ?? [];
  if (!modules.includes('ocr')) redirect('/dashboard');

  // Bestehende Belege laden (neueste zuerst)
  const { data: receipts } = await admin
    .from('receipts')
    .select(`
      id, file_name, file_url, file_type, file_size,
      status, ocr_data, ocr_error,
      transaction_id, notes, created_at
    `)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#1B3A6B]">Belege</h1>
        <p className="text-gray-500 text-sm">Belege hochladen · KI erkennt Daten automatisch · Als Buchung übernehmen</p>
      </div>
      <BelegeClient
        clientId={clientId}
        initialReceipts={receipts ?? []}
      />
    </div>
  );
}
