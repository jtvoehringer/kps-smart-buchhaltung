// Rechnungs-Druckseite – öffnet im neuen Tab, triggert Druckdialog
// Kein KPS-Branding – nur das Design des Klienten
export const dynamic = 'force-dynamic';

import { Fragment } from 'react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import DruckButtons from './DruckButtons';

export default async function RechnungDruckenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  const { data: membership } = await admin
    .from('client_memberships')
    .select('client_id')
    .eq('user_id', user.id)
    .order('created_at')
    .limit(1)
    .maybeSingle();

  if (!membership?.client_id) redirect('/dashboard');

  const [{ data: invoice }, { data: branding }, { data: clientData }] = await Promise.all([
    admin.from('invoices')
      .select(`*, customers(*)`)
      .eq('id', id)
      .eq('client_id', membership.client_id)
      .maybeSingle(),
    admin.from('client_branding').select('*')
      .eq('client_id', membership.client_id).maybeSingle(),
    admin.from('clients').select('company_name, uid_number')
      .eq('id', membership.client_id).maybeSingle(),
  ]);

  if (!invoice) notFound();

  const color  = branding?.brand_color  ?? '#35609E';
  const items  = (invoice.items ?? []) as Array<{
    description: string; quantity: number; unit: string;
    unit_price: number; vat_rate: number;
    amount_net: number; amount_vat: number; amount_gross: number;
    berater?: string; leistung_von?: string | null; leistung_bis?: string | null;
  }>;
  const c      = invoice.customers as {
    name: string; contact_person: string | null;
    street: string | null; zip: string | null; city: string | null;
    country: string; uid_number: string | null; email: string | null;
  } | null;

  const paymentDays = branding?.payment_days ?? 14;

  function fmt(n: number) {
    return new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('de-AT');
  }

  // VAT-Gruppen für Zusammenfassung
  const vatGroups = items.reduce<Record<number, { net: number; vat: number }>>((acc, item) => {
    if (!acc[item.vat_rate]) acc[item.vat_rate] = { net: 0, vat: 0 };
    acc[item.vat_rate].net += item.amount_net;
    acc[item.vat_rate].vat += item.amount_vat;
    return acc;
  }, {});

  return (
    <html lang="de">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Rechnung {invoice.invoice_number || 'Entwurf'}</title>
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
                 font-size: 11pt; color: #222; background: #f5f5f5; }
          .page { background: white; max-width: 210mm; margin: 0 auto; padding: 18mm 18mm 14mm 18mm;
                  min-height: 297mm; }
          .no-print { background: #fff; border-bottom: 1px solid #e5e7eb; padding: 10px 20px;
                       display: flex; gap: 10px; align-items: center; }
          @media print {
            body { background: white; }
            .no-print { display: none !important; }
            .page { margin: 0; padding: 14mm 14mm 12mm 14mm; max-width: none; box-shadow: none; }
          }
          h1.invoice-title { font-size: 22pt; font-weight: 700; color: ${color}; letter-spacing: 1px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; }
          .sender { line-height: 1.6; }
          .sender .company { font-size: 13pt; font-weight: 700; color: #111; margin-bottom: 2px; }
          .sender .detail { font-size: 9.5pt; color: #555; }
          .invoice-meta { text-align: right; }
          .invoice-meta .nr { font-size: 11pt; font-weight: 600; font-family: monospace; color: #333; }
          .invoice-meta .date { font-size: 9.5pt; color: #666; margin-top: 4px; line-height: 1.7; }
          .recipient-block { margin-bottom: 28px; min-height: 40mm; }
          .recipient-label { font-size: 8pt; color: #999; text-transform: uppercase; letter-spacing: 1px;
                              margin-bottom: 4px; }
          .recipient-box { border-left: 3px solid ${color}; padding-left: 10px; line-height: 1.65; }
          .recipient-box .rname { font-size: 11pt; font-weight: 600; }
          .recipient-box .rdetail { font-size: 9.5pt; color: #555; }
          table.items { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
          table.items thead tr { border-bottom: 2px solid ${color}; }
          table.items thead th { font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.5px;
                                  color: #666; padding: 6px 4px 6px 0; text-align: right; font-weight: 600; }
          table.items thead th:first-child { text-align: left; }
          table.items tbody td { padding: 7px 4px 7px 0; border-bottom: 1px solid #f0f0f0;
                                  font-size: 10pt; vertical-align: top; text-align: right; }
          table.items tbody td:first-child { text-align: left; }
          table.items tbody td.desc { max-width: 260px; text-align: left; }
          table.items tbody tr.pos-row td { border-bottom: none; padding-top: 10px; }
          table.items tbody tr.pos-row td.pos-nr { color: ${color}; font-weight: 700; font-size: 9pt; text-align: left; white-space: nowrap; }
          .pos-title { font-weight: 600; color: #222; }
          .pos-sub { font-size: 8.5pt; color: #888; margin-top: 2px; }
          table.items tbody tr.vat-row td { border-bottom: 1px solid #f0f0f0; padding-top: 0; padding-bottom: 8px;
                                             font-size: 8.5pt; color: #999; }
          table.items tbody tr.vat-row td.vat-label { text-align: left; }
          table.items tbody tr.vat-row td.vat-amount { text-align: right; }
          .totals { display: flex; justify-content: flex-end; margin-top: 12px; margin-bottom: 20px; }
          .totals-box { width: 200px; }
          .totals-row { display: flex; justify-content: space-between; padding: 3px 0;
                        font-size: 10pt; color: #555; }
          .totals-row.total { font-size: 13pt; font-weight: 700; color: ${color};
                              border-top: 2px solid ${color}; margin-top: 4px; padding-top: 6px; }
          .vat-summary { font-size: 8.5pt; color: #888; margin-top: 8px; }
          .notes { font-size: 9.5pt; color: #666; font-style: italic; margin: 16px 0; }
          .payment { margin-top: 20px; padding-top: 14px; border-top: 1px solid #eee; }
          .payment h3 { font-size: 9pt; font-weight: 700; color: #444; text-transform: uppercase;
                        letter-spacing: 0.5px; margin-bottom: 6px; }
          .payment p { font-size: 9.5pt; color: #555; line-height: 1.7; }
          .footer { margin-top: auto; padding-top: 14px; border-top: 1px solid #eee;
                    font-size: 8pt; color: #aaa; text-align: center; }
          .paid-stamp { display: inline-block; border: 3px solid #16a34a; color: #16a34a;
                        font-weight: 800; font-size: 14pt; padding: 6px 18px; transform: rotate(-3deg);
                        letter-spacing: 2px; margin-top: 12px; }
        `}</style>
      </head>
      <body>
        <div className="no-print">
          <DruckButtons invoiceId={id} />
        </div>

        <div className="page">
          {/* Kopfzeile */}
          <div className="header">
            <div className="sender">
              {branding?.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={branding.logo_url} alt="Logo" style={{ height: '52px', objectFit: 'contain', marginBottom: '8px' }} />
              ) : (
                <div className="company">{clientData?.company_name ?? ''}</div>
              )}
              {branding?.company_street && <div className="detail">{branding.company_street}</div>}
              {(branding?.company_zip || branding?.company_city) && (
                <div className="detail">
                  {[branding?.company_zip, branding?.company_city].filter(Boolean).join(' ')}
                  {branding?.company_country && branding.company_country !== 'Österreich'
                    ? `, ${branding.company_country}` : ''}
                </div>
              )}
              {branding?.company_phone && <div className="detail">Tel: {branding.company_phone}</div>}
              {branding?.company_email && <div className="detail">{branding.company_email}</div>}
              {branding?.company_website && <div className="detail">{branding.company_website}</div>}
              {clientData?.uid_number && <div className="detail" style={{ marginTop: '4px' }}>UID: {clientData.uid_number}</div>}
            </div>
            <div className="invoice-meta">
              <h1 className="invoice-title">RECHNUNG</h1>
              {invoice.invoice_number && (
                <div className="nr">{invoice.invoice_number}</div>
              )}
              <div className="date">
                <div>{[branding?.company_city, fmtDate(invoice.invoice_date)].filter(Boolean).join(', ')}</div>
                <div>Fälligkeit: {fmtDate(invoice.due_date)}</div>
                {c?.uid_number && <div style={{ marginTop: '4px' }}>Ihre UID: {c.uid_number}</div>}
              </div>
            </div>
          </div>

          {/* Empfänger */}
          {c && (
            <div className="recipient-block">
              <div className="recipient-label">Rechnungsempfänger</div>
              <div className="recipient-box">
                <div className="rname" style={{ fontWeight: 600 }}>{c.name}</div>
                {c.contact_person && <div className="rdetail">z.H. {c.contact_person}</div>}
                {c.street    && <div className="rdetail">{c.street}</div>}
                {(c.zip || c.city) && <div className="rdetail">{[c.zip, c.city].filter(Boolean).join(' ')}</div>}
              </div>
            </div>
          )}

          {/* Positionen */}
          <table className="items">
            <thead>
              <tr>
                <th style={{ width: '10%' }}>Pos.</th>
                <th style={{ width: '48%' }}>Leistung</th>
                <th>Menge</th>
                <th>Einzelpreis</th>
                <th>Betrag</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <Fragment key={i}>
                  <tr className="pos-row">
                    <td className="pos-nr">Pos. {i + 1}</td>
                    <td className="desc">
                      <div className="pos-title">{item.description}</div>
                      <div className="pos-sub">
                        {(item.leistung_von || item.leistung_bis) && (
                          <span>
                            Leistungszeitraum: {item.leistung_von ? fmtDate(item.leistung_von) : '…'} – {item.leistung_bis ? fmtDate(item.leistung_bis) : '…'}
                          </span>
                        )}
                        {item.berater && <span>{(item.leistung_von || item.leistung_bis) ? ' · ' : ''}Berater: {item.berater}</span>}
                      </div>
                    </td>
                    <td>{item.quantity} {item.unit}</td>
                    <td>{fmt(item.unit_price)}</td>
                    <td style={{ fontWeight: 600 }}>{fmt(item.amount_net)}</td>
                  </tr>
                  <tr className="vat-row">
                    <td></td>
                    <td className="vat-label" colSpan={3}>{item.vat_rate} % USt bezogen auf Pos. {i + 1}</td>
                    <td className="vat-amount">USt {fmt(item.amount_vat)}</td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>

          {/* Summen */}
          <div className="totals">
            <div className="totals-box">
              <div className="totals-row">
                <span>Netto gesamt</span>
                <span>{fmt(Number(invoice.total_net))}</span>
              </div>
              {/* USt-Aufschlüsselung nach Steuersätzen */}
              {Object.entries(vatGroups).map(([rate, vals]) => (
                <div className="totals-row vat-summary" key={rate}>
                  <span>USt {rate} % auf {fmt(vals.net)}</span>
                  <span>{fmt(vals.vat)}</span>
                </div>
              ))}
              <div className="totals-row" style={{ borderTop: '1px solid #ddd', marginTop: '4px', paddingTop: '4px' }}>
                <span>USt gesamt</span>
                <span>{fmt(Number(invoice.total_vat))}</span>
              </div>
              <div className="totals-row total">
                <span>Gesamtbetrag</span>
                <span>{fmt(Number(invoice.total_gross))}</span>
              </div>
              <div style={{ fontSize: '7.5pt', color: '#999', textAlign: 'right', marginTop: '3px' }}>
                Alle Beträge in Euro
              </div>
            </div>
          </div>

          {/* Notiz */}
          {invoice.notes && (
            <div className="notes">{invoice.notes}</div>
          )}

          {/* Zahlungshinweis */}
          <div className="payment">
            <h3>Zahlungskonditionen</h3>
            <p>Innerhalb von {paymentDays} Tagen netto</p>
            {branding?.iban && (
              <>
                <p style={{ marginTop: '6px' }}>
                  IBAN: {branding.iban}
                  {branding.bic    ? ` · BIC: ${branding.bic}`         : ''}
                  {branding.bank_name ? ` · ${branding.bank_name}`     : ''}
                </p>
                {invoice.invoice_number && (
                  <p>Verwendungszweck: <strong>{invoice.invoice_number}</strong></p>
                )}
              </>
            )}
          </div>

          {/* Bezahlt-Stempel */}
          {invoice.status === 'paid' && invoice.paid_date && (
            <div className="paid-stamp">
              BEZAHLT {new Date(invoice.paid_date).toLocaleDateString('de-AT')}
            </div>
          )}

          {/* Fußzeile */}
          {(invoice.footer_override || branding?.invoice_footer) && (
            <div className="footer">
              {invoice.footer_override ?? branding?.invoice_footer}
            </div>
          )}
        </div>
      </body>
    </html>
  );
}
