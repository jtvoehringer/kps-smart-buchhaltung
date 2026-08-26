'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { heute, alsDatum } from '@/lib/fehler';
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
  return heute();
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return alsDatum(d);
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

  const inputCls = 'w-full border border-line-2 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30';

  return (
    <div className="space-y-5 max-w-4xl">

      {/* Kopfdaten */}
      <div className="card p-6">
        <h2 className="font-semibold text-ink mb-4">Rechnungskopf</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label htmlFor="rechnungForm-0" className="text-xs font-medium text-ink-2 block mb-1">Kunde <span className="text-red-400">*</span></label>
            <select id="rechnungForm-0" value={customerId} onChange={e => kundeWaehlen(e.target.value)} className={inputCls}>
              <option value="">— Kunden auswählen —</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label htmlFor="rechnungForm-1" className="text-xs font-medium text-ink-2 block mb-1">
              z.H. / Ansprechpartner <span className="text-ink-3">(optional)</span>
            </label>
            <input id="rechnungForm-1" type="text" placeholder="z.B. Hrn. AL Ing. Harald Nirschl"
              value={contactPerson} onChange={e => setContactPerson(e.target.value)}
              className={inputCls} />
            <p className="text-xs text-ink-3 mt-1">
              Wird beim Kundenwechsel aus dem Kundenstamm übernommen und erscheint auf der
              Rechnung als „z.H."-Zeile. Änderungen hier gelten nur für diese Rechnung.
            </p>
          </div>
          <div>
            <label htmlFor="rechnungForm-2" className="text-xs font-medium text-ink-2 block mb-1">Rechnungsdatum</label>
            <input id="rechnungForm-2" type="date" value={invoiceDate}
              onChange={e => {
                setInvoiceDate(e.target.value);
                setDueDate(addDays(e.target.value, zahlungsziel));
              }}
              className={inputCls} />
          </div>
          <div>
            <label htmlFor="rechnungForm-3" className="text-xs font-medium text-ink-2 block mb-1">Fällig am</label>
            <input id="rechnungForm-3" type="date" value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className={inputCls} />
            <p className="text-xs text-ink-3 mt-1">
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
      <div className="card p-6">
        <h2 className="font-semibold text-ink mb-4">Positionen</h2>
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div key={idx} className="grid gap-2 pb-3 border-b border-line last:border-0 last:pb-0">
              <div className="flex gap-2 items-start">
                <span className="mt-2 text-xs font-semibold text-navy w-12 shrink-0">
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
                    className="mt-0.5 text-ink-3 hover:text-red-400 transition-colors text-xl leading-none">
                    &times;
                  </button>
                )}
              </div>
              <div className="grid grid-cols-5 gap-2 pl-12">
                <div>
                  <label htmlFor={`pos-${idx}-menge`} className="text-xs text-ink-3 block mb-0.5">Menge</label>
                  {/* Text statt number: erlaubt Komma und ein leeres Feld.
                      Bei type=number blieb nach dem Leeren eine 0 stehen,
                      hinter die weitergetippt wurde ("033,25"). */}
                  <input id={`pos-${idx}-menge`}
                    type="text" inputMode="decimal" placeholder="1"
                    value={item.menge_text ?? String(item.quantity ?? '').replace('.', ',')}
                    onChange={e => updateItem(idx, { menge_text: e.target.value, quantity: zahl(e.target.value) })}
                    onBlur={() => updateItem(idx, { menge_text: undefined })}
                    className={inputCls} />
                </div>
                <div>
                  <label htmlFor={`pos-${idx}-einheit`} className="text-xs text-ink-3 block mb-0.5">Einheit</label>
                  <input id={`pos-${idx}-einheit`} type="text" list="einheiten-liste" placeholder="Stk." value={item.unit}
                    onChange={e => updateItem(idx, { unit: e.target.value })}
                    className={inputCls} />
                </div>
                <div>
                  <label htmlFor={`pos-${idx}-preis`} className="text-xs text-ink-3 block mb-0.5">Einzelpreis (netto)</label>
                  <input id={`pos-${idx}-preis`}
                    type="text" inputMode="decimal" placeholder="0,00"
                    value={item.preis_text ?? String(item.unit_price ?? '').replace('.', ',')}
                    onChange={e => updateItem(idx, { preis_text: e.target.value, unit_price: zahl(e.target.value) })}
                    onBlur={() => updateItem(idx, { preis_text: undefined })}
                    className={inputCls} />
                </div>
                <div>
                  <label htmlFor={`pos-${idx}-ust`} className="text-xs text-ink-3 block mb-0.5">USt %</label>
                  <select id={`pos-${idx}-ust`} value={item.vat_rate}
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
                  <p className="text-xs text-ink-3 block mb-0.5">
                    {istNettoModus ? 'Gesamt netto' : 'Gesamt brutto'}
                  </p>
                  <div className="border border-line-2 rounded-lg px-3 py-2 text-sm bg-row text-right font-medium text-ink">
                    {formatCurrency(istNettoModus ? item.amount_net : item.amount_gross)}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 pl-12">
                <div>
                  <label htmlFor={`pos-${idx}-berater`} className="text-xs text-ink-3 block mb-0.5">Berater</label>
                  <input id={`pos-${idx}-berater`} type="text" placeholder="Name des Beraters"
                    value={item.berater ?? ''}
                    onChange={e => updateItem(idx, { berater: e.target.value })}
                    className={inputCls} />
                </div>
                <div>
                  <label htmlFor={`pos-${idx}-von`} className="text-xs text-ink-3 block mb-0.5">Leistungszeitraum von</label>
                  <input id={`pos-${idx}-von`} type="date" value={item.leistung_von ?? ''}
                    onChange={e => updateItem(idx, { leistung_von: e.target.value || null })}
                    className={inputCls} />
                </div>
                <div>
                  <label htmlFor={`pos-${idx}-bis`} className="text-xs text-ink-3 block mb-0.5">Leistungszeitraum bis</label>
                  <input id={`pos-${idx}-bis`} type="date" value={item.leistung_bis ?? ''}
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
          className="mt-4 text-sm text-navy hover:text-navy font-medium transition-colors"
        >
          + Position hinzufügen
        </button>

        {/* Summen */}
        <div className="mt-5 pt-4 border-t border-line space-y-1.5 text-sm">
          <div className="flex justify-between text-ink-2">
            <span>Netto gesamt</span>
            <span>{formatCurrency(totalNet)}</span>
          </div>
          <div className="flex justify-between text-ink-2">
            <span>USt gesamt</span>
            <span>{formatCurrency(totalVat)}</span>
          </div>
          <div className="flex justify-between font-bold text-ink text-base pt-1 border-t border-line-2">
            <span>Brutto gesamt</span>
            <span>{formatCurrency(totalGross)}</span>
          </div>
          <div className="pt-2 text-xs text-ink-3">
            Zahlungskonditionen: {zahlungsziel === 0
              ? 'zahlbar bei Erhalt'
              : `innerhalb von ${zahlungsziel} Tagen netto`}
            {gewaehlterKunde && <span className="text-ink-3"> · laut Kundenstamm</span>}
          </div>
        </div>
      </div>

      {/* Notiz */}
      <div className="card p-6">
        <h2 className="font-semibold text-ink mb-3">Notiz / Anmerkung (erscheint auf Rechnung)</h2>
        <textarea rows={2} placeholder="z.B. Zahlbar binnen 14 Tagen ohne Abzug…"
          value={notes} onChange={e => setNotes(e.target.value)}
          className="w-full border border-line-2 rounded-lg px-4 py-2.5 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30 resize-none" />
      </div>

      {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      {!istFinalisiert && (
        <p className="text-xs text-ink-3 leading-relaxed">
          Beim Finalisieren wird die Rechnungsnummer vergeben und die Rechnung als offener Posten geführt.
          Die Erlösbuchung entsteht erst, wenn Sie den Zahlungseingang erfassen (Ist-Besteuerung).
        </p>
      )}

      {/* Aktionen */}
      <div className="flex gap-3">
        <button type="button" onClick={() => router.push('/rechnungen')}
          className="px-5 py-3 rounded-xl border border-line-2 text-sm font-medium text-ink-2 hover:bg-row transition-colors">
          Abbrechen
        </button>
        {istFinalisiert ? (
          <button type="button" onClick={() => handleSave(false)} disabled={loading}
            className="flex-1 py-3 rounded-xl bg-navy hover:bg-navy-2 text-white text-sm font-semibold transition-colors disabled:opacity-50">
            {loading ? 'Speichern…' : 'Änderungen speichern'}
          </button>
        ) : (
          <>
            <button type="button" onClick={() => handleSave(false)} disabled={loading}
              className="flex-1 py-3 rounded-xl border-2 border-navy text-navy text-sm font-semibold hover:bg-navy/5 transition-colors disabled:opacity-50">
              {loading ? 'Speichern…' : 'Als Entwurf speichern'}
            </button>
            <button type="button" onClick={() => handleSave(true)} disabled={loading}
              className="flex-1 py-3 rounded-xl bg-navy hover:bg-navy-2 text-white text-sm font-semibold transition-colors disabled:opacity-50">
              {loading ? 'Finalisieren…' : 'Finalisieren'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
