'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import AppEinladungCard from './AppEinladungCard';

type UstStatus = 'kleinunternehmer' | 'regelbesteuerung';

type ClientData = {
  id: string;
  company_name: string;
  uid_number: string | null;
  vat_period: string;
  betriebsbeginn: string | null;
  booking_mode: string;
  ust_status: UstStatus;
  regelbesteuerung_optiert: boolean;
  regelbesteuerung_options_jahr: number | null;
  regelbesteuerung_bindung_bis: number | null;
};

type BrandingData = {
  client_id: string;
  logo_url: string | null;
  brand_color: string;
  company_street: string | null;
  company_zip: string | null;
  company_city: string | null;
  company_country: string;
  company_phone: string | null;
  company_email: string | null;
  company_website: string | null;
  iban: string | null;
  bic: string | null;
  bank_name: string | null;
  invoice_prefix: string;
  invoice_next_nr: number;
  invoice_nr_digits: number;
  invoice_suffix: string;
  payment_days: number;
  invoice_footer_left: string | null;
  invoice_footer_center: string | null;
  invoice_footer_right: string | null;
  show_sender_in_header: boolean;
} | null;

// Grenzen § 6 Abs. 1 Z 27 UStG (seit 1.1.2025)
const KU_GRENZE = 55000;
const KU_TOLERANZ = 60500;

export default function EinstellungenForm({
  client,
  branding,
  currentYearRevenue,
  userEmail,
}: {
  client: ClientData;
  branding: BrandingData;
  currentYearRevenue: number;
  userEmail: string;
}) {
  const supabase = createClient();
  const router = useRouter();

  // ── Buchhaltungs-Einstellungen ────────────────────────────
  const [bookingMode, setBookingMode] = useState(client.booking_mode ?? 'netto');
  const [vatPeriod,   setVatPeriod]   = useState(client.vat_period ?? 'quarterly');
  const [betriebsbeginn, setBetriebsbeginn] = useState(client.betriebsbeginn ?? '');
  const [uidNumber,   setUidNumber]   = useState(client.uid_number ?? '');

  // ── USt-Status: Kleinunternehmer / Regelbesteuerung ───────
  const [ustStatus, setUstStatus] = useState<UstStatus>(client.ust_status ?? 'regelbesteuerung');
  const [regelOptiert, setRegelOptiert] = useState(client.regelbesteuerung_optiert ?? false);
  const [regelJahr, setRegelJahr] = useState<number>(
    client.regelbesteuerung_options_jahr ?? new Date().getFullYear()
  );

  // ── Branding ──────────────────────────────────────────────
  const [brandColor,      setBrandColor]      = useState(branding?.brand_color      ?? '#47A6CC');
  const [companyStreet,   setCompanyStreet]   = useState(branding?.company_street   ?? '');
  const [companyZip,      setCompanyZip]      = useState(branding?.company_zip      ?? '');
  const [companyCity,     setCompanyCity]     = useState(branding?.company_city     ?? '');
  const [companyCountry,  setCompanyCountry]  = useState(branding?.company_country  ?? 'Österreich');
  const [companyPhone,    setCompanyPhone]    = useState(branding?.company_phone    ?? '');
  const [companyEmail,    setCompanyEmail]    = useState(branding?.company_email    ?? '');
  const [companyWebsite,  setCompanyWebsite]  = useState(branding?.company_website  ?? '');
  const [iban,            setIban]            = useState(branding?.iban             ?? '');
  const [bic,             setBic]             = useState(branding?.bic              ?? '');
  const [bankName,        setBankName]        = useState(branding?.bank_name        ?? '');
  const [invoicePrefix,   setInvoicePrefix]   = useState(branding?.invoice_prefix   ?? 'RE-');
  const [invoiceNextNr,   setInvoiceNextNr]   = useState(branding?.invoice_next_nr  ?? 1);
  const [invoiceNrDigits, setInvoiceNrDigits] = useState(branding?.invoice_nr_digits ?? 3);
  const [invoiceSuffix,   setInvoiceSuffix]   = useState(branding?.invoice_suffix   ?? '');
  const [paymentDays,     setPaymentDays]     = useState(branding?.payment_days     ?? 14);
  const [footerLeft,      setFooterLeft]      = useState(branding?.invoice_footer_left   ?? '');
  const [footerCenter,    setFooterCenter]    = useState(branding?.invoice_footer_center ?? '');
  const [footerRight,     setFooterRight]     = useState(branding?.invoice_footer_right  ?? '');
  const [logoUrl,         setLogoUrl]         = useState(branding?.logo_url         ?? '');
  const [showSenderInHeader, setShowSenderInHeader] = useState(branding?.show_sender_in_header !== false);
  const [logoUploading,   setLogoUploading]   = useState(false);

  const [loading, setLoading] = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Rechnungsnummer-Vorschau. Muss zu rechnungsnummer_formatieren()
  // aus Migration 022 passen – Platzhalter {JJJJ} vor {JJ} ersetzen.
  const hatJahresSuffix = /\{JJJJ\}|\{JJ\}/.test(invoiceSuffix);

  function formatiereNummer(nr: number, jahr: number) {
    const suffix = invoiceSuffix
      .replace(/\{JJJJ\}/g, String(jahr))
      .replace(/\{JJ\}/g, String(jahr % 100).padStart(2, '0'));
    return `${invoicePrefix}${String(nr).padStart(invoiceNrDigits, '0')}${suffix}`;
  }

  const aktuellesJahr = new Date().getFullYear();
  const nrPreview = formatiereNummer(invoiceNextNr, aktuellesJahr);
  // Bei jährlichem Neustart beginnt das Folgejahr wieder bei 1
  const nrPreviewNaechstesJahr = formatiereNummer(1, aktuellesJahr + 1);

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'].includes(file.type)) {
      setError('Nur PNG, JPG, SVG oder WEBP erlaubt.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Logo darf maximal 2 MB groß sein.');
      return;
    }
    setLogoUploading(true);
    setError('');
    const ext = file.name.split('.').pop();
    const path = `${client.id}/logo.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('logos')
      .upload(path, file, { upsert: true });
    if (uploadError) {
      setError(`Logo-Upload fehlgeschlagen: ${uploadError.message}`);
    } else {
      const { data } = supabase.storage.from('logos').getPublicUrl(path);
      setLogoUrl(`${data.publicUrl}?t=${Date.now()}`);
    }
    setLogoUploading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSaved(false);

    // 1. clients Tabelle aktualisieren
    const { error: clientError } = await supabase
      .from('clients')
      .update({
        booking_mode: bookingMode,
        vat_period:   vatPeriod as 'monthly' | 'quarterly',
        betriebsbeginn: betriebsbeginn || null,
        uid_number:   uidNumber || null,
        ust_status:   ustStatus,
        regelbesteuerung_optiert:      ustStatus === 'regelbesteuerung' ? regelOptiert : false,
        regelbesteuerung_options_jahr: ustStatus === 'regelbesteuerung' && regelOptiert ? regelJahr : null,
        regelbesteuerung_bindung_bis:  ustStatus === 'regelbesteuerung' && regelOptiert ? regelJahr + 4 : null,
      })
      .eq('id', client.id);

    if (clientError) {
      setError(`Fehler (Einstellungen): ${clientError.message}`);
      setLoading(false);
      return;
    }

    // 2. client_branding upsert
    const brandingPayload = {
      client_id:         client.id,
      brand_color:       brandColor,
      company_street:    companyStreet   || null,
      company_zip:       companyZip      || null,
      company_city:      companyCity     || null,
      company_country:   companyCountry  || 'Österreich',
      company_phone:     companyPhone    || null,
      company_email:     companyEmail    || null,
      company_website:   companyWebsite  || null,
      iban:              iban            || null,
      bic:               bic             || null,
      bank_name:         bankName        || null,
      invoice_prefix:    invoicePrefix   || 'RE-',
      invoice_next_nr:   invoiceNextNr,
      invoice_nr_digits: invoiceNrDigits,
      invoice_suffix:    invoiceSuffix,
      payment_days:      paymentDays,
      invoice_footer_left:   footerLeft    || null,
      invoice_footer_center: footerCenter  || null,
      invoice_footer_right:  footerRight   || null,
      show_sender_in_header: showSenderInHeader,
      ...(logoUrl ? { logo_url: logoUrl } : {}),
    };

    const { error: brandingError } = await supabase
      .from('client_branding')
      .upsert(brandingPayload, { onConflict: 'client_id' });

    if (brandingError) {
      // Migration 009 noch nicht ausgeführt → Buchhaltungseinstellungen wurden trotzdem gespeichert
      if (brandingError.message.includes('schema cache') || brandingError.message.includes('does not exist')) {
        setSaved(true);
        setError('Rechnungsdesign konnte nicht gespeichert werden – Migration 009 in Supabase noch nicht ausgeführt. Buchhaltungseinstellungen wurden gespeichert.');
        setTimeout(() => router.refresh(), 2000);
      } else {
        setError(`Fehler (Rechnungsdesign): ${brandingError.message}`);
      }
      setLoading(false);
      return;
    }

    setSaved(true);
    setTimeout(() => router.refresh(), 1200);
    setLoading(false);
  }

  // Ampel für die Umsatzgrenze
  const revenuePct = Math.round((currentYearRevenue / KU_GRENZE) * 100);
  const revenueLevel: 'ok' | 'warn' | 'over' | 'critical' =
    currentYearRevenue >= KU_TOLERANZ ? 'critical' :
    currentYearRevenue >  KU_GRENZE   ? 'over'      :
    currentYearRevenue >= KU_GRENZE * 0.8 ? 'warn'   : 'ok';

  const revenueBoxCls = {
    ok:       'bg-green-50 text-green-700 border-green-200',
    warn:     'bg-amber-50 text-amber-700 border-amber-200',
    over:     'bg-orange-50 text-orange-700 border-orange-200',
    critical: 'bg-red-50 text-red-700 border-red-200',
  }[revenueLevel];

  const revenueText = {
    ok:       `Laufender Jahresumsatz ${formatEuro(currentYearRevenue)} (${revenuePct}% der 55.000-€-Grenze).`,
    warn:     `Achtung: Laufender Jahresumsatz ${formatEuro(currentYearRevenue)} (${revenuePct}% der 55.000-€-Grenze) – die Kleinunternehmergrenze rückt näher.`,
    over:     `Laufender Jahresumsatz ${formatEuro(currentYearRevenue)} überschreitet bereits die 55.000-€-Grenze. Innerhalb der 10-%-Toleranzgrenze (bis 60.500 €) bleibt die Befreiung im laufenden Jahr noch aufrecht, ab dem Folgejahr grundsätzlich nicht mehr.`,
    critical: `Laufender Jahresumsatz ${formatEuro(currentYearRevenue)} überschreitet die Toleranzgrenze von 60.500 €. Die Kleinunternehmerbefreiung entfällt rückwirkend ab dem Beginn des Umsatzes, der zur Überschreitung geführt hat – bitte mit der Kanzlei abstimmen.`,
  }[revenueLevel];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* ── BUCHHALTUNGSEINSTELLUNGEN ─────────────────────── */}
      <SectionHeader title="Buchhaltung" />

      {/* Buchungsmodus */}
      <div className="card p-6">
        <h2 className="font-semibold text-ink mb-1">Buchungsmodus</h2>
        <p className="text-sm text-ink-2 mb-4">
          Legt fest ob beim Erfassen einer Buchung der Netto- oder Bruttobetrag eingegeben wird.
        </p>
        <div className="flex gap-3">
          <ModeButton
            active={bookingMode === 'netto'}
            onClick={() => setBookingMode('netto')}
            label="Netto-Eingabe"
            sub="Nettobetrag eingeben → Brutto wird berechnet"
          />
          <ModeButton
            active={bookingMode === 'brutto'}
            onClick={() => setBookingMode('brutto')}
            label="Brutto-Eingabe"
            sub="Rechnungsbetrag eingeben → Netto wird berechnet"
          />
        </div>
      </div>

      {/* USt-Voranmeldungszeitraum */}
      <div className="card p-6">
        <h2 className="font-semibold text-ink mb-1">USt-Voranmeldungszeitraum</h2>
        <p className="text-sm text-ink-2 mb-4">Wie oft wird die UVA eingereicht?</p>
        <div className="flex gap-3">
          <PeriodButton active={vatPeriod === 'monthly'}   onClick={() => setVatPeriod('monthly')}   label="Monatlich" />
          <PeriodButton active={vatPeriod === 'quarterly'} onClick={() => setVatPeriod('quarterly')} label="Vierteljährlich" />
        </div>
      </div>

      {/* Betriebsbeginn (Migration 044) */}
      <div className="card p-6">
        <h2 className="font-semibold text-ink mb-1">Betriebsbeginn</h2>
        <p className="text-sm text-ink-2 mb-4">
          Offizieller Beginn der betrieblichen Tätigkeit – z.&nbsp;B. bei einem
          Rumpfwirtschaftsjahr. Monate davor verlangen keinen Monatsabschluss
          und tauchen nicht in den Aufgaben auf. Leer lassen, wenn keine
          Einschränkung gewünscht ist.
        </p>
        <input
          type="date"
          value={betriebsbeginn}
          onChange={e => setBetriebsbeginn(e.target.value)}
          className="border border-line-2 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30"
        />
      </div>

      {/* USt-Status: Kleinunternehmer / Regelbesteuerung */}
      <div className="card p-6">
        <h2 className="font-semibold text-ink mb-1">USt-Status</h2>
        <p className="text-sm text-ink-2 mb-4">
          Kleinunternehmerregelung gem. § 6 Abs. 1 Z 27 UStG oder reguläre Umsatzsteuerpflicht.
        </p>
        <div className="flex gap-3 mb-3">
          <ModeButton
            active={ustStatus === 'kleinunternehmer'}
            onClick={() => setUstStatus('kleinunternehmer')}
            label="Kleinunternehmer"
            sub="Umsatzsteuerbefreit, keine USt auf Rechnungen"
          />
          <ModeButton
            active={ustStatus === 'regelbesteuerung'}
            onClick={() => setUstStatus('regelbesteuerung')}
            label="Regelbesteuerung"
            sub="Umsatzsteuerpflichtig, Vorsteuerabzug möglich"
          />
        </div>

        {ustStatus === 'kleinunternehmer' && (
          <div className={`text-xs px-3 py-2.5 rounded-lg border ${revenueBoxCls}`}>
            {revenueText}
          </div>
        )}

        {ustStatus === 'regelbesteuerung' && (
          <div className="mt-2 border-t border-line pt-3">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={regelOptiert}
                onChange={e => setRegelOptiert(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-sm text-ink">
                Freiwilliger Verzicht auf die Kleinunternehmerregelung
                (Regelbesteuerungsantrag, Formular <strong>U12</strong>) – die Umsatzgrenze
                wäre sonst nicht überschritten.
              </span>
            </label>

            {regelOptiert && (
              <div className="mt-3 flex items-center gap-3 pl-6">
                <label htmlFor="einstellungenForm-0" className="text-xs text-ink-2 font-medium">Jahr der Verzichtserklärung</label>
                <input id="einstellungenForm-0"
                  type="number"
                  value={regelJahr}
                  onChange={e => setRegelJahr(Number(e.target.value))}
                  className="w-24 border border-line-2 rounded-lg px-3 py-1.5 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30"
                />
                <span className="text-xs text-ink-3">
                  bindend bis Ende {regelJahr + 4} (5 Kalenderjahre), Widerruf erst danach möglich
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* UID-Nummer */}
      <div className="card p-6">
        <h2 className="font-semibold text-ink mb-1">UID-Nummer</h2>
        <p className="text-sm text-ink-2 mb-3">Österreichische Umsatzsteuer-Identifikationsnummer</p>
        <input
          type="text"
          placeholder="ATU12345678"
          value={uidNumber}
          onChange={e => setUidNumber(e.target.value)}
          className={inputCls}
        />
      </div>

      {/* Belegverwaltung */}
      <div className="card p-6">
        <h2 className="font-semibold text-ink mb-1">Belegverwaltung</h2>
        <p className="text-sm text-ink-2">
          Das Anhängen von Belegen (PDF, JPG, PNG) ist bei jeder Buchung verfügbar.
        </p>
        <p className="text-xs text-blue-600 mt-2 bg-blue-50 px-3 py-1.5 rounded-lg inline-block">
          Belegverwaltung immer aktiv
        </p>
      </div>

      {/* ── RECHNUNGSDESIGN ───────────────────────────────── */}
      <SectionHeader
        title="Rechnungsdesign"
        subtitle="Wird auf Ausgangsrechnungen verwendet – unabhängig vom App-Design"
      />

      {/* Logo */}
      <div className="card p-6">
        <h2 className="font-semibold text-ink mb-1">Firmenlogo</h2>
        <p className="text-sm text-ink-2 mb-4">PNG, JPG oder SVG, max. 2 MB – erscheint oben auf der Rechnung</p>
        <div className="flex items-center gap-4">
          {logoUrl ? (
            <div className="w-24 h-16 border border-line-2 rounded-lg overflow-hidden bg-row flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain p-1" />
            </div>
          ) : (
            <div className="w-24 h-16 border-2 border-dashed border-line-2 rounded-lg flex items-center justify-center text-ink-3 text-xs text-center leading-tight px-1">
              Kein Logo
            </div>
          )}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={logoUploading}
              className="px-4 py-2 text-sm border border-line-2 rounded-lg hover:bg-row transition-colors disabled:opacity-50"
            >
              {logoUploading ? 'Wird hochgeladen…' : logoUrl ? 'Logo ersetzen' : 'Logo hochladen'}
            </button>
            {logoUrl && (
              <button
                type="button"
                onClick={() => setLogoUrl('')}
                className="px-4 py-2 text-sm text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
              >
                Logo entfernen
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="hidden"
            onChange={handleLogoUpload}
          />
        </div>
      </div>

      {/* Primärfarbe */}
      <div className="card p-6">
        <h2 className="font-semibold text-ink mb-1">Primärfarbe</h2>
        <p className="text-sm text-ink-2 mb-4">Wird für Rechnungskopf und Akzente verwendet</p>
        <div className="flex items-center gap-4">
          <input
            type="color"
            value={brandColor}
            onChange={e => setBrandColor(e.target.value)}
            className="w-12 h-10 rounded-sm cursor-pointer border border-line-2"
          />
          <input
            type="text"
            value={brandColor}
            onChange={e => setBrandColor(e.target.value)}
            placeholder="#47A6CC"
            className="w-32 border border-line-2 rounded-lg px-3 py-2 text-sm font-mono focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30"
          />
          <div
            className="flex-1 h-10 rounded-lg border border-line"
            style={{ backgroundColor: brandColor }}
          />
        </div>
      </div>

      {/* Firmenadresse */}
      <div className="card p-6">
        <h2 className="font-semibold text-ink mb-1">Firmenadresse</h2>
        <p className="text-sm text-ink-2 mb-4">
          Erscheint in der linken Fußzeilenspalte der Rechnung – und, je nach Einstellung unten,
          zusätzlich im Rechnungskopf.
        </p>
        <div className="space-y-3">
          <input
            type="text" placeholder="Straße und Hausnummer"
            value={companyStreet} onChange={e => setCompanyStreet(e.target.value)}
            className={inputCls}
          />
          <div className="flex gap-3">
            <input
              type="text" placeholder="PLZ"
              value={companyZip} onChange={e => setCompanyZip(e.target.value)}
              className="w-28 border border-line-2 rounded-lg px-4 py-2.5 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30"
            />
            <input
              type="text" placeholder="Ort"
              value={companyCity} onChange={e => setCompanyCity(e.target.value)}
              className="flex-1 border border-line-2 rounded-lg px-4 py-2.5 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30"
            />
          </div>
          <input
            type="text" placeholder="Land"
            value={companyCountry} onChange={e => setCompanyCountry(e.target.value)}
            className={inputCls}
          />
          <div className="flex gap-3">
            <input
              type="tel" placeholder="Telefon"
              value={companyPhone} onChange={e => setCompanyPhone(e.target.value)}
              className="flex-1 border border-line-2 rounded-lg px-4 py-2.5 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30"
            />
            <input
              type="email" placeholder="E-Mail"
              value={companyEmail} onChange={e => setCompanyEmail(e.target.value)}
              className="flex-1 border border-line-2 rounded-lg px-4 py-2.5 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30"
            />
          </div>
          <input
            type="url" placeholder="Website (https://…)"
            value={companyWebsite} onChange={e => setCompanyWebsite(e.target.value)}
            className={inputCls}
          />

          {/* Absenderblock im Rechnungskopf abschaltbar (Migration 028).
              Wer ein Logo hinterlegt hat, will oben oft nur das Logo –
              die Angaben stehen ohnehin vollständig in der Fußzeile. */}
          <label className={`flex items-start gap-3 rounded-lg border p-3 mt-1 ${
            logoUrl
              ? 'border-line-2 cursor-pointer hover:bg-row'
              : 'border-line bg-row cursor-not-allowed'
          }`}>
            <input
              type="checkbox"
              checked={showSenderInHeader}
              disabled={!logoUrl}
              onChange={e => setShowSenderInHeader(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-brand"
            />
            <span className="text-sm">
              <span className="font-medium text-ink">
                Firmenname und Adresse auch im Rechnungskopf zeigen
              </span>
              <span className="block text-xs text-ink-2 mt-0.5 leading-relaxed">
                {logoUrl
                  ? 'Ausgeschaltet steht im Rechnungskopf nur das Logo. Firmenwortlaut, Adresse, Kontakt, Bankverbindung und UID bleiben in der Fußzeile – die Rechnung erfüllt § 11 UStG also weiterhin.'
                  : 'Erst wählbar, wenn oben ein Logo hinterlegt ist – sonst bliebe der Rechnungskopf leer.'}
              </span>
            </span>
          </label>
        </div>
      </div>

      {/* Bankverbindung */}
      <div className="card p-6">
        <h2 className="font-semibold text-ink mb-1">Bankverbindung</h2>
        <p className="text-sm text-ink-2 mb-4">Wird im Zahlungshinweis auf der Rechnung angezeigt</p>
        <div className="space-y-3">
          {/* Sichtbare Beschriftungen statt bloßer Platzhalter: die
              verschwinden beim Ausfüllen, und Passwortmanager tragen
              dann gern den Kontoinhaber ins Bankfeld ein. */}
          <div>
            <label htmlFor="bank-iban" className="text-xs font-medium text-ink-2 block mb-1">IBAN</label>
            <input
              id="bank-iban" type="text" placeholder="AT.. .... .... .... ...."
              autoComplete="off" data-1p-ignore data-lpignore="true"
              value={iban} onChange={e => setIban(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="flex gap-3">
            <div className="w-44">
              <label htmlFor="bank-bic" className="text-xs font-medium text-ink-2 block mb-1">BIC (optional)</label>
              <input
                id="bank-bic" type="text" placeholder="z.B. GIBAATWWXXX"
                autoComplete="off" data-1p-ignore data-lpignore="true"
                value={bic} onChange={e => setBic(e.target.value)}
                className="w-full border border-line-2 rounded-lg px-4 py-2.5 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="bank-name" className="text-xs font-medium text-ink-2 block mb-1">
                Name des Kreditinstituts (optional)
              </label>
              <input
                id="bank-name" type="text" placeholder="z.B. Erste Bank – nicht der Kontoinhaber"
                autoComplete="off" data-1p-ignore data-lpignore="true"
                value={bankName} onChange={e => setBankName(e.target.value)}
                className="w-full border border-line-2 rounded-lg px-4 py-2.5 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30"
              />
            </div>
          </div>
          <p className="text-xs text-ink-3">
            Diese drei Angaben erscheinen in der rechten Fußzeilenspalte der Rechnung.
            Der Kontoinhaber gehört nicht hierher – er ergibt sich aus dem Firmenwortlaut.
          </p>
        </div>
      </div>

      {/* Rechnungsnummer */}
      <div className="card p-6">
        <h2 className="font-semibold text-ink mb-3">Rechnungsnummer</h2>
        <div className="space-y-3">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label htmlFor="einstellungenForm-1" className="text-xs text-ink-2 font-medium block mb-1">Prefix</label>
              <input id="einstellungenForm-1"
                type="text" placeholder="RE-"
                value={invoicePrefix} onChange={e => setInvoicePrefix(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="w-28">
              <label htmlFor="einstellungenForm-2" className="text-xs text-ink-2 font-medium block mb-1">Nächste Nr.</label>
              <input id="einstellungenForm-2"
                type="number" min={1}
                value={invoiceNextNr} onChange={e => setInvoiceNextNr(Number(e.target.value))}
                className={inputCls}
              />
            </div>
            <div className="w-36">
              <label htmlFor="einstellungenForm-3" className="text-xs text-ink-2 font-medium block mb-1">Stellen</label>
              <select id="einstellungenForm-3"
                value={invoiceNrDigits}
                onChange={e => setInvoiceNrDigits(Number(e.target.value))}
                className={inputCls}
              >
                {[1,2,3,4,5,6].map(n => (
                  <option key={n} value={n}>{n} Stellen ({String(1).padStart(n,'0')})</option>
                ))}
              </select>
            </div>
            <div className="w-40">
              <label htmlFor="einstellungenForm-4" className="text-xs text-ink-2 font-medium block mb-1">Suffix</label>
              <input id="einstellungenForm-4"
                type="text" placeholder="/{JJ}"
                value={invoiceSuffix} onChange={e => setInvoiceSuffix(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
          <p className="text-xs text-ink-3 leading-relaxed">
            Platzhalter im Suffix: <span className="font-mono">{'{JJ}'}</span> für das zweistellige Jahr,{' '}
            <span className="font-mono">{'{JJJJ}'}</span> für das vierstellige. Leer lassen für kein Suffix.
            Das Jahr richtet sich nach dem Rechnungsdatum.
          </p>
          <div className="bg-row rounded-lg px-4 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-xs text-ink-3">Vorschau nächste Rechnung:</span>
            <span className="font-mono font-semibold text-navy">{nrPreview}</span>
          </div>
          {hatJahresSuffix ? (
            <p className="text-xs text-navy bg-surface-band rounded-lg px-4 py-2.5 leading-relaxed">
              Der Zähler beginnt zu jedem Jahreswechsel wieder bei 1 – im Beispiel oben also{' '}
              <span className="font-mono">{nrPreviewNaechstesJahr}</span> für die erste Rechnung des Folgejahres.
              Die Nummern bleiben eindeutig, weil das Jahr Teil der Nummer ist.
            </p>
          ) : (
            <p className="text-xs text-ink-3 bg-row rounded-lg px-4 py-2.5 leading-relaxed">
              Ohne Jahresplatzhalter läuft der Zähler durchgehend über alle Jahre weiter.
            </p>
          )}
        </div>
      </div>

      {/* Fußzeile */}
      <div className="card p-6">
        <h2 className="font-semibold text-ink mb-1">Rechnungsfußzeile</h2>
        <p className="text-sm text-ink-2 mb-4">
          Die Fußzeile ist dreispaltig. Firmenwortlaut, Adresse, Kontaktdaten, Bankverbindung
          und UID werden automatisch aus den Feldern oben eingesetzt – hier ergänzen Sie nur,
          was zusätzlich in der jeweiligen Spalte stehen soll.
        </p>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="fz-links" className="text-xs font-medium text-ink-2 block mb-1">Links</label>
            <textarea id="fz-links" rows={3}
              placeholder="z.B. FN 415469i · HG Wr. Neustadt"
              value={footerLeft} onChange={e => setFooterLeft(e.target.value)}
              className="w-full border border-line-2 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30 resize-none" />
            <p className="text-xs text-ink-3 mt-1">Unter Firma und Adresse</p>
          </div>
          <div>
            <label htmlFor="fz-mitte" className="text-xs font-medium text-ink-2 block mb-1">Mitte</label>
            <textarea id="fz-mitte" rows={3}
              placeholder="z.B. Gerichtsstand Wiener Neustadt"
              value={footerCenter} onChange={e => setFooterCenter(e.target.value)}
              className="w-full border border-line-2 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30 resize-none" />
            <p className="text-xs text-ink-3 mt-1">Unter Telefon, E-Mail und Web</p>
          </div>
          <div>
            <label htmlFor="fz-rechts" className="text-xs font-medium text-ink-2 block mb-1">Rechts</label>
            <textarea id="fz-rechts" rows={3}
              placeholder="z.B. Eigentumsvorbehalt bis zur vollständigen Bezahlung"
              value={footerRight} onChange={e => setFooterRight(e.target.value)}
              className="w-full border border-line-2 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30 resize-none" />
            <p className="text-xs text-ink-3 mt-1">Unter Bankverbindung und UID</p>
          </div>
        </div>

        {/* Vorschau – so steht es auf der Rechnung */}
        <p className="text-xs font-medium text-ink-2 mt-5 mb-2">So sieht die Fußzeile auf der Rechnung aus</p>
        <div className="border-t border-line-2 pt-3 grid grid-cols-3 gap-4 text-[11px] text-ink-3 leading-relaxed bg-row rounded-lg px-4 pb-3">
          <div>
            <p className="font-semibold text-ink-2">{client.company_name || 'Firmenwortlaut'}</p>
            {companyStreet && <p>{companyStreet}</p>}
            {(companyZip || companyCity) && <p>{[companyZip, companyCity].filter(Boolean).join(' ')}</p>}
            {footerLeft && <p className="whitespace-pre-line">{footerLeft}</p>}
          </div>
          <div>
            {companyPhone   && <p>Tel: {companyPhone}</p>}
            {companyEmail   && <p>{companyEmail}</p>}
            {companyWebsite && <p>{companyWebsite}</p>}
            {footerCenter && <p className="whitespace-pre-line">{footerCenter}</p>}
          </div>
          <div>
            {iban && <p>IBAN: {iban}</p>}
            {(bic || bankName) && <p>{[bic, bankName].filter(Boolean).join(' · ')}</p>}
            {uidNumber && <p>UID: {uidNumber}</p>}
            {footerRight && <p className="whitespace-pre-line">{footerRight}</p>}
          </div>
        </div>
        {!uidNumber && (
          <p className="text-xs text-amber-600 mt-2">
            Ihre UID fehlt noch. Sie ist auf Rechnungen ab 10.000 € brutto Pflichtangabe
            (§ 11 Abs. 1 Z 2 UStG) und wird oben unter „Stammdaten“ hinterlegt.
          </p>
        )}
      </div>

      <AppEinladungCard defaultEmail={userEmail} />

      {/* Meldungen */}
      {error && (
        <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>
      )}
      {saved && (
        <p className="text-green-700 text-sm bg-green-50 px-3 py-2 rounded-lg">✓ Einstellungen gespeichert!</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-navy hover:bg-navy-2 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
      >
        {loading ? 'Speichern…' : 'Alle Einstellungen speichern'}
      </button>
    </form>
  );
}

// ── Hilfsstyles & Subkomponenten ──────────────────────────────

const inputCls = 'w-full border border-line-2 rounded-lg px-4 py-2.5 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30';

function formatEuro(n: number) {
  return n.toLocaleString('de-AT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="pt-2 pb-1">
      <h2 className="text-base font-bold text-navy uppercase tracking-wide">{title}</h2>
      {subtitle && <p className="text-xs text-ink-3 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function ModeButton({ active, onClick, label, sub }: {
  active: boolean; onClick: () => void; label: string; sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={active ? { backgroundColor: '#14355C', color: 'white', borderColor: '#14355C' } : {}}
      className={`flex-1 py-4 rounded-xl border-2 text-sm transition-all ${
        active ? '' : 'border-line-2 text-ink-2 hover:border-line-2 hover:text-navy'
      }`}
    >
      <div className="font-semibold">{label}</div>
      <div className={`text-xs mt-1 ${active ? 'opacity-80' : 'text-ink-3'}`}>{sub}</div>
    </button>
  );
}

function PeriodButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={active ? { backgroundColor: '#14355C', color: 'white', borderColor: '#14355C' } : {}}
      className={`flex-1 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
        active ? '' : 'border-line-2 text-ink-2 hover:border-line-2 hover:text-navy'
      }`}
    >
      {label}
    </button>
  );
}
