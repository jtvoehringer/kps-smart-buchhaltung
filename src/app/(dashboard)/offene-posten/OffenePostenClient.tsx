'use client';

import { useState, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/utils';
import { CircleDollarSign, AlertTriangle, Check, X, Loader2, Inbox } from 'lucide-react';

type Category = { id: string; name: string; type: string; vat_rate: number };
type Invoice = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  status: string;
  total_net: number;
  total_vat: number;
  total_gross: number;
  customers: { id: string; name: string; company_name: string | null } | null;
};

const VAT_RATES = [0, 10, 13, 20];

function naheliegendeRate(totalNet: number, totalVat: number): number {
  if (totalNet <= 0) return 20;
  const ratio = (totalVat / totalNet) * 100;
  return VAT_RATES.reduce((best, r) => (Math.abs(r - ratio) < Math.abs(best - ratio) ? r : best), 20);
}

export default function OffenePostenClient({
  invoices, categories, clientId,
}: {
  invoices: Invoice[];
  categories: Category[];
  clientId: string;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [bookingId, setBookingId] = useState<string | null>(null);
  const [paymentDate, setPaymentDate] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [vatRate, setVatRate] = useState(20);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const totalOpen = invoices.reduce((s, i) => s + Number(i.total_gross), 0);
  const totalOverdue = invoices
    .filter(i => new Date(i.due_date) < today)
    .reduce((s, i) => s + Number(i.total_gross), 0);

  function openBooking(inv: Invoice) {
    setBookingId(inv.id);
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setVatRate(naheliegendeRate(Number(inv.total_net), Number(inv.total_vat)));
    setCategoryId(categories[0]?.id ?? '');
    setError('');
  }

  function cancelBooking() {
    setBookingId(null);
    setError('');
  }

  async function handleBuchen(inv: Invoice) {
    if (!categoryId) {
      setError('Bitte eine Kategorie wählen.');
      return;
    }
    setSaving(true);
    setError('');

    const { data: newTx, error: insertError } = await supabase
      .from('transactions')
      .insert({
        client_id:    clientId,
        category_id:  categoryId,
        type:         'income',
        amount_net:   Number(inv.total_net),
        vat_rate:     vatRate as 0 | 10 | 13 | 20,
        vat_amount:   Number(inv.total_vat),
        booking_date: paymentDate,
        description:  `Zahlungseingang ${inv.invoice_number}`,
      })
      .select('id')
      .single();

    if (insertError || !newTx) {
      setError(`Fehler: ${insertError?.message ?? 'Unbekannter Fehler'}`);
      setSaving(false);
      return;
    }

    const { error: updateError } = await supabase
      .from('invoices')
      .update({ status: 'paid', paid_date: paymentDate, transaction_id: newTx.id })
      .eq('id', inv.id);

    if (updateError) {
      setError(`Buchung angelegt, aber Rechnung konnte nicht aktualisiert werden: ${updateError.message}`);
      setSaving(false);
      return;
    }

    setSaving(false);
    setBookingId(null);
    router.refresh();
  }

  if (invoices.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
        <Inbox size={32} strokeWidth={1.5} className="text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">Keine offenen Ausgangsrechnungen.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Offen</p>
          <p className="text-xl font-bold text-amber-600">{formatCurrency(totalOpen)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{invoices.length} Rechnung(en)</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Überfällig</p>
          <p className={`text-xl font-bold ${totalOverdue > 0 ? 'text-red-600' : 'text-gray-400'}`}>{formatCurrency(totalOverdue)}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {invoices.filter(i => new Date(i.due_date) < today).length} Rechnung(en)
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
              <th className="text-left px-4 py-3">Nummer</th>
              <th className="text-left px-4 py-3">Kunde</th>
              <th className="text-left px-4 py-3">Fälligkeit</th>
              <th className="text-right px-4 py-3">Betrag</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map(inv => {
              const isOverdue = new Date(inv.due_date) < today;
              const isBooking = bookingId === inv.id;
              return (
                <Fragment key={inv.id}>
                  <tr className="border-t border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-mono text-[#35609E] font-medium">{inv.invoice_number}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {inv.customers?.company_name ?? inv.customers?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                        {isOverdue && <AlertTriangle size={13} strokeWidth={2} />}
                        {new Date(inv.due_date).toLocaleDateString('de-AT')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800">{formatCurrency(Number(inv.total_gross))}</td>
                    <td className="px-4 py-3 text-right">
                      {!isBooking && (
                        <button
                          onClick={() => openBooking(inv)}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-income hover:bg-income-dark px-3 py-1.5 rounded-lg transition-colors"
                        >
                          <CircleDollarSign size={13} strokeWidth={2} />
                          Als bezahlt buchen
                        </button>
                      )}
                    </td>
                  </tr>
                  {isBooking && (
                    <tr className="bg-income/5 border-t border-income/20">
                      <td colSpan={5} className="px-4 py-3">
                        <div className="flex flex-wrap items-end gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Zahlungsdatum</label>
                            <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)}
                              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E]" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Kategorie</label>
                            <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
                              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E]">
                              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">USt %</label>
                            <select value={vatRate} onChange={e => setVatRate(Number(e.target.value))}
                              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E]">
                              {VAT_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                            </select>
                          </div>
                          <button
                            onClick={() => handleBuchen(inv)}
                            disabled={saving}
                            className="inline-flex items-center gap-1.5 bg-income hover:bg-income-dark text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {saving ? <Loader2 size={14} strokeWidth={2} className="animate-spin" /> : <Check size={14} strokeWidth={2} />}
                            Buchen
                          </button>
                          <button onClick={cancelBooking} className="text-gray-400 hover:text-gray-600 transition-colors">
                            <X size={16} strokeWidth={2} />
                          </button>
                        </div>
                        {error && <p className="text-red-600 text-xs mt-2">{error}</p>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
