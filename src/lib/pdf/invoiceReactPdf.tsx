// Serverseitige PDF-Erzeugung der Rechnung (für E-Mail-Anhang und Download).
// Nutzt @react-pdf/renderer statt eines Headless-Browsers – läuft ohne
// zusätzliche Binärdateien in Vercel Serverless Functions.
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import { zahlungskondition } from '@/lib/utils';
import type { Invoice, InvoiceItem, Customer, ClientBranding } from '@/lib/supabase/database.types';

function fmtMenge(n: number) {
  // Menge mit Komma (33,25), ohne erzwungene Nachkommastellen
  return new Intl.NumberFormat('de-AT', { maximumFractionDigits: 3 }).format(n);
}
function fmt(n: number) {
  return new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('de-AT');
}

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica', color: '#222' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  senderCompany: { fontSize: 13, fontWeight: 700, marginBottom: 2 },
  senderDetail: { fontSize: 9, color: '#555' },
  metaBlock: { alignItems: 'flex-end' },
  title: { fontSize: 20, fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 },
  nr: { fontSize: 10, fontFamily: 'Courier', marginBottom: 4 },
  metaText: { fontSize: 9, color: '#666' },
  recipientBlock: { marginBottom: 20 },
  recipientLabel: { fontSize: 7, color: '#999', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  recipientBox: { borderLeftWidth: 3, paddingLeft: 8 },
  rname: { fontSize: 10.5, fontWeight: 700 },
  rdetail: { fontSize: 9, color: '#555' },
  tableHead: { flexDirection: 'row', borderBottomWidth: 2, paddingBottom: 4, marginBottom: 4 },
  th: { fontSize: 8, color: '#666' },
  posRow: { flexDirection: 'row', paddingTop: 6 },
  posNr: { width: 42, fontSize: 8.5, fontWeight: 700, flexShrink: 0 },
  posDesc: { flexGrow: 1, flexShrink: 1, flexBasis: 0, paddingRight: 10 },
  posTitle: { fontSize: 9.5, fontWeight: 700 },
  posSub: { fontSize: 8, color: '#888', marginTop: 1 },
  qty: { width: 62, fontSize: 9, textAlign: 'right', flexShrink: 0 },
  unitPrice: { width: 68, fontSize: 9, textAlign: 'right', flexShrink: 0 },
  amount: { width: 78, fontSize: 9, fontWeight: 700, textAlign: 'right', flexShrink: 0 },
  vatRow: { flexDirection: 'row', paddingBottom: 6, marginBottom: 2, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  vatLabel: { flex: 1, marginLeft: 45, fontSize: 8, color: '#999' },
  vatAmount: { width: 75, fontSize: 8, color: '#999', textAlign: 'right' },
  totalsBlock: { alignSelf: 'flex-end', width: 200, marginTop: 12 },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', fontSize: 9.5, color: '#555', paddingVertical: 2 },
  totalsTotal: { flexDirection: 'row', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, borderTopWidth: 2, marginTop: 4, paddingTop: 6 },
  notes: { fontSize: 9, color: '#666', fontStyle: 'italic', marginTop: 16 },
  payment: { marginTop: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#eeeeee' },
  paymentH: { fontSize: 8.5, fontWeight: 700, color: '#444', textTransform: 'uppercase', marginBottom: 4 },
  paymentP: { fontSize: 9, color: '#555', marginTop: 2 },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, fontSize: 7.5, color: '#aaa',
            borderTopWidth: 1, borderTopColor: '#eeeeee', paddingTop: 8 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  footerCol: { flex: 1, lineHeight: 1.4 },
  footerColCenter: { flex: 1, lineHeight: 1.4, textAlign: 'center' },
  footerColRight: { flex: 1, lineHeight: 1.4, textAlign: 'right' },
  footerStrong: { fontWeight: 700, color: '#888' },
});

export type InvoicePdfProps = {
  invoice: Pick<Invoice,
    'invoice_number' | 'invoice_date' | 'due_date' | 'total_net' | 'total_vat' | 'total_gross' |
    'notes' | 'footer_override'
  > & { items: InvoiceItem[] };
  customer: Pick<Customer, 'name' | 'contact_person' | 'street' | 'zip' | 'city' | 'uid_number'> | null;
  branding: ClientBranding | null;
  senderCompanyName: string;
  senderUid: string | null;
};

export function InvoiceDocument({ invoice, customer, branding, senderCompanyName, senderUid }: InvoicePdfProps) {
  const color = branding?.brand_color || '#35609E';
  const absenderImKopf = !branding?.logo_url || branding?.show_sender_in_header !== false;
  const items = invoice.items ?? [];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            {branding?.logo_url ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={branding.logo_url} style={{ width: 120, height: 50, objectFit: 'contain', marginBottom: 6 }} />
            ) : null}
            {/* Absenderzeilen abschaltbar (Migration 028); ohne Logo immer an.
                Der Firmenwortlaut steht in jedem Fall in der Fußzeile. */}
            {absenderImKopf && (
              <>
                <Text style={styles.senderCompany}>{senderCompanyName}</Text>
                {branding?.company_street && <Text style={styles.senderDetail}>{branding.company_street}</Text>}
                {(branding?.company_zip || branding?.company_city) && (
                  <Text style={styles.senderDetail}>{[branding?.company_zip, branding?.company_city].filter(Boolean).join(' ')}</Text>
                )}
              </>
            )}
          </View>
          <View style={styles.metaBlock}>
            <Text style={[styles.title, { color }]}>RECHNUNG</Text>
            {invoice.invoice_number && <Text style={styles.nr}>{invoice.invoice_number}</Text>}
            <Text style={styles.metaText}>
              {[branding?.company_city, fmtDate(invoice.invoice_date)].filter(Boolean).join(', ')}
            </Text>
            <Text style={styles.metaText}>Fälligkeit: {fmtDate(invoice.due_date)}</Text>
            {customer?.uid_number && <Text style={[styles.metaText, { marginTop: 4 }]}>Ihre UID: {customer.uid_number}</Text>}
          </View>
        </View>

        {customer && (
          <View style={styles.recipientBlock}>
            <Text style={styles.recipientLabel}>Rechnungsempfänger</Text>
            <View style={[styles.recipientBox, { borderLeftColor: color }]}>
              <Text style={styles.rname}>{customer.name}</Text>
              {customer.contact_person && <Text style={styles.rdetail}>z.H. {customer.contact_person}</Text>}
              {customer.street && <Text style={styles.rdetail}>{customer.street}</Text>}
              {(customer.zip || customer.city) && (
                <Text style={styles.rdetail}>{[customer.zip, customer.city].filter(Boolean).join(' ')}</Text>
              )}
            </View>
          </View>
        )}

        <View style={[styles.tableHead, { borderBottomColor: color }]}>
          <Text style={[styles.th, { width: 42 }]}>Pos.</Text>
          <Text style={[styles.th, { flex: 1 }]}>Leistung</Text>
          <Text style={[styles.th, { width: 62, textAlign: 'right' }]}>Menge</Text>
          <Text style={[styles.th, { width: 68, textAlign: 'right' }]}>Einzelpreis</Text>
          <Text style={[styles.th, { width: 78, textAlign: 'right' }]}>Betrag</Text>
        </View>

        {items.map((item, i) => (
          <View key={i}>
            <View style={styles.posRow}>
              <Text style={styles.posNr}>Pos. {i + 1}</Text>
              <View style={styles.posDesc}>
                <Text style={styles.posTitle}>{item.description}</Text>
                {(item.leistung_von || item.leistung_bis || item.berater) && (
                  <Text style={styles.posSub}>
                    {(item.leistung_von || item.leistung_bis)
                      ? `Leistungszeitraum: ${item.leistung_von ? fmtDate(item.leistung_von) : '…'} – ${item.leistung_bis ? fmtDate(item.leistung_bis) : '…'}`
                      : ''}
                    {item.berater ? `${(item.leistung_von || item.leistung_bis) ? ' · ' : ''}Berater: ${item.berater}` : ''}
                  </Text>
                )}
              </View>
              <Text style={styles.qty}>{fmtMenge(item.quantity)} {item.unit}</Text>
              <Text style={styles.unitPrice}>{fmt(item.unit_price)}</Text>
              <Text style={styles.amount}>{fmt(item.amount_net)}</Text>
            </View>
            <View style={styles.vatRow}>
              <Text style={styles.vatLabel}>{item.vat_rate} % USt bezogen auf Pos. {i + 1}</Text>
              <Text style={styles.vatAmount}>USt {fmt(item.amount_vat)}</Text>
            </View>
          </View>
        ))}

        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}><Text>Netto gesamt</Text><Text>{fmt(Number(invoice.total_net))}</Text></View>
          <View style={styles.totalsRow}><Text>USt gesamt</Text><Text>{fmt(Number(invoice.total_vat))}</Text></View>
          <View style={[styles.totalsTotal, { borderTopColor: color, color }]}>
            <Text>Gesamtbetrag</Text><Text>{fmt(Number(invoice.total_gross))}</Text>
          </View>
          <Text style={{ fontSize: 7.5, color: '#999', textAlign: 'right', marginTop: 3 }}>
            Alle Beträge in Euro
          </Text>
        </View>

        {invoice.notes && <Text style={styles.notes}>{invoice.notes}</Text>}

        <View style={styles.payment}>
          <Text style={styles.paymentH}>Zahlungskonditionen</Text>
          <Text style={styles.paymentP}>{zahlungskondition(invoice.invoice_date, invoice.due_date)}</Text>
          {branding?.iban && (
            <>
              <Text style={styles.paymentP}>
                IBAN: {branding.iban}{branding.bic ? ` · BIC: ${branding.bic}` : ''}{branding.bank_name ? ` · ${branding.bank_name}` : ''}
              </Text>
              {invoice.invoice_number && <Text style={styles.paymentP}>Verwendungszweck: {invoice.invoice_number}</Text>}
            </>
          )}
        </View>

        {/* Fußzeile dreispaltig: Firma/Rechtliches · Kontakt · Bank & UID */}
        {invoice.footer_override ? (
          <Text style={styles.footer}>{invoice.footer_override}</Text>
        ) : (
          <View style={styles.footer}>
            <View style={styles.footerRow}>
              <View style={styles.footerCol}>
                <Text style={styles.footerStrong}>{senderCompanyName}</Text>
                {branding?.company_street && <Text>{branding.company_street}</Text>}
                {(branding?.company_zip || branding?.company_city) && (
                  <Text>{[branding?.company_zip, branding?.company_city].filter(Boolean).join(' ')}</Text>
                )}
                {branding?.invoice_footer_left && <Text>{branding.invoice_footer_left}</Text>}
              </View>
              <View style={styles.footerColCenter}>
                {branding?.company_phone   && <Text>Tel: {branding.company_phone}</Text>}
                {branding?.company_email   && <Text>{branding.company_email}</Text>}
                {branding?.company_website && <Text>{branding.company_website}</Text>}
                {branding?.invoice_footer_center && <Text>{branding.invoice_footer_center}</Text>}
              </View>
              <View style={styles.footerColRight}>
                {branding?.iban && <Text>IBAN: {branding.iban}</Text>}
                {(branding?.bic || branding?.bank_name) && (
                  <Text>{[branding?.bic, branding?.bank_name].filter(Boolean).join(' · ')}</Text>
                )}
                {senderUid && <Text>UID: {senderUid}</Text>}
                {branding?.invoice_footer_right && <Text>{branding.invoice_footer_right}</Text>}
              </View>
            </View>
          </View>
        )}
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(props: InvoicePdfProps): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument {...props} />);
}
