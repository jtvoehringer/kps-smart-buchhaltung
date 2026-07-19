'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/utils';

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

type Invoice = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  status: 'draft' | 'open' | 'paid' | 'cancelled';
  items: InvoiceItem[];
  total_net: number;
  total_vat: number;
  total_gross: number;
  paid_date: string | null;
  notes: string | null;
  customer_id: string | null;
  customers: {
    id: string; name: string; company_name: string | null;
    street: string | null; zip: string | null; city: string | null;
    country: string; uid_number: string | null; email: string | null;
  } | null;
};

type Branding = {
  invoice_prefix: string; invoice_next_nr: number; invoice_nr_digits: number;
  payment_days: number; logo_url: string | null; brand_color: string;
  company_street: string | null; company_zip: string | null; company_city: string | null;
  company_country: string; company_phone: string | null; company_email: string | null;
  company_website: string | null; iban: string | null; bic: string | null;
  bank_name: string | null; invoice_footer: string | null;
} | null;

type Customer = {
  id: string; name: string; company_name: string | null;
  street: string | null; zip: string | null; city: string | null;
  country: string; uid_number: string | null; email: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Entwurf', open: 'Offen', paid: 'Bezahlt', cancelled: 'Storniert',
};
const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-500',
  open:  'bg-amber-100 text-amber-700',
  paid:  'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-400',
};

export default function RechnungDetailClient({
  invoice, customers, branding, clientId,
}: {
  invoice: Invoice; customers: Customer[]; branding: Branding; clientId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading]   = useState(false);
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10));
  const [showPay, setShowPay]   = useState(false);
  const [error, setError]       = useState('');

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isOverdue = invoice.status === 'open' && new Date(invoice.due_date) < today;

  async function handleMarkPaid() {
    setLoading(true);
    setError('');
    const { error: err } = await supabase
      .from('invoices')
      .update({ status: 'paid', paid_date: paidDate })
      .eq('id', invoice.id);
    if (err) { setError(err.message); setLoading(false); return; }

    // Buchung updaten: booking_date auf Zahlungsdatum setzen
    if (invoice.id) {
      await supabase.from('transactions')
        .update({ booking_date: paidDate })
        .like('description', `%${invoice.invoice_number}%`)
        .eq('client_id', clientId);
    }
    router.refresh();
    setLoading(false);
    setShowPay(false);
  }

  async function handleCancel() {
    if (!confirm('Rechnung wirklich stornieren?')) return;
    setLoading(true);
    await supabase.from('invoices').update({ status: 'cancelled' }).eq('id', invoice.id);
    router.refresh();
    setLoading(false);
  }

  return (
    <div className="space-y-5">
      {/* Aktionsleiste */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
        <span className={`text-xs px-3 py-1 rounded-full font-medium ${STATUS_STYLE[invoice.status]}`}>
          {STATUS_LABEL[invoice.status]}
        </span>
        {isOverdue && (
          <span className="text-xs px-3 py-1 rounded-full font-medium bg-red-100 text-red-600">
            Überfällig
          </span>
        )}
        <div className="ml-auto flex gap-2 flex-wrap">
          {invoice.status === 'draft' && (
            <Link href={`/rechnungen/${invoice.id}/bearbeiten`}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium">
              Bearbeiten
            </Link>
          )}
          {(invoice.status === 'open' || invoice.status === 'draft') && (
            <a
              href={`/rechnungen/${invoice.id}/drucken`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 text-sm bg-[#1B3A6B] text-white rounded-lg hover:bg-[#1565C0] transition-colors font-medium"
            >
              📄 PDF / Drucken
            </a>
          )}
          {invoice.status === 'open' && !showPay && (
            <button onClick={() => setShowPay(true)}
              className="px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium">
              ✓ Als bezahlt markieren
            </button>
          )}
          {invoice.status === 'paid' && (
            <a
              href={`/rechnungen/${invoice.id}/drucken`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 text-sm bg-[#1B3A6B] text-white rounded-lg hover:bg-[#1565C0] transition-colors font-medium"
            >
              📄 PDF / Drucken
            </a>
          )}
          {(invoice.status === 'open' || invoice.status === 'draft') && (
            <button onClick={handleCancel} disabled={loading}
              className="px-4 py-2 text-sm border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors">
              Stornieren
            </button>
          )}
        </div>
      </div>

      {/* Zahlungseingang erfassen */}
      {showPay && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 flex items-center gap-4">
          <div>
            <p className="text-sm font-semibold text-green-800 mb-1">Zahlungseingang erfassen</p>
            <p className="text-xs text-green-600">Buchungsdatum wird auf Zahlungsdatum aktualisiert.</p>
          </div>
          <input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)}
            className="border border-green-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
          <button onClick={handleMarkPaid} disabled={loading}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50">
            {loading ? 'Speichern…' : 'Bestätigen'}
          </button>
          <button onClick={() => setShowPay(false)}
            className="text-green-600 hover:text-green-800 text-sm">Abbrechen</button>
        </div>
      )}

      {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      {/* Rechnungsvorschau */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8">
        {/* Kopf */}
        <div className="flex justify-between items-start mb-8">
          <div>
            {branding?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.logo_url} alt="Logo" className="h-14 object-contain mb-2" />
            ) : (
              <div className="text-lg font-bold text-gray-700 mb-1">
                {/* Firmenname aus Branding-Adresse fehlt – wird im PDF-Druck via /drucken angezeigt */}
              </div>
            )}
            {branding?.company_street && <p className="text-xs text-gray-500">{branding.company_street}</p>}
            {(branding?.company_zip || branding?.company_city) && (
              <p className="text-xs text-gray-500">{[branding.company_zip, branding.company_city].filter(Boolean).join(' ')}</p>
            )}
            {branding?.company_email && <p className="text-xs text-gray-500">{branding.company_email}</p>}
            {branding?.company_phone && <p className="text-xs text-gray-500">{branding.company_phone}</p>}
          </div>
          <div className="text-right">
            <h2 className="text-2xl font-bold mb-1" style={{ color: branding?.brand_color ?? '#1B3A6B' }}>
              RECHNUNG
            </h2>
            {invoice.invoice_number && (
              <p className="text-sm font-mono text-gray-700">{invoice.invoice_number}</p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Datum: {new Date(invoice.invoice_date).toLocaleDateString('de-AT')}
            </p>
            <p className="text-xs text-gray-500">
              Fälligkeit: {new Date(invoice.due_date).toLocaleDateString('de-AT')}
            </p>
          </div>
        </div>

        {/* Rechnungsempfänger */}
        {invoice.customers && (
          <div className="mb-8 p-4 bg-gray-50 rounded-lg inline-block min-w-[220px]">
            {invoice.customers.company_name && (
              <p className="font-semibold text-gray-800">{invoice.customers.company_name}</p>
            )}
            <p className="text-gray-700">{invoice.customers.name}</p>
            {invoice.customers.street && <p className="text-sm text-gray-500">{invoice.customers.street}</p>}
            {(invoice.customers.zip || invoice.customers.city) && (
              <p className="text-sm text-gray-500">
                {[invoice.customers.zip, invoice.customers.city].filter(Boolean).join(' ')}
              </p>
            )}
            {invoice.customers.uid_number && (
              <p className="text-xs text-gray-400 mt-1">UID: {invoice.customers.uid_number}</p>
            )}
          </div>
        )}

        {/* Positionen */}
        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="border-b-2 text-xs text-gray-500 uppercase" style={{ borderColor: branding?.brand_color ?? '#1B3A6B' }}>
              <th className="text-left pb-2">Beschreibung</th>
              <th className="text-right pb-2">Menge</th>
              <th className="text-right pb-2">Einzel (netto)</th>
              <th className="text-right pb-2">USt</th>
              <th className="text-right pb-2">Gesamt (brutto)</th>
            </tr>
          </thead>
          <tbody>
            {(invoice.items ?? []).map((item, i) => (
              <tr key={i} className="border-b border-gray-50">
                <td className="py-2 text-gray-800">{item.description}</td>
                <td className="py-2 text-right text-gray-600">{item.quantity} {item.unit}</td>
                <td className="py-2 text-right text-gray-600">{formatCurrency(item.unit_price)}</td>
                <td className="py-2 text-right text-gray-500">{item.vat_rate} %</td>
                <td className="py-2 text-right font-medium text-gray-800">{formatCurrency(item.amount_gross)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Summen */}
        <div className="flex justify-end">
          <div className="w-64 space-y-1 text-sm">
            <div className="flex justify-between text-gray-500">
              <span>Netto</span><span>{formatCurrency(Number(invoice.total_net))}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>USt</span><span>{formatCurrency(Number(invoice.total_vat))}</span>
            </div>
            <div className="flex justify-between font-bold text-base pt-1 border-t-2"
              style={{ borderColor: branding?.brand_color ?? '#1B3A6B', color: branding?.brand_color ?? '#1B3A6B' }}>
              <span>Gesamt</span><span>{formatCurrency(Number(invoice.total_gross))}</span>
            </div>
          </div>
        </div>

        {/* Zahlungshinweis */}
        {(branding?.iban) && (
          <div className="mt-6 pt-4 border-t border-gray-100 text-xs text-gray-500">
            <p className="font-medium text-gray-700 mb-1">Zahlungshinweis</p>
            <p>IBAN: {branding.iban}{branding.bic ? ` · BIC: ${branding.bic}` : ''}{branding.bank_name ? ` · ${branding.bank_name}` : ''}</p>
            {invoice.invoice_number && <p>Verwendungszweck: {invoice.invoice_number}</p>}
          </div>
        )}

        {invoice.notes && (
          <div className="mt-4 text-xs text-gray-500 italic">{invoice.notes}</div>
        )}

        {(invoice.status === 'paid' && invoice.paid_date) && (
          <div className="mt-4 inline-block border-2 border-green-400 text-green-600 font-bold text-sm px-4 py-2 rounded transform -rotate-2">
            BEZAHLT am {new Date(invoice.paid_date).toLocaleDateString('de-AT')}
          </div>
        )}
      </div>
    </div>
  );
}
