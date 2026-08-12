'use client';

import { useState, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { heute } from '@/lib/fehler';
import { formatCurrency } from '@/lib/utils';
import {
  ArrowUpCircle, ArrowDownCircle, AlertTriangle, Check, X, Loader2, Inbox, Paperclip,
} from 'lucide-react';
import NeueEingangsrechnungForm from './NeueEingangsrechnungForm';

type Category = { id: string; name: string; type: string; vat_rate: number };
type Supplier = { id: string; name: string; contact_person: string | null };
type Konto = { id: string; name: string; type: string };

const KONTO_ART: Record<string, string> = {
  kontokorrent: 'Girokonto', kreditkarte: 'Kreditkarte', kreditkonto: 'Kreditkonto',
};

type OutgoingInvoice = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  status: string;
  total_net: number;
  total_vat: number;
  total_gross: number;
  customers: { id: string; name: string; contact_person: string | null } | null;
};

type IncomingInvoice = {
  id: string;
  vendor_name: string;
  supplier_id: string | null;
  invoice_number: string | null;
  invoice_date: string;
  due_date: string;
  status: string;
  amount_net: number;
  vat_rate: number;
  vat_amount: number;
  amount_gross: number;
  category_id: string | null;
  beleg_storage_path: string | null;
  beleg_file_name: string | null;
  beleg_mime_type: string | null;
  beleg_file_size: number | null;
};

// naheliegendeRate() ist entfallen: der Steuersatz einer Ausgangsrechnung
// wird nicht mehr aus dem Verhältnis USt/Netto geraten, sondern in
// rechnung_bezahlt_buchen() je Position aus invoices.items gelesen.
// Damit landen gemischte Rechnungen korrekt in KZ 022 und KZ 029.

function isOverdue(dueDate: string, today: Date) { return new Date(dueDate) < today; }

export default function OffenePostenClient({
  clientId, hasInvoicing, outgoingInvoices, incomingInvoices, incomeCategories, expenseCategories, suppliers, accounts,
}: {
  clientId: string;
  hasInvoicing: boolean;
  outgoingInvoices: OutgoingInvoice[];
  incomingInvoices: IncomingInvoice[];
  incomeCategories: Category[];
  expenseCategories: Category[];
  suppliers: Supplier[];
  accounts: Konto[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // ── Ausgangsrechnungen: Buchung bei Zahlungseingang ──────────────────
  const [outBookingId, setOutBookingId] = useState<string | null>(null);
  const [outPaymentDate, setOutPaymentDate] = useState('');
  const [outCategoryId, setOutCategoryId] = useState('');
  const [outSaving, setOutSaving] = useState(false);
  const [outError, setOutError] = useState('');
  const [outAccountId, setOutAccountId] = useState('');

  function openOutBooking(inv: OutgoingInvoice) {
    setOutBookingId(inv.id);
    // toLocaleDateString('en-CA') liefert das LOKALE Datum als YYYY-MM-DD.
    // toISOString() wäre UTC und würde am Monatsersten vor 02:00 Uhr in den
    // Vormonat rutschen – also womöglich in einen bereits gemeldeten
    // UVA-Zeitraum.
    setOutPaymentDate(new Date().toLocaleDateString('en-CA'));
    setOutCategoryId(incomeCategories[0]?.id ?? '');
    setOutAccountId(accounts.length === 1 ? accounts[0].id : '');
    setOutError('');
  }

  async function handleOutBuchen(inv: OutgoingInvoice) {
    if (!outCategoryId) { setOutError('Bitte eine Kategorie wählen.'); return; }
    setOutSaving(true);
    setOutError('');

    // Buchung(en) und Statuswechsel laufen atomar in der Datenbank ab
    // (Migration 021). Vorher waren das zwei getrennte Schritte: schlug
    // der zweite fehl, blieb die Rechnung offen, obwohl die Buchung schon
    // existierte – der nächste Klick hätte ein zweites Mal gebucht.
    // Die Funktion legt zudem je Steuersatz eine eigene Buchung an, damit
    // gemischte Rechnungen in der UVA in den richtigen Kennzahlen landen.
    const { error: rpcError } = await supabase.rpc('rechnung_bezahlt_buchen', {
      p_invoice_id:  inv.id,
      p_category_id: outCategoryId,
      p_paid_date:   outPaymentDate,
      // Migration 041: womit wurde bezahlt? Ordnet die Buchung dem
      // Konto zu und macht die Kontoabstimmung erst möglich.
      p_account_id:  outAccountId || null,
    });

    if (rpcError) {
      setOutError(rpcError.message);
      setOutSaving(false);
      return;
    }

    setOutSaving(false);
    setOutBookingId(null);
    router.refresh();
  }

  // ── Eingangsrechnungen: Buchung bei Zahlungsausgang ──────────────────
  // Eingangsrechnungen haben keine eigene Detailseite – ein Klick auf
  // die Nummer öffnet den hinterlegten Beleg (kurzlebige signierte URL,
  // der Bucket ist privat).
  const [belegLaedt, setBelegLaedt] = useState<string | null>(null);
  async function belegOeffnen(pfad: string) {
    setBelegLaedt(pfad);
    setInError('');
    const { data, error } = await supabase.storage.from('belege').createSignedUrl(pfad, 300);
    setBelegLaedt(null);
    if (error || !data?.signedUrl) {
      setInError(`Beleg konnte nicht geöffnet werden: ${error?.message ?? 'unbekannter Fehler'}`);
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  const [inBookingId, setInBookingId] = useState<string | null>(null);
  const [inPaymentDate, setInPaymentDate] = useState('');
  const [inCategoryId, setInCategoryId] = useState('');
  const [inSaving, setInSaving] = useState(false);
  const [inError, setInError] = useState('');
  const [inAccountId, setInAccountId] = useState('');

  function openInBooking(inv: IncomingInvoice) {
    setInBookingId(inv.id);
    setInPaymentDate(heute());
    setInCategoryId(inv.category_id ?? expenseCategories[0]?.id ?? '');
    setInAccountId(accounts.length === 1 ? accounts[0].id : '');
    setInError('');
  }

  async function handleInBuchen(inv: IncomingInvoice) {
    if (!inCategoryId) { setInError('Bitte eine Kategorie wählen.'); return; }
    setInSaving(true);
    setInError('');

    const beschreibung = `Zahlungsausgang ${inv.vendor_name}${inv.invoice_number ? ` – ${inv.invoice_number}` : ''}`;

    const { data: newTx, error: insertError } = await supabase
      .from('transactions')
      .insert({
        client_id:    clientId,
        category_id:  inCategoryId,
        type:         'expense',
        amount_net:   Number(inv.amount_net),
        vat_rate:     inv.vat_rate as 0 | 10 | 13 | 20,
        vat_amount:   Number(inv.vat_amount),
        booking_date: inPaymentDate,
        description:  beschreibung,
        account_id:   inAccountId || null,
      })
      .select('id')
      .single();

    if (insertError || !newTx) {
      setInError(`Fehler: ${insertError?.message ?? 'Unbekannter Fehler'}`);
      setInSaving(false);
      return;
    }

    const { error: updateError } = await supabase
      .from('incoming_invoices')
      .update({ status: 'paid', paid_date: inPaymentDate, transaction_id: newTx.id })
      .eq('id', inv.id);

    if (updateError) {
      setInError(`Buchung angelegt, aber Eingangsrechnung konnte nicht aktualisiert werden: ${updateError.message}`);
      setInSaving(false);
      return;
    }

    // Bereits bei Erfassung hochgeladenen Beleg mit der neuen Buchung verknüpfen
    if (inv.beleg_storage_path) {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('attachments').insert({
        transaction_id: newTx.id,
        client_id:      clientId,
        file_name:      inv.beleg_file_name ?? 'Beleg',
        storage_path:   inv.beleg_storage_path,
        mime_type:      inv.beleg_mime_type ?? 'application/octet-stream',
        file_size:      inv.beleg_file_size ?? 0,
        uploaded_by:    user?.id ?? '',
      });
    }

    setInSaving(false);
    setInBookingId(null);
    router.refresh();
  }

  const totalOutOpen = outgoingInvoices.reduce((s, i) => s + Number(i.total_gross), 0);
  const totalOutOverdue = outgoingInvoices.filter(i => isOverdue(i.due_date, today)).reduce((s, i) => s + Number(i.total_gross), 0);
  const totalInOpen = incomingInvoices.reduce((s, i) => s + Number(i.amount_gross), 0);
  const totalInOverdue = incomingInvoices.filter(i => isOverdue(i.due_date, today)).reduce((s, i) => s + Number(i.amount_gross), 0);

  return (
    <div className="space-y-8">
      {/* ── Ausgangsrechnungen ─────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-600 uppercase tracking-wide">
          <ArrowUpCircle size={16} strokeWidth={2} className="text-income" />
          Ausgangsrechnungen
        </h2>

        {!hasInvoicing ? (
          <p className="text-sm text-gray-400 bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
            Rechnungsmodul ist nicht aktiviert.
          </p>
        ) : outgoingInvoices.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
            <Inbox size={28} strokeWidth={1.5} className="text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">Keine offenen Ausgangsrechnungen.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <SummaryTile label="Offen" value={totalOutOpen} count={outgoingInvoices.length} color="text-amber-600" />
              <SummaryTile label="Überfällig" value={totalOutOverdue} count={outgoingInvoices.filter(i => isOverdue(i.due_date, today)).length} color={totalOutOverdue > 0 ? 'text-red-600' : 'text-gray-400'} />
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
                  {outgoingInvoices.map(inv => {
                    const overdue = isOverdue(inv.due_date, today);
                    const isBooking = outBookingId === inv.id;
                    return (
                      <Fragment key={inv.id}>
                        <tr className="border-t border-gray-50 hover:bg-gray-50/50">
                          <td className="px-4 py-3 font-mono font-medium">
                            <Link
                              href={`/rechnungen/${inv.id}`}
                              className="text-[#35609E] hover:underline underline-offset-2"
                              title="Rechnung öffnen"
                            >
                              {inv.invoice_number}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {inv.customers ? (
                              <Link href={`/kunden/${inv.customers.id}`} className="hover:text-[#35609E] transition-colors">
                                {inv.customers.name}
                              </Link>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 ${overdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                              {overdue && <AlertTriangle size={13} strokeWidth={2} />}
                              {new Date(inv.due_date).toLocaleDateString('de-AT')}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-800">{formatCurrency(Number(inv.total_gross))}</td>
                          <td className="px-4 py-3 text-right">
                            {!isBooking && (
                              <button onClick={() => openOutBooking(inv)}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-income hover:bg-income-dark px-3 py-1.5 rounded-lg transition-colors">
                                <ArrowUpCircle size={13} strokeWidth={2} />
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
                                  <label htmlFor={`op-${inv.id}-zahldatum`} className="block text-xs font-medium text-gray-600 mb-1">Zahlungsdatum</label>
                                  <input id={`op-${inv.id}-zahldatum`} type="date" value={outPaymentDate} onChange={e => setOutPaymentDate(e.target.value)}
                                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E]" />
                                </div>
                                <div>
                                  <label htmlFor={`op-${inv.id}-kategorie`} className="block text-xs font-medium text-gray-600 mb-1">Kategorie</label>
                                  <select id={`op-${inv.id}-kategorie`} value={outCategoryId} onChange={e => setOutCategoryId(e.target.value)}
                                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E]">
                                    {incomeCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label htmlFor={`op-${inv.id}-aus-konto`} className="block text-xs font-medium text-gray-600 mb-1">Bezahlt über</label>
                                  {accounts.length === 0 ? (
                                    <p className="text-xs text-gray-400 py-2">
                                      Noch keine Konten angelegt –{' '}
                                      <Link href="/konten/neu" className="text-[#35609E] underline underline-offset-2">Konto anlegen</Link>
                                    </p>
                                  ) : (
                                    <select id={`op-${inv.id}-aus-konto`} value={outAccountId} onChange={e => setOutAccountId(e.target.value)}
                                      className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E]">
                                      <option value="">Kein Konto</option>
                                      {accounts.map(k => (
                                        <option key={k.id} value={k.id}>{k.name} ({KONTO_ART[k.type] ?? k.type})</option>
                                      ))}
                                    </select>
                                  )}
                                </div>

                                <div>
                                  <p className="block text-xs font-medium text-gray-600 mb-1">Umsatzsteuer</p>
                                  <p className="text-sm text-gray-600 px-1 py-1.5">
                                    {formatCurrency(Number(inv.total_net))} netto
                                    {' + '}{formatCurrency(Number(inv.total_vat))} USt
                                  </p>
                                  <p className="text-[11px] text-gray-400 -mt-0.5">
                                    Steuersätze werden aus den Positionen übernommen
                                  </p>
                                </div>
                                <button onClick={() => handleOutBuchen(inv)} disabled={outSaving}
                                  className="inline-flex items-center gap-1.5 bg-income hover:bg-income-dark text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
                                  {outSaving ? <Loader2 size={14} strokeWidth={2} className="animate-spin" /> : <Check size={14} strokeWidth={2} />}
                                  Buchen
                                </button>
                                <button onClick={() => setOutBookingId(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                                  <X size={16} strokeWidth={2} />
                                </button>
                              </div>
                              {outError && <p className="text-red-600 text-xs mt-2">{outError}</p>}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* ── Eingangsrechnungen ─────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-600 uppercase tracking-wide">
            <ArrowDownCircle size={16} strokeWidth={2} className="text-expense" />
            Eingangsrechnungen
          </h2>
          <NeueEingangsrechnungForm clientId={clientId} categories={expenseCategories} suppliers={suppliers} />
        </div>

        {/* Fehler aus dem Beleg-Öffnen sind sonst nur in der
            aufgeklappten Buchungszeile sichtbar. */}
        {inError && inBookingId === null && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">{inError}</p>
        )}

        {incomingInvoices.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
            <Inbox size={28} strokeWidth={1.5} className="text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">Keine offenen Eingangsrechnungen.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <SummaryTile label="Offen" value={totalInOpen} count={incomingInvoices.length} color="text-amber-600" />
              <SummaryTile label="Überfällig" value={totalInOverdue} count={incomingInvoices.filter(i => isOverdue(i.due_date, today)).length} color={totalInOverdue > 0 ? 'text-red-600' : 'text-gray-400'} />
            </div>

            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                    <th className="text-left px-4 py-3">Lieferant</th>
                    <th className="text-left px-4 py-3">Nummer</th>
                    <th className="text-left px-4 py-3">Fälligkeit</th>
                    <th className="text-right px-4 py-3">Betrag</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {incomingInvoices.map(inv => {
                    const overdue = isOverdue(inv.due_date, today);
                    const isBooking = inBookingId === inv.id;
                    return (
                      <Fragment key={inv.id}>
                        <tr className="border-t border-gray-50 hover:bg-gray-50/50">
                          <td className="px-4 py-3 text-gray-700">
                            {inv.supplier_id ? (
                              <Link href={`/lieferanten/${inv.supplier_id}`} className="inline-flex items-center gap-1.5 hover:text-[#35609E] transition-colors">
                                {inv.vendor_name}
                                {inv.beleg_storage_path && <Paperclip size={12} strokeWidth={2} className="text-gray-300" />}
                              </Link>
                            ) : (
                              <span className="inline-flex items-center gap-1.5">
                                {inv.vendor_name}
                                {inv.beleg_storage_path && <Paperclip size={12} strokeWidth={2} className="text-gray-300" />}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono text-gray-500">
                            {inv.beleg_storage_path ? (
                              <button
                                type="button"
                                onClick={() => belegOeffnen(inv.beleg_storage_path!)}
                                className="text-[#35609E] font-medium hover:underline underline-offset-2 disabled:opacity-50"
                                disabled={belegLaedt === inv.beleg_storage_path}
                                title="Beleg öffnen"
                              >
                                {inv.invoice_number ?? 'Beleg'}
                              </button>
                            ) : (
                              <span title="Kein Beleg hinterlegt">{inv.invoice_number ?? '—'}</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 ${overdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                              {overdue && <AlertTriangle size={13} strokeWidth={2} />}
                              {new Date(inv.due_date).toLocaleDateString('de-AT')}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-800">{formatCurrency(Number(inv.amount_gross))}</td>
                          <td className="px-4 py-3 text-right">
                            {!isBooking && (
                              <button onClick={() => openInBooking(inv)}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-expense hover:bg-expense-dark px-3 py-1.5 rounded-lg transition-colors">
                                <ArrowDownCircle size={13} strokeWidth={2} />
                                Als bezahlt buchen
                              </button>
                            )}
                          </td>
                        </tr>
                        {isBooking && (
                          <tr className="bg-expense/5 border-t border-expense/20">
                            <td colSpan={5} className="px-4 py-3">
                              <div className="flex flex-wrap items-end gap-3">
                                <div>
                                  <label htmlFor={`op-${inv.id}-zahldatum`} className="block text-xs font-medium text-gray-600 mb-1">Zahlungsdatum</label>
                                  <input id={`op-${inv.id}-zahldatum`} type="date" value={inPaymentDate} onChange={e => setInPaymentDate(e.target.value)}
                                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E]" />
                                </div>
                                <div>
                                  <label htmlFor={`op-${inv.id}-kategorie`} className="block text-xs font-medium text-gray-600 mb-1">Kategorie</label>
                                  <select id={`op-${inv.id}-kategorie`} value={inCategoryId} onChange={e => setInCategoryId(e.target.value)}
                                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E]">
                                    {expenseCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label htmlFor={`op-${inv.id}-ein-konto`} className="block text-xs font-medium text-gray-600 mb-1">Bezahlt über</label>
                                  {accounts.length === 0 ? (
                                    <p className="text-xs text-gray-400 py-2">
                                      Noch keine Konten angelegt –{' '}
                                      <Link href="/konten/neu" className="text-[#35609E] underline underline-offset-2">Konto anlegen</Link>
                                    </p>
                                  ) : (
                                    <select id={`op-${inv.id}-ein-konto`} value={inAccountId} onChange={e => setInAccountId(e.target.value)}
                                      className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E]">
                                      <option value="">Kein Konto</option>
                                      {accounts.map(k => (
                                        <option key={k.id} value={k.id}>{k.name} ({KONTO_ART[k.type] ?? k.type})</option>
                                      ))}
                                    </select>
                                  )}
                                </div>

                                <span className="text-xs text-gray-400 pb-2">USt {inv.vat_rate}% (bei Erfassung festgelegt)</span>
                                <button onClick={() => handleInBuchen(inv)} disabled={inSaving}
                                  className="inline-flex items-center gap-1.5 bg-expense hover:bg-expense-dark text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
                                  {inSaving ? <Loader2 size={14} strokeWidth={2} className="animate-spin" /> : <Check size={14} strokeWidth={2} />}
                                  Buchen
                                </button>
                                <button onClick={() => setInBookingId(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                                  <X size={16} strokeWidth={2} />
                                </button>
                              </div>
                              {inError && <p className="text-red-600 text-xs mt-2">{inError}</p>}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function SummaryTile({ label, value, count, color }: { label: string; value: number; count: number; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{formatCurrency(value)}</p>
      <p className="text-xs text-gray-400 mt-0.5">{count} Rechnung(en)</p>
    </div>
  );
}
