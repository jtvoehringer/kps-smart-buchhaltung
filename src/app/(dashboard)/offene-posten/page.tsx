// Offene Posten (Ein- und Ausgangsrechnungen) – /offene-posten
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getMyClientId } from '@/lib/supabase/get-my-client';
import { Wallet } from 'lucide-react';
import OffenePostenClient from './OffenePostenClient';

export default async function OffenePostenPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const clientId = await getMyClientId(supabase, user.id);
  const { data: client } = !clientId ? { data: null } : await supabase
    .from('clients')
    .select('id, company_name')
    .eq('id', clientId)
    .maybeSingle();

  if (!client) redirect('/dashboard');

  // Rechnungsmodul ist fixer Bestandteil der Lösung – Ausgangsrechnungen
  // werden immer geladen, unabhängig von einem Modul-Flag.
  const { data: outgoingInvoicesData } = await supabase
    .from('invoices')
    .select(`
      id, invoice_number, invoice_date, due_date, status,
      total_net, total_vat, total_gross,
      customers ( id, name, contact_person )
    `)
    .eq('client_id', client.id)
    .eq('status', 'open')
    .order('due_date', { ascending: true });

  const outgoingInvoices: {
    id: string; invoice_number: string; invoice_date: string; due_date: string; status: string;
    total_net: number; total_vat: number; total_gross: number;
    customers: { id: string; name: string; contact_person: string | null } | null;
  }[] = outgoingInvoicesData ?? [];

  const { data: incomingInvoices } = await supabase
    .from('incoming_invoices')
    .select(`
      id, vendor_name, invoice_number, invoice_date, due_date, status,
      amount_net, vat_rate, vat_amount, amount_gross, category_id, supplier_id,
      beleg_storage_path, beleg_file_name, beleg_mime_type, beleg_file_size
    `)
    .eq('client_id', client.id)
    .eq('status', 'open')
    .order('due_date', { ascending: true });

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, type, vat_rate')
    .order('type')
    .order('sort_order');

  const { data: suppliers } = await supabase
    .from('suppliers')
    .select('id, name, contact_person')
    .eq('client_id', client.id)
    .eq('is_active', true)
    .order('name');

  // Konten für die Zahlungszuordnung (Migration 041): womit wurde bezahlt?
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name, type')
    .eq('client_id', client.id)
    .eq('is_active', true)
    .order('name');

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-navy tracking-[-0.01em] flex items-center gap-2">
          <Wallet size={24} strokeWidth={1.75} className="text-navy" />
          Offene Posten
        </h1>
        <p className="text-ink-2 text-sm mt-0.5">{client.company_name}</p>
      </div>

      <OffenePostenClient
        clientId={client.id}
        hasInvoicing={true}
        outgoingInvoices={outgoingInvoices}
        incomingInvoices={incomingInvoices ?? []}
        accounts={accounts ?? []}
        incomeCategories={(categories ?? []).filter(c => c.type === 'income')}
        expenseCategories={(categories ?? []).filter(c => c.type === 'expense')}
        suppliers={suppliers ?? []}
      />
    </div>
  );
}
