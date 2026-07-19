// Belege (OCR) – /belege  (nur wenn Modul 'ocr' aktiv)
export const dynamic = 'force-dynamic';

import { createClient }      from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect }          from 'next/navigation';
import { getMyClientId }     from '@/lib/supabase/get-my-client';
import BelegeClient, { type Receipt } from './BelegeClient';

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
    .select('company_name, modules_enabled, tenant_id')
    .eq('id', clientId)
    .maybeSingle();

  const modules: string[] = client?.modules_enabled ?? [];
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

  // Kategorien laden (für die Kategorie-Auswahl beim Verbuchen eines Belegs)
  // Kategorien sind entweder systemweit (tenant_id NULL) oder auf den Tenant der
  // Kanzlei beschränkt – "categories" hat keine client_id-Spalte.
  const { data: categories } = await admin
    .from('categories')
    .select('id, name, type, vat_rate')
    .or(`tenant_id.is.null${client?.tenant_id ? `,tenant_id.eq.${client.tenant_id}` : ''}`)
    .order('type')
    .order('sort_order');

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#35609E]">Belege</h1>
        <p className="text-gray-500 text-sm">Belege hochladen · KI erkennt Daten automatisch · Als Buchung übernehmen</p>
      </div>
      <BelegeClient
        clientId={clientId}
        initialReceipts={(receipts ?? []) as unknown as Receipt[]}
        categories={categories ?? []}
      />
    </div>
  );
}
