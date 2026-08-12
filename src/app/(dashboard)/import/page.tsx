export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getMyClientId } from '@/lib/supabase/get-my-client';
import ImportClient from './ImportClient';

export default async function ImportPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const clientId = await getMyClientId(supabase, user.id);
  if (!clientId) redirect('/dashboard');

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, type, vat_rate')
    .order('type')
    .order('sort_order');

  // Bereits importierte bank_refs für diesen Client laden (Deduplizierung im UI)
  const { data: existingRefs } = await supabase
    .from('transactions')
    .select('bank_ref')
    .eq('client_id', clientId)
    .not('bank_ref', 'is', null);

  const knownBankRefs = new Set<string>(
    (existingRefs ?? []).map(r => r.bank_ref as string).filter(Boolean)
  );

  // Konten (für Kontozuordnung des Imports)
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name, iban')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .order('name');

  // Gelernte Zuordnungen (Privat/Kategorie je Gegenpartei) aus früheren Abstimmungen
  const { data: learningRules } = await supabase
    .from('bank_learning_rules')
    .select('counterpart_pattern, category_id, is_private, hit_count')
    .eq('client_id', clientId);

  // Offene Ausgangsrechnungen (für Abgleich mit Zahlungseingängen)
  const { data: invoicesRaw } = await supabase
    .from('invoices')
    .select('id, invoice_number, total_net, total_vat, total_gross, customers(name)')
    .eq('client_id', clientId)
    .eq('status', 'open');

  const openInvoices = (invoicesRaw ?? []).map(inv => {
    const cust = Array.isArray(inv.customers) ? inv.customers[0] : inv.customers;
    return {
      id: inv.id,
      invoice_number: inv.invoice_number,
      customer_name: cust?.name || '',
      amount_gross: Number(inv.total_gross),
      amount_net: Number(inv.total_net),
      vat_amount: Number(inv.total_vat),
    };
  });

  // Offene Eingangsrechnungen (für Abgleich mit Zahlungsausgängen)
  const { data: incomingRaw } = await supabase
    .from('incoming_invoices')
    .select('id, vendor_name, invoice_number, amount_net, vat_rate, vat_amount, amount_gross, category_id')
    .eq('client_id', clientId)
    .eq('status', 'open');

  const openIncomingInvoices = (incomingRaw ?? []).map(inv => ({
    id: inv.id,
    vendor_name: inv.vendor_name,
    invoice_number: inv.invoice_number,
    amount_gross: Number(inv.amount_gross),
    amount_net: Number(inv.amount_net),
    vat_rate: Number(inv.vat_rate),
    vat_amount: Number(inv.vat_amount),
    category_id: inv.category_id,
  }));

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand">Bankdaten importieren</h1>
        <p className="text-gray-500 text-sm">
          CAMT.053 (XML) oder Bank-CSV — Buchungen werden automatisch auf Duplikate geprüft und mit offenen Rechnungen abgeglichen
        </p>
      </div>
      <ImportClient
        clientId={clientId}
        userId={user.id}
        categories={categories ?? []}
        knownBankRefs={Array.from(knownBankRefs)}
        accounts={accounts ?? []}
        learningRules={learningRules ?? []}
        openInvoices={openInvoices}
        openIncomingInvoices={openIncomingInvoices}
      />
    </div>
  );
}
