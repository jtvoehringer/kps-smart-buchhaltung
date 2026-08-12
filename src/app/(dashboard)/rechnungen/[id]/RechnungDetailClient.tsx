'use client';

import { useState, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, zahlungskondition } from '@/lib/utils';

type InvoiceItem = {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  amount_net: number;
  amount_vat: number;
  amount_gross: number;
  berater?: string;
  leistung_von?: string | null;
  leistung_bis?: string | null;
};

type Invoice = {
  id: string;
  client_id: string;
  invoice_number: string | null;
  invoice_date: string;
  due_date: string;
  status: 'draft' | 'open' | 'paid' | 'cancelled';
  items: InvoiceItem[];
  total_net: number;
  total_vat: number;
  total_gross: number;
  paid_date: string | null;
  transaction_id: string | null;
  contact_person: string | null;
  notes: string | null;
  customer_id: string | null;
  sent_at: string | null;
  sent_to: string | null;
  customers: {
    id: string; name: string; contact_person: string | null;
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
  bank_name: string | null;
  invoice_footer_left: string | null; invoice_footer_center: string | null;
  invoice_footer_right: string | null; show_sender_in_header: boolean;
} | null;

type Category = { id: string; name: string; type: string; vat_rate: number };

type Konto = { id: string; name: string; type: string };
const KONTO_ART: Record<string, string> = {
  kontokorrent: 'Girokonto', kreditkarte: 'Kreditkarte', kreditkonto: 'Kreditkonto',
};

type Anhang = {
  id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
};

const ANHANG_TYPEN = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const ANHANG_MAX = 10 * 1024 * 1024;

const kb = (n: number | null) =>
  n == null ? '' : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

const STATUS_LABEL: Record<string, string> = {
  draft: 'Entwurf', open: 'Offen', paid: 'Bezahlt', cancelled: 'Storniert',
};
const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-500',
  open:  'bg-amber-100 text-amber-700',
  paid:  'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-400',
};

// Lokales Datum – toISOString() liefert UTC und würde am Monatsersten
// vor 02:00 Uhr das Datum auf den Vortag (und damit in den bereits
// gemeldeten UVA-Zeitraum) setzen.
function heuteLokal() {
  return new Date().toLocaleDateString('en-CA');
}

export default function RechnungDetailClient({
  invoice, branding, incomeCategories, senderCompanyName, senderUid, attachments, accounts,
}: {
  invoice: Invoice; branding: Branding; incomeCategories: Category[];
  senderCompanyName: string; senderUid: string | null; attachments: Anhang[];
  accounts: Konto[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const absenderImKopf = !branding?.logo_url || branding?.show_sender_in_header !== false;
  const [loading, setLoading]   = useState(false);
  const [paidDate, setPaidDate] = useState(heuteLokal());
  const [showPay, setShowPay]   = useState(false);
  const [payCategoryId, setPayCategoryId] = useState(incomeCategories[0]?.id ?? '');
  const [payAccountId, setPayAccountId] = useState(accounts.length === 1 ? accounts[0].id : '');
  const [error, setError]       = useState('');

  const [showSend, setShowSend]     = useState(false);
  const [sendTo, setSendTo]         = useState(invoice.customers?.email ?? '');
  const [sendMessage, setSendMessage] = useState('');
  const [sending, setSending]       = useState(false);
  const [sendError, setSendError]   = useState('');

  // ── Zusatzanhänge (Leistungs-/Zeitnachweise) ────────────────────
  const [anhaenge, setAnhaenge]         = useState<Anhang[]>(attachments);
  const [anhangLaedt, setAnhangLaedt]   = useState(false);
  const [anhangFehler, setAnhangFehler] = useState('');

  async function anhangHochladen(files: FileList | null) {
    if (!files || files.length === 0) return;
    setAnhangLaedt(true);
    setAnhangFehler('');
    try {
      for (const file of Array.from(files)) {
        if (!ANHANG_TYPEN.includes(file.type)) {
          throw new Error(`${file.name}: Nur PDF, JPG, PNG oder WEBP.`);
        }
        if (file.size > ANHANG_MAX) {
          throw new Error(`${file.name}: Maximal 10 MB je Datei.`);
        }
        const sauber = file.name.replace(/[^\w.\-()äöüÄÖÜß ]+/g, '_');
        const pfad = `${invoice.client_id}/rechnungsanhaenge/${invoice.id}/${Date.now()}_${sauber}`;
        const { error: upErr } = await supabase.storage
          .from('belege')
          .upload(pfad, file, { contentType: file.type });
        if (upErr) throw new Error(`${file.name}: ${upErr.message}`);

        const { data: zeile, error: dbErr } = await supabase
          .from('invoice_attachments')
          .insert({
            client_id: invoice.client_id,
            invoice_id: invoice.id,
            file_name: file.name,
            storage_path: pfad,
            mime_type: file.type,
            file_size: file.size,
          })
          .select()
          .single();
        if (dbErr || !zeile) {
          // Datei nicht verwaist liegenlassen
          await supabase.storage.from('belege').remove([pfad]);
          throw new Error(`${file.name}: ${dbErr?.message ?? 'Speichern fehlgeschlagen'}`);
        }
        setAnhaenge(prev => [...prev, zeile as Anhang]);
      }
    } catch (e: unknown) {
      setAnhangFehler(e instanceof Error ? e.message : 'Upload fehlgeschlagen.');
    } finally {
      setAnhangLaedt(false);
    }
  }

  async function anhangOeffnen(a: Anhang) {
    setAnhangFehler('');
    const { data, error: sigErr } = await supabase.storage
      .from('belege')
      .createSignedUrl(a.storage_path, 300);
    if (sigErr || !data?.signedUrl) {
      setAnhangFehler(`Öffnen fehlgeschlagen: ${sigErr?.message ?? 'unbekannter Fehler'}`);
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  async function anhangLoeschen(a: Anhang) {
    setAnhangFehler('');
    const { error: delErr } = await supabase.from('invoice_attachments').delete().eq('id', a.id);
    if (delErr) {
      setAnhangFehler(`Löschen fehlgeschlagen: ${delErr.message}`);
      return;
    }
    // Verwaiste Datei ist unkritisch – Fehler hier nicht blockieren lassen.
    await supabase.storage.from('belege').remove([a.storage_path]);
    setAnhaenge(prev => prev.filter(x => x.id !== a.id));
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isOverdue = invoice.status === 'open' && new Date(invoice.due_date) < today;

  async function handleMarkPaid() {
    if (!payCategoryId) { setError('Bitte eine Einnahmen-Kategorie wählen.'); return; }
    setLoading(true);
    setError('');

    // Buchung und Statuswechsel laufen atomar in der Datenbank ab.
    // Vorher wurden hier Buchungen per .like('description', '%<nummer>%')
    // gesucht und ihr Buchungsdatum überschrieben – bei leerer
    // Rechnungsnummer wurde daraus %% und traf jede Buchung des Mandanten.
    const { error: err } = await supabase.rpc('rechnung_bezahlt_buchen', {
      p_invoice_id:  invoice.id,
      p_category_id: payCategoryId,
      p_paid_date:   paidDate,
      // Migration 041: womit wurde bezahlt?
      p_account_id:  payAccountId || null,
    });

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    router.refresh();
    setLoading(false);
    setShowPay(false);
  }

  async function handleCancel() {
    if (!confirm(
      `Rechnung ${invoice.invoice_number ?? '(Entwurf)'} über ${formatCurrency(invoice.total_gross)} wirklich stornieren?`
    )) return;
    setLoading(true);
    setError('');
    const { error: err } = await supabase
      .from('invoices').update({ status: 'cancelled' }).eq('id', invoice.id);
    if (err) {
      console.error('Storno fehlgeschlagen:', err);
      setError(`Stornieren fehlgeschlagen: ${err.message}`);
      setLoading(false);
      return;
    }
    router.refresh();
    setLoading(false);
  }

  async function handleSend() {
    if (!sendTo.trim()) { setSendError('Bitte eine Empfänger-E-Mail-Adresse angeben.'); return; }
    setSending(true);
    setSendError('');
    try {
      const res = await fetch(`/api/rechnungen/${invoice.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: sendTo.trim(), message: sendMessage.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) { setSendError(json.error ?? 'Versand fehlgeschlagen.'); setSending(false); return; }
      setShowSend(false);
      setSendMessage('');
      router.refresh();
    } catch {
      setSendError('Versand fehlgeschlagen. Bitte später erneut versuchen.');
    }
    setSending(false);
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
        {invoice.sent_at && (
          <span className="text-xs px-3 py-1 rounded-full font-medium bg-surface-band text-accent-dark">
            Versendet am {new Date(invoice.sent_at).toLocaleDateString('de-AT')}{invoice.sent_to ? ` an ${invoice.sent_to}` : ''}
          </span>
        )}
        <div className="ml-auto flex gap-2 flex-wrap">
          {invoice.status === 'draft' && (
            <Link href={`/rechnungen/${invoice.id}/bearbeiten`}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium">
              Bearbeiten
            </Link>
          )}
          {invoice.status !== 'cancelled' && (
            <a
              href={`/rechnungen/${invoice.id}/drucken`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 text-sm bg-brand text-white rounded-lg hover:bg-accent transition-colors font-medium"
            >
              PDF / Drucken
            </a>
          )}
          {invoice.status !== 'cancelled' && !showSend && (
            <button onClick={() => setShowSend(true)}
              className="px-4 py-2 text-sm border border-accent text-accent-dark rounded-lg hover:bg-surface-band transition-colors font-medium">
              Per E-Mail senden
            </button>
          )}
          {invoice.status === 'open' && !showPay && (
            <button onClick={() => setShowPay(true)}
              className="px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium">
              ✓ Als bezahlt markieren
            </button>
          )}
          {(invoice.status === 'open' || invoice.status === 'draft') && (
            <button onClick={handleCancel} disabled={loading}
              className="px-4 py-2 text-sm border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors">
              Stornieren
            </button>
          )}
        </div>
      </div>

      {/* Rechnung per E-Mail senden */}
      {showSend && (
        <div className="bg-white border border-accent/30 rounded-xl p-5 space-y-3">
          <p className="text-sm font-semibold text-gray-800">Rechnung per E-Mail senden</p>
          <div>
            <label htmlFor="rechnungDetailClient-0" className="text-xs font-medium text-gray-500 block mb-1">Empfänger-E-Mail-Adresse</label>
            <input id="rechnungDetailClient-0" type="email" value={sendTo} onChange={e => setSendTo(e.target.value)}
              placeholder="kunde@beispiel.at"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
          </div>
          <div>
            <label htmlFor="rechnungDetailClient-1" className="text-xs font-medium text-gray-500 block mb-1">Nachricht (optional)</label>
            <textarea id="rechnungDetailClient-1" rows={2} value={sendMessage} onChange={e => setSendMessage(e.target.value)}
              placeholder="z.B. anbei erhalten Sie die Rechnung wie besprochen."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent resize-none" />
          </div>
          {/* Zusatzanhänge: Leistungs-/Zeitnachweise gehen mit derselben Mail hinaus */}
          <div className="border border-gray-100 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-gray-500">
                Weitere Anhänge <span className="text-gray-400 font-normal">(z.B. Leistungs-/Zeitnachweis – PDF oder Bild, max. 10 MB)</span>
              </p>
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:text-accent cursor-pointer">
                {anhangLaedt ? 'Lädt…' : '+ Datei hinzufügen'}
                <input
                  type="file" multiple className="hidden"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  disabled={anhangLaedt}
                  onChange={e => { void anhangHochladen(e.target.files); e.target.value = ''; }}
                />
              </label>
            </div>
            {anhaenge.length === 0 ? (
              <p className="text-xs text-gray-400">Es wird nur das Rechnungs-PDF versendet.</p>
            ) : (
              <ul className="space-y-1">
                {anhaenge.map(a => (
                  <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                    <button
                      type="button"
                      onClick={() => void anhangOeffnen(a)}
                      className="text-gray-700 hover:text-brand hover:underline underline-offset-2 truncate text-left"
                      title="Anhang öffnen"
                    >
                      {a.file_name}
                      {a.file_size != null && <span className="text-gray-400 text-xs"> · {kb(a.file_size)}</span>}
                    </button>
                    <button
                      type="button"
                      onClick={() => void anhangLoeschen(a)}
                      className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                      title="Anhang entfernen"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {anhangFehler && <p className="text-red-600 text-xs bg-red-50 px-2 py-1.5 rounded">{anhangFehler}</p>}
          </div>

          {sendError && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{sendError}</p>}
          <div className="flex gap-2">
            <button onClick={handleSend} disabled={sending}
              className="px-4 py-2 bg-accent-dark hover:bg-accent text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50">
              {sending ? 'Wird gesendet…' : 'Senden'}
            </button>
            <button onClick={() => { setShowSend(false); setSendError(''); }}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Zahlungseingang erfassen */}
      {showPay && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-3">
          <div>
            <p className="text-sm font-semibold text-green-800 mb-1">Zahlungseingang erfassen</p>
            <p className="text-xs text-green-600">
              Es wird die Erlösbuchung zum Zahlungsdatum angelegt – bei mehreren Steuersätzen
              je Satz eine eigene Buchung.
            </p>
          </div>
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label htmlFor="pay-date" className="text-xs font-medium text-green-700 block mb-1">Zahlungsdatum</label>
              <input id="pay-date" type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)}
                className="border border-green-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label htmlFor="pay-cat" className="text-xs font-medium text-green-700 block mb-1">Erlöskategorie</label>
              <select id="pay-cat" value={payCategoryId} onChange={e => setPayCategoryId(e.target.value)}
                className="w-full border border-green-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
                <option value="">— Kategorie wählen —</option>
                {incomeCategories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="min-w-[180px]">
              <label htmlFor="pay-konto" className="text-xs font-medium text-green-700 block mb-1">Eingegangen auf</label>
              {accounts.length === 0 ? (
                <p className="text-xs text-green-700/70 py-2">
                  Noch keine Konten angelegt –{' '}
                  <Link href="/konten/neu" className="underline underline-offset-2">Konto anlegen</Link>
                </p>
              ) : (
                <select id="pay-konto" value={payAccountId} onChange={e => setPayAccountId(e.target.value)}
                  className="w-full border border-green-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
                  <option value="">Kein Konto</option>
                  {accounts.map(k => (
                    <option key={k.id} value={k.id}>{k.name} ({KONTO_ART[k.type] ?? k.type})</option>
                  ))}
                </select>
              )}
            </div>
            <button onClick={handleMarkPaid} disabled={loading}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50">
              {loading ? 'Wird gebucht…' : 'Buchen'}
            </button>
            <button onClick={() => setShowPay(false)}
              className="px-2 py-2 text-green-600 hover:text-green-800 text-sm">Abbrechen</button>
          </div>
        </div>
      )}

      {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      {/* Rechnungsvorschau */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8">
        {/* Kopf – das Logo läuft immer auf die Höhe des rechten Meta-Blocks
            (RECHNUNG bis inkl. UID-Zeile; die wird auch ohne UID reserviert,
            damit alle Mandanten-Logos gleich hoch ausfallen). */}
        <div className="flex justify-between items-stretch mb-8">
          <div className="flex flex-col">
            {branding?.logo_url ? (
              <div className="flex-1 min-h-0 mb-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={branding.logo_url} alt="Logo" className="h-full w-auto max-w-[400px] object-contain object-left" />
              </div>
            ) : (
              <div className="text-lg font-bold text-gray-700 mb-1">
                {/* Firmenname aus Branding-Adresse fehlt – wird im PDF-Druck via /drucken angezeigt */}
              </div>
            )}
            {absenderImKopf && (
              <>
                {branding?.company_street && <p className="text-xs text-gray-500">{branding.company_street}</p>}
                {(branding?.company_zip || branding?.company_city) && (
                  <p className="text-xs text-gray-500">{[branding.company_zip, branding.company_city].filter(Boolean).join(' ')}</p>
                )}
              </>
            )}
            {/* Kontakt, Bank und UID stehen in der Fußzeile */}
          </div>
          <div className="text-right">
            <h2 className="text-2xl font-bold mb-1" style={{ color: branding?.brand_color ?? '#35609E' }}>
              RECHNUNG
            </h2>
            {invoice.invoice_number && (
              <p className="text-sm font-mono text-gray-700">{invoice.invoice_number}</p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              {[branding?.company_city, new Date(invoice.invoice_date).toLocaleDateString('de-AT')].filter(Boolean).join(', ')}
            </p>
            <p className="text-xs text-gray-500">
              Fälligkeit: {new Date(invoice.due_date).toLocaleDateString('de-AT')}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {invoice.customers?.uid_number ? `Ihre UID: ${invoice.customers.uid_number}` : ' '}
            </p>
          </div>
        </div>

        {/* Rechnungsempfänger */}
        {invoice.customers && (
          <Link
            href={`/kunden/${invoice.customers.id}`}
            className="mb-8 p-4 bg-gray-50 hover:bg-gray-100 rounded-lg inline-block min-w-[220px] transition-colors"
            title="Zu den Kundendaten"
          >
            <p className="font-semibold text-gray-800">{invoice.customers.name}</p>
            {(invoice.contact_person || invoice.customers.contact_person) && (
              <p className="text-sm text-gray-600">
                z.H. {invoice.contact_person || invoice.customers.contact_person}
              </p>
            )}
            {invoice.customers.street && <p className="text-sm text-gray-500">{invoice.customers.street}</p>}
            {(invoice.customers.zip || invoice.customers.city) && (
              <p className="text-sm text-gray-500">
                {[invoice.customers.zip, invoice.customers.city].filter(Boolean).join(' ')}
              </p>
            )}
          </Link>
        )}

        {/* Positionen */}
        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="border-b-2 text-xs text-gray-500 uppercase" style={{ borderColor: branding?.brand_color ?? '#35609E' }}>
              <th className="text-left pb-2 w-16">Pos.</th>
              <th className="text-left pb-2">Leistung</th>
              <th className="text-left pb-2 w-24">Menge</th>
              <th className="text-left pb-2 w-28">Preis</th>
              <th className="text-right pb-2 w-32">Betrag</th>
            </tr>
          </thead>
          <tbody>
            {(invoice.items ?? []).map((item, i) => (
              <Fragment key={i}>
                <tr className="align-top">
                  <td className="py-2 pt-3 font-semibold" style={{ color: branding?.brand_color ?? '#35609E' }}>Pos. {i + 1}</td>
                  <td className="py-2 pt-3 text-gray-800">
                    <div className="font-medium">{item.description}</div>
                    {(item.leistung_von || item.leistung_bis || item.berater) && (
                      <div className="text-xs text-gray-400 mt-0.5">
                        {(item.leistung_von || item.leistung_bis) && (
                          <span>
                            Leistungszeitraum: {item.leistung_von ? new Date(item.leistung_von).toLocaleDateString('de-AT') : '…'} – {item.leistung_bis ? new Date(item.leistung_bis).toLocaleDateString('de-AT') : '…'}
                          </span>
                        )}
                        {item.berater && <span>{(item.leistung_von || item.leistung_bis) ? ' · ' : ''}Berater: {item.berater}</span>}
                      </div>
                    )}
                  </td>
                  <td className="py-2 pt-3 text-left text-gray-600 whitespace-nowrap">{String(item.quantity).replace('.', ',')} {item.unit}</td>
                  <td className="py-2 pt-3 text-left text-gray-600 whitespace-nowrap">{formatCurrency(item.unit_price)}</td>
                  <td className="py-2 pt-3 text-right font-medium text-gray-800">{formatCurrency(item.amount_net)}</td>
                </tr>
                <tr className="border-b border-gray-50">
                  <td></td>
                  <td colSpan={3} className="pb-2 text-xs text-gray-400">{item.vat_rate} % USt bezogen auf Pos. {i + 1}</td>
                  <td className="pb-2 text-right text-xs text-gray-400">USt {formatCurrency(item.amount_vat)}</td>
                </tr>
              </Fragment>
            ))}
          </tbody>
          {/* Summen im tfoot derselben Tabelle: Labels stehen exakt in
              der Mengenspalte, Beträge exakt in der Betragsspalte. */}
          <tfoot>
            <tr className="text-gray-500">
              <td className="pt-3"></td>
              <td></td>
              <td className="text-left py-0.5" colSpan={2}>Netto</td>
              <td className="text-right py-0.5">{formatCurrency(Number(invoice.total_net))}</td>
            </tr>
            <tr className="text-gray-500">
              <td></td>
              <td></td>
              <td className="text-left py-0.5" colSpan={2}>USt</td>
              <td className="text-right py-0.5">{formatCurrency(Number(invoice.total_vat))}</td>
            </tr>
            <tr className="font-bold text-base"
              style={{ color: branding?.brand_color ?? '#35609E' }}>
              <td></td>
              <td></td>
              <td className="text-left pt-1 border-t-2" colSpan={2}
                style={{ borderColor: branding?.brand_color ?? '#35609E' }}>Gesamt</td>
              <td className="text-right pt-1 border-t-2"
                style={{ borderColor: branding?.brand_color ?? '#35609E' }}>{formatCurrency(Number(invoice.total_gross))}</td>
            </tr>
            <tr>
              <td colSpan={4}></td>
              <td className="text-right text-[10px] text-gray-400 pt-0.5">Alle Beträge in Euro</td>
            </tr>
          </tfoot>
        </table>

        {/* Zahlungshinweis */}
        <div className="mt-6 pt-4 border-t border-gray-100 text-xs text-gray-500">
          <p className="font-medium text-gray-700 mb-1">Zahlungskonditionen</p>
          <p>{zahlungskondition(invoice.invoice_date, invoice.due_date)}</p>
          {branding?.iban && (
            <>
              <p className="mt-1">IBAN: {branding.iban}{branding.bic ? ` · BIC: ${branding.bic}` : ''}{branding.bank_name ? ` · ${branding.bank_name}` : ''}</p>
              {invoice.invoice_number && <p>Verwendungszweck: {invoice.invoice_number}</p>}
            </>
          )}
        </div>

        {invoice.notes && (
          <div className="mt-4 text-xs text-gray-500 italic">{invoice.notes}</div>
        )}

        {(invoice.status === 'paid' && invoice.paid_date) && (
          <div className="mt-4 inline-block border-2 border-green-400 text-green-600 font-bold text-sm px-4 py-2 rounded transform -rotate-2">
            BEZAHLT am {new Date(invoice.paid_date).toLocaleDateString('de-AT')}
          </div>
        )}

        {/* Fußzeile – dieselbe Dreiteilung wie im Druck und im PDF */}
        <div className="mt-8 pt-4 border-t border-gray-100 grid grid-cols-3 gap-6 text-[11px] text-gray-400 leading-relaxed">
          <div>
            <p className="font-semibold text-gray-500">{senderCompanyName}</p>
            {branding?.company_street && <p>{branding.company_street}</p>}
            {(branding?.company_zip || branding?.company_city) && (
              <p>{[branding.company_zip, branding.company_city].filter(Boolean).join(' ')}</p>
            )}
            {branding?.invoice_footer_left && <p>{branding.invoice_footer_left}</p>}
          </div>
          {/* Block mittig platziert, Zeilen darin bündig links – "Tel:" ist der Anker. */}
          <div className="flex justify-center">
            <div className="text-left">
              {branding?.company_phone   && <p>Tel: {branding.company_phone}</p>}
              {branding?.company_email   && <p>{branding.company_email}</p>}
              {branding?.company_website && <p>{branding.company_website}</p>}
              {branding?.invoice_footer_center && <p>{branding.invoice_footer_center}</p>}
            </div>
          </div>
          {/* Block rechts platziert, Zeilen darin bündig links – "IBAN:" ist der Anker. */}
          <div className="flex justify-end">
            <div className="text-left">
              {branding?.iban && <p>IBAN: {branding.iban}</p>}
              {(branding?.bic || branding?.bank_name) && (
                <p>{[branding.bic, branding.bank_name].filter(Boolean).join(' · ')}</p>
              )}
              {senderUid && <p>UID: {senderUid}</p>}
              {branding?.invoice_footer_right && <p>{branding.invoice_footer_right}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
