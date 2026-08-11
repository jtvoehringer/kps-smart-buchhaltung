'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, calcVat } from '@/lib/utils';

type Customer = {
  id: string;
  name: string;
  contact_person: string | null;
  payment_days: number;
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
  // Zusätzliche Felder für das Rechnungslayout (Leistungsnachweis pro Position)
  berater?: string;
  leistung_von?: string | null;
  leistung_bis?: string | null;
  // Rohtext der Zahlenfelder. Nur für die Eingabe: erlaubt Komma als
  // Dezimaltrennzeichen und ein leeres Feld, ohne dass eine 0 stehen
  // bleibt, hinter die man dann tippt ("033,25"). Wird vor dem
  // Speichern entfernt.
  menge_text?: string;
  preis_text?: string;
};

type ExistingInvoice = {
  id: string;
  invoice_number: string | null;
  contact_person?: string | null;
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

type InvoicePayload = {
  client_id: string;
  customer_id: string;
  contact_person: string | null;
  invoice_date: string;
  due_date: string;
  items: InvoiceItem[];
  total_net: number;
  total_vat: number;
  total_gross: number;
  notes: string | null;
  footer_override: string | null;
  invoice_number: string | null;
  status: 'draft' | 'open';
};

// Gängige Einheiten als Vorschlagsliste. Das Feld bleibt frei
// beschreibbar – die Liste ist nur eine Abkürzung.
const EINHEITEN = ['Stk.', 'Std.', 'Tag(e)', 'Pauschale', 'km', 'kg', 'm', 'm²', 'l', 'Monat(e)', 'Jahr(e)'];

/** Akzeptiert "33,25" und "33.25". Leerer Text ergibt 0. */
function zahl(text: string): number {
  const n = parseFloat(String(text).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

const EMPTY_ITEM: InvoiceItem = {
  description: '', quantity: 1, unit: 'Stk.', unit_price: 0,
  vat_rate: 20, amount_net: 0, amount_vat: 0, amount_gross: 0,
  berater: '', leistung_von: null, leistung_bis: null,
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
  bookingMode,
}: {
  clientId: string;
  customers: Customer[];
  branding: Branding | null;
  existing?: ExistingInvoice;
  /** 'netto' | 'brutto' aus den Einstellungen – steuert die Spalte je Position */
  bookingMode: string;
}) {
  const router = useRouter();
  const supabase = createClient();

  const paymentDays = branding?.payment_days ?? 14;

  const istNettoModus = bookingMode !== 'brutto';

  const [customerId, setCustomerId] = useState(existing?.customer_id ?? '');
  const [invoiceDate, setInvoiceDate] = useState(existing?.invoice_date ?? todayStr());
  const [dueDate, setDueDate] = useState(existing?.due_date ?? addDays(todayStr(), paymentDays));
  // z.H. – wird aus dem Kundenstamm vorbelegt und kann je Rechnung
  // abweichen, ohne den Stammsatz zu ändern.
  const [contactPerson, setContactPerson] = useState(existing?.contact_person ?? '');

  const gewaehlterKunde = customers.find(c => c.id === customerId) ?? null;
  // Zahlungsziel kommt vom Kunden, nicht mehr global aus den Einstellungen.
  const zahlungsziel = gewaehlterKunde?.payment_days ?? paymentDays;

  /** Kundenwechsel: z.H. und Fälligkeit aus dem Stammsatz übernehmen. */
  function kundeWaehlen(id: string) {
    setCustomerId(id);
    const k = customers.find(c => c.id === id);
    if (!k) return;
    if (!existing) setContactPerson(k.contact_person ?? '');
    setDueDate(addDays(invoiceDate, k.payment_days ?? paymentDays));
  }
  const [items, setItems] = useState<InvoiceItem[]>(
    existing?.items?.length ? existing.items : [{ ...EMPTY_ITEM }]
  );
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [footerOverride, setFooterOverride] = useState(existing?.footer_override ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Eine bereits finalisierte Rechnung darf nicht erneut finalisiert werden
  const istFinalisiert = !!existing && existing.status !== 'draft';

  // Totals
  const totalNet   = items.reduce((s, i) => s + i.amount_net,   0);
  const totalVat   = items.reduce((s, i) => s + i.amount_vat,   0);
  const totalGross = items.reduce((s, i) => s + i.amount_gross, 0);

  function recalcItem(item: InvoiceItem): InvoiceItem {
    const net = Math.round(item.quantity * item.unit_price * 100) / 100;
    const vat = calcVat(net, item.vat_rate);
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

    // Finalisieren ist nur für neue Rechnungen und Entwürfe erlaubt.
    // Vorher löste jedes erneute Speichern einer bereits offenen Rechnung
    // eine weitere Erlösbuchung aus und zählte den Nummernkreis hoch –
    // mit Lücken in der fortlaufenden Nummer (§ 11 Abs. 1 Z 2 UStG).
    if (finalize && existing && existing.status !== 'draft') {
      setError('Diese Rechnung ist bereits finalisiert. Änderungen sind nur an Entwürfen möglich.');
      return;
    }

    setLoading(true);
    setError('');

    const payload: InvoicePayload = {
      client_id:      clientId,
      customer_id:    customerId,
      contact_person: contactPerson.trim() || null,
      invoice_date:   invoiceDate,
      due_date:       dueDate,
      // Rohtext der Eingabefelder gehört nicht in die Datenbank
      items:          items.map(({ menge_text, preis_text, ...rest }) => {
        void menge_text; void preis_text;
        return rest;
      }),
      total_net:      Math.round(totalNet   * 100) / 100,
      total_vat:      Math.round(totalVat   * 100) / 100,
      total_gross:    Math.round(totalGross * 100) / 100,
      notes:          notes || null,
      footer_override: footerOverride || null,
      // Entwürfe haben bewusst NULL statt '' – sonst kollidiert der
      // zweite Entwurf desselben Mandanten am Unique-Index.
      invoice_number: existing?.invoice_number || null,
      status:         (existing?.status as 'draft' | 'open' | undefined) ?? 'draft',
    };

    if (finalize) {
      // Nummer atomar in der Datenbank ziehen. Das frühere
      // Read-Modify-Write über branding.invoice_next_nr konnte bei
      // parallelem Finalisieren zweimal dieselbe Nummer vergeben und
      // verschluckte Fehler beim Hochzählen komplett.
      if (!payload.invoice_number) {
        // p_datum steuert das Jahr im Suffix und den Jahreszähler:
        // eine im Jänner nachgetragene Dezemberrechnung bekommt die
        // Nummer des alten Jahres und setzt dessen Serie fort.
        const { data: nr, error: nrErr } = await supabase
          .rpc('naechste_rechnungsnummer', { p_client_id: clientId, p_datum: invoiceDate });
        if (nrErr || !nr) {
          setError(`Rechnungsnummer konnte nicht vergeben werden: ${nrErr?.message ?? 'unbekannter Fehler'}`);
          setLoading(false);
          return;
        }
        payload.invoice_number = nr as string;
      }
      payload.status = 'open';
    }

    let invoiceId = existing?.id;
    let err;

    if (existing) {
      ({ error: err } = await supabase
        .from('invoices')
        .update(payload)
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

    // Der Zähler wird nicht mehr hier hochgesetzt – das erledigt
    // naechste_rechnungsnummer() atomar in derselben Anweisung.

    // Hier entsteht BEWUSST keine Erlösbuchung mehr.
    // Der Betrieb rechnet nach dem Zufluss-/Abflussprinzip (Ist-Besteuerung,
    // § 17 UStG): die Umsatzsteuer entsteht erst mit der Vereinnahmung.
    // Gebucht wird deshalb ausschließlich beim Erfassen des Zahlungs-
    // eingangs – über /offene-posten oder den Button auf der Rechnung.
    // Beide Wege laufen über rechnung_bezahlt_buchen() (Migration 021),
    // das je Steuersatz eine Buchung anlegt und eine Doppelbuchung
    // verweigert, sobald invoices.transaction_id gesetzt ist.

    router.push(invoiceId ? `/rechnungen/${invoiceId}` : '/rechnungen');
    router.refresh();
    setLoading(false);
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E]';

  return (
    <div className="space-y-5 max-w-4xl">

      {/* Kopfdaten */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-4">Rechnungskopf</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="text-xs font-medium text-gray-500 block mb-1">Kunde <span className="text-red-400">*</span></label>
            <select value={customerId} onChange={e => kundeWaehlen(e.target.value)} className={inputCls}>
              <option value="">— Kunden auswählen —</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs font-medium text-gray-500 block mb-1">
              z.H. / Ansprechpartner <span className="text-gray-300">(optional)</span>
            </label>
            <input type="text" placeholder="z.B. Hrn. AL Ing. Harald Nirschl"
              value={contactPerson} onChange={e => setContactPerson(e.target.value)}
              className={inputCls} />
            <p className="text-xs text-gray-400 mt-1">
              Wird beim Kundenwechsel aus dem Kundenstamm übernommen und erscheint auf der
              Rechnung als „z.H."-Zeile. Änderungen hier gelten nur für diese Rechnung.
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Rechnungsdatum</label>
            <input type="date" value={invoiceDate}
              onChange={e => {
                setInvoiceDate(e.target.value);
                setDueDate(addDays(e.target.value, zahlungsziel));
              }}
              className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Fällig am</label>
            <input type="date" value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className={inputCls} />
            <p className="text-xs text-gray-400 mt-1">
              {gewaehlterKunde
                ? (zahlungsziel === 0
                    ? 'Zahlbar bei Erhalt (laut Kundenstamm)'
                    : `${zahlungsziel} Tage laut Kundenstamm`)
                : 'Zahlungsziel wird beim Kunden hinterlegt'}
            </p>
          </div>
        </div>
      </div>

      {/* Positionen */}
      <datalist id="einheiten-liste">
        {EINHEITEN.map(e => <option key={e} value={e} />)}
      </datalist>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-4">Positionen</h2>
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div key={idx} className="grid gap-2 pb-3 border-b border-gray-50 last:border-0 last:pb-0">
              <div className="flex gap-2 items-start">
                <span className="mt-2 text-xs font-semibold text-accent-dark w-12 flex-shrink-0">
                  Pos. {idx + 1}
                </span>
                <div className="flex-1">
                  <input
                    type="text" placeholder="Beschreibung der Leistung / Produkt"
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
              <div className="grid grid-cols-5 gap-2 pl-12">
                <div>
                  <label className="text-xs text-gray-400 block mb-0.5">Menge</label>
                  {/* Text statt number: erlaubt Komma und ein leeres Feld.
                      Bei type=number blieb nach dem Leeren eine 0 stehen,
                      hinter die weitergetippt wurde ("033,25"). */}
                  <input
                    type="text" inputMode="decimal" placeholder="1"
                    value={item.menge_text ?? String(item.quantity ?? '')}
                    onChange={e => updateItem(idx, { menge_text: e.target.value, quantity: zahl(e.target.value) })}
                    onBlur={() => updateItem(idx, { menge_text: undefined })}
                    className={inputCls} />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-0.5">Einheit</label>
                  <input type="text" list="einheiten-liste" placeholder="Stk." value={item.unit}
                    onChange={e => updateItem(idx, { unit: e.target.value })}
                    className={inputCls} />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-0.5">Einzelpreis (netto)</label>
                  <input
                    type="text" inputMode="decimal" placeholder="0,00"
                    value={item.preis_text ?? String(item.unit_price ?? '')}
                    onChange={e => updateItem(idx, { preis_text: e.target.value, unit_price: zahl(e.target.value) })}
                    onBlur={() => updateItem(idx, { preis_text: undefined })}
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
                  {/* Folgt dem Buchungsmodus aus den Einstellungen */}
                  <label className="text-xs text-gray-400 block mb-0.5">
                    {istNettoModus ? 'Gesamt netto' : 'Gesamt brutto'}
                  </label>
                  <div className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-right font-medium text-gray-700">
                    {formatCurrency(istNettoModus ? item.amount_net : item.amount_gross)}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 pl-12">
                <div>
                  <label className="text-xs text-gray-400 block mb-0.5">Berater</label>
                  <input type="text" placeholder="Name des Beraters"
                    value={item.berater ?? ''}
                    onChange={e => updateItem(idx, { berater: e.target.value })}
                    className={inputCls} />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-0.5">Leistungszeitraum von</label>
                  <input type="date" value={item.leistung_von ?? ''}
                    onChange={e => updateItem(idx, { leistung_von: e.target.value || null })}
                    className={inputCls} />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-0.5">Leistungszeitraum bis</label>
                  <input type="date" value={item.leistung_bis ?? ''}
                    onChange={e => updateItem(idx, { leistung_bis: e.target.value || null })}
                    className={inputCls} />
                </div>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addItem}
          className="mt-4 text-sm text-[#35609E] hover:text-[#4F90E8] font-medium transition-colors"
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
          <div className="pt-2 text-xs text-gray-400">
            Zahlungskonditionen: {zahlungsziel === 0
              ? 'zahlbar bei Erhalt'
              : `innerhalb von ${zahlungsziel} Tagen netto`}
            {gewaehlterKunde && <span className="text-gray-300"> · laut Kundenstamm</span>}
          </div>
        </div>
      </div>

      {/* Notiz */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-3">Notiz / Anmerkung (erscheint auf Rechnung)</h2>
        <textarea rows={2} placeholder="z.B. Zahlbar binnen 14 Tagen ohne Abzug…"
          value={notes} onChange={e => setNotes(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E] resize-none" />
      </div>

      {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      {!istFinalisiert && (
        <p className="text-xs text-gray-400 leading-relaxed">
          Beim Finalisieren wird die Rechnungsnummer vergeben und die Rechnung als offener Posten geführt.
          Die Erlösbuchung entsteht erst, wenn Sie den Zahlungseingang erfassen (Ist-Besteuerung).
        </p>
      )}

      {/* Aktionen */}
      <div className="flex gap-3">
        <button type="button" onClick={() => router.push('/rechnungen')}
          className="px-5 py-3 rounded-xl border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          Abbrechen
        </button>
        {istFinalisiert ? (
          <button type="button" onClick={() => handleSave(false)} disabled={loading}
            className="flex-1 py-3 rounded-xl bg-[#35609E] hover:bg-[#4F90E8] text-white text-sm font-semibold transition-colors disabled:opacity-50">
            {loading ? 'Speichern…' : 'Änderungen speichern'}
          </button>
        ) : (
          <>
            <button type="button" onClick={() => handleSave(false)} disabled={loading}
              className="flex-1 py-3 rounded-xl border-2 border-[#35609E] text-[#35609E] text-sm font-semibold hover:bg-[#35609E]/5 transition-colors disabled:opacity-50">
              {loading ? 'Speichern…' : 'Als Entwurf speichern'}
            </button>
            <button type="button" onClick={() => handleSave(true)} disabled={loading}
              className="flex-1 py-3 rounded-xl bg-[#35609E] hover:bg-[#4F90E8] text-white text-sm font-semibold transition-colors disabled:opacity-50">
              {loading ? 'Finalisieren…' : 'Finalisieren'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
