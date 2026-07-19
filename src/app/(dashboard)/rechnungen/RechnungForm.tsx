'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, calcVat } from '@/lib/utils';

type Customer = {
  id: string;
  name: string;
  company_name: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
  country: string;
  uid_number: string | null;
  email: string | null;
};

type Branding = {
  invoice_prefix: string;
  invoice_next_nr: number;
  invoice_nr_digits: number;
  payment_days: number;
};

type InvoiceItem = {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  amount_net: number;
  amount_vat: number;
  amount_gross: number;
};

type ExistingInvoice = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  status: string;
  items: InvoiceItem[];
  notes: string | null;
  footer_override: string | null;
  customer_id: string | null;
  total_net: number;
  total_vat: number;
  total_gross: number;
};

const EMPTY_ITEM: InvoiceItem = {
  description: '', quantity: 1, unit: 'Stk.', unit_price: 0,
  vat_rate: 20, amount_net: 0, amount_vat: 0, amount_gross: 0,
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function RechnungForm({
  clientId,
  customers,
  branding,
  existing,
}: {
  clientId: string;
  customers: Customer[];
  branding: Branding | null;
  existing?: ExistingInvoice;
}) {
  const router = useRouter();
  const supabase = createClient();

  const paymentDays = branding?.payment_days ?? 14;

  const [customerId, setCustomerId] = useState(existing?.customer_id ?? '');
  const [invoiceDate, setInvoiceDate] = useState(existing?.invoice_date ?? todayStr());
  const [dueDate, setDueDate] = useState(existing?.due_date ?? addDays(todayStr(), paymentDays));
  const [items, setItems] = useState<InvoiceItem[]>(
    existing?.items?.length ? existing.items : [{ ...EMPTY_ITEM }]
  );
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [footerOverride, setFooterOverride] = useState(existing?.footer_override ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Totals
  const totalNet   = items.reduce((s, i) => s + i.amount_net,   0);
  const totalVat   = items.reduce((s, i) => s + i.amount_vat,   0);
  const totalGross = items.reduce((s, i) => s + i.amount_gross, 0);

  function recalcItem(item: InvoiceItem): InvoiceItem {
    const net   = Math.round(item.quantity * item.unit_price * 100) / 100;
    const vat   = calcVat(net, item.vat_rate);
    return { ...item, amount_net: net, amount_vat: vat, amount_gross: net + vat };
  }

  const updateItem = useCallback((idx: number, patch: Partial<InvoiceItem>) => {
    setItems(prev => {
      const next = [...prev];
      next[idx] = recalcItem({ ...next[idx], ...patch });
      return next;
    });
  }, []);

  function addItem() {
    setItems(prev => [...prev, { ...EMPTY_ITEM }]);
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSave(finalize: boolean) {
    if (!customerId) { setError('Bitte einen Kunden auswählen.'); return; }
    if (items.length === 0) { setError('Mindestens eine Position erforderlich.'); return; }
    if (items.some(i => !i.description.trim())) { setError('Alle Positionen brauchen eine Beschreibung.'); return; }

    setLoading(true);
    setError('');

    const payload: Record<string, unknown> = {
      client_id:      clientId,
      customer_id:    customerId,
      invoice_date:   invoiceDate,
      due_date:       dueDate,
      items:          items,
      total_net:      Math.round(totalNet   * 100) / 100,
      total_vat:      Math.round(totalVat   * 100) / 100,
      total_gross:    Math.round(totalGross * 100) / 100,
      notes:          notes || null,
      footer_override: footerOverride || null,
    };

    if (finalize && !existing) {
      // Rechnungsnummer vergeben
      const prefix  = branding?.invoice_prefix   ?? 'RE-';
      const digits  = branding?.invoice_nr_digits ?? 3;
      const nextNr  = branding?.invoice_next_nr   ?? 1;
      payload.invoice_number = `${prefix}${String(nextNr).padStart(digits, '0')}`;
      payload.status = 'open';
    } else if (!existing) {
      payload.status = 'draft';
      payload.invoice_number = '';
    }

    let invoiceId = existing?.id;
    let err;

    if (existing) {
      ({ error: err } = await supabase
        .from('invoices')
        .update({ ...payload, ...(finalize && existing.status === 'draft' ? { status: 'open' } : {}) })
        .eq('id', existing.id));
    } else {
      const { data, error: insertErr } = await supabase
        .from('invoices')
        .insert(payload)
        .select('id')
        .single();
      err = insertErr;
      invoiceId = data?.id;
    }

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    // Rechnungsnummer-Zähler hochsetzen bei Finalisierung
    if (finalize && branding) {
      await supabase
        .from('client_branding')
        .update({ invoice_next_nr: (branding.invoice_next_nr ?? 1) + 1 })
        .eq('client_id', clientId);
    }

    // Auto-Buchung bei Finalisierung
    if (finalize && invoiceId) {
      // Kategorie für Einnahmen suchen (erste passende Einnahmen-Kategorie)
      const { data: cat } = await supabase
        .from('categories')
        .select('id')
        .eq('type', 'income')
        .or(`tenant_id.is.null,client_id.eq.${clientId}`)
        .order('sort_order')
        .limit(1)
        .maybeSingle();

      if (cat) {
        await supabase.from('transactions').insert({
          client_id:    clientId,
          category_id:  cat.id,
          type:         'income',
          amount_net:   Math.round(totalNet   * 100) / 100,
          vat_rate:     items[0]?.vat_rate ?? 20,
          vat_amount:   Math.round(totalVat  * 100) / 100,
          booking_date: invoiceDate,
          description:  `Rechnung ${payload.invoice_number ?? ''} – ${customers.find(c => c.id === customerId)?.name ?? ''}`.trim(),
          import_source: 'manual',
        });
      }
    }

    router.push(invoiceId ? `/rechnungen/${invoiceId}` : '/rechnungen');
    router.refresh();
    setLoading(false);
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]';

  return (
    <div className="space-y-5 max-w-4xl">

      {/* Kopfdaten */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-4">Rechnungskopf</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="text-xs font-medium text-gray-500 block mb-1">Kunde <span className="text-red-400">*</span></label>
            <select value={customerId} onChange={e => setCustomerId(e.target.value)} className={inputCls}>
              <option value="">— Kunden auswählen —</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>
                  {c.company_name ? `${c.company_name} (${c.name})` : c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Rechnungsdatum</label>
            <input type="date" value={invoiceDate}
              onChange={e => {
                setInvoiceDate(e.target.value);
                setDueDate(addDays(e.target.value, paymentDays));
              }}
              className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Zahlungsziel</label>
            <input type="date" value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className={inputCls} />
          </div>
        </div>
      </div>

      {/* Positionen */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-4">Positionen</h2>
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div key={idx} className="grid gap-2 pb-3 border-b border-gray-50 last:border-0 last:pb-0">
              <div className="flex gap-2 items-start">
                <div className="flex-1">
                  <input
                    type="text" placeholder="Beschreibung der Leistung"
                    value={item.description}
                    onChange={e => updateItem(idx, { description: e.target.value })}
                    className={inputCls}
                  />
                </div>
                {items.length > 1 && (
                  <button type="button" onClick={() => removeItem(idx)}
                    className="mt-0.5 text-gray-300 hover:text-red-400 transition-colors text-xl leading-none">
                    &times;
                  </button>
                )}
              </div>
              <div className="grid grid-cols-5 gap-2">
                <div>
                  <label className="text-xs text-gray-400 block mb-0.5">Menge</label>
                  <input type="number" min={0} step="0.01" value={item.quantity}
                    onChange={e => updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })}
                    className={inputCls} />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-0.5">Einheit</label>
                  <input type="text" placeholder="Stk." value={item.unit}
                    onChange={e => updateItem(idx, { unit: e.target.value })}
                    className={inputCls} />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-0.5">Einzelpreis (netto)</label>
                  <input type="number" min={0} step="0.01" value={item.unit_price}
                    onChange={e => updateItem(idx, { unit_price: parseFloat(e.target.value) || 0 })}
                    className={inputCls} />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-0.5">USt %</label>
                  <select value={item.vat_rate}
                    onChange={e => updateItem(idx, { vat_rate: parseInt(e.target.value) })}
                    className={inputCls}>
                    <option value={0}>0 %</option>
                    <option value={10}>10 %</option>
                    <option value={13}>13 %</option>
                    <option value={20}>20 %</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-0.5">Gesamt brutto</label>
                  <div className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-right font-medium text-gray-700">
                    {formatCurrency(item.amount_gross)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addItem}
          className="mt-4 text-sm text-[#1B3A6B] hover:text-[#1565C0] font-medium transition-colors"
        >
          + Position hinzufügen
        </button>

        {/* Summen */}
        <div className="mt-5 pt-4 border-t border-gray-100 space-y-1.5 text-sm">
          <div className="flex justify-between text-gray-500">
            <span>Netto gesamt</span>
            <span>{formatCurrency(totalNet)}</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>USt gesamt</span>
            <span>{formatCurrency(totalVat)}</span>
          </div>
          <div className="flex justify-between font-bold text-gray-800 text-base pt-1 border-t border-gray-200">
            <span>Brutto gesamt</span>
            <span>{formatCurrency(totalGross)}</span>
          </div>
        </div>
      </div>

      {/* Notiz */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-3">Notiz / Anmerkung (erscheint auf Rechnung)</h2>
        <textarea rows={2} placeholder="z.B. Zahlbar binnen 14 Tagen ohne Abzug…"
          value={notes} onChange={e => setNotes(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B] resize-none" />
      </div>

      {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      {/* Aktionen */}
      <div className="flex gap-3">
        <button type="button" onClick={() => router.push('/rechnungen')}
          className="px-5 py-3 rounded-xl border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          Abbrechen
        </button>
        <button type="button" onClick={() => handleSave(false)} disabled={loading}
          className="flex-1 py-3 rounded-xl border-2 border-[#1B3A6B] text-[#1B3A6B] text-sm font-semibold hover:bg-[#1B3A6B]/5 transition-colors disabled:opacity-50">
          {loading ? 'Speichern…' : 'Als Entwurf speichern'}
        </button>
        <button type="button" onClick={() => handleSave(true)} disabled={loading}
          className="flex-1 py-3 rounded-xl bg-[#1B3A6B] hover:bg-[#1565C0] text-white text-sm font-semibold transition-colors disabled:opacity-50">
          {loading ? 'Finalisieren…' : existing?.status === 'draft' ? 'Finalisieren & verbuchen' : 'Speichern'}
        </button>
      </div>
    </div>
  );
}
