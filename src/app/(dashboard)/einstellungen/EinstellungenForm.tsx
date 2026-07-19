'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type ClientData = {
  id: string;
  company_name: string;
  uid_number: string | null;
  vat_period: string;
  booking_mode: string;
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
  payment_days: number;
  invoice_footer: string | null;
} | null;

export default function EinstellungenForm({
  client,
  branding,
}: {
  client: ClientData;
  branding: BrandingData;
}) {
  const supabase = createClient();
  const router = useRouter();

  // ── Buchhaltungs-Einstellungen ────────────────────────────
  const [bookingMode, setBookingMode] = useState(client.booking_mode ?? 'netto');
  const [vatPeriod,   setVatPeriod]   = useState(client.vat_period ?? 'quarterly');
  const [uidNumber,   setUidNumber]   = useState(client.uid_number ?? '');

  // ── Branding ──────────────────────────────────────────────
  const [brandColor,      setBrandColor]      = useState(branding?.brand_color      ?? '#1B3A6B');
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
  const [paymentDays,     setPaymentDays]     = useState(branding?.payment_days     ?? 14);
  const [invoiceFooter,   setInvoiceFooter]   = useState(branding?.invoice_footer   ?? '');
  const [logoUrl,         setLogoUrl]         = useState(branding?.logo_url         ?? '');
  const [logoUploading,   setLogoUploading]   = useState(false);

  const [loading, setLoading] = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Rechnungsnummer-Vorschau
  const nrPreview = `${invoicePrefix}${String(invoiceNextNr).padStart(invoiceNrDigits, '0')}`;

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
        vat_period:   vatPeriod,
        uid_number:   uidNumber || null,
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
      payment_days:      paymentDays,
      invoice_footer:    invoiceFooter   || null,
      ...(logoUrl ? { logo_url: logoUrl } : {}),
    };

    const { error: brandingError } = await supabase
      .from('client_branding')
      .upsert(brandingPayload, { onConflict: 'client_id' });

    if (brandingError) {
      // Migration 009 noch nicht ausgeführt → Buchhaltungseinstellungen wurden trotzdem gespeichert
      if (brandingError.message.includes('schema cache') || brandingError.message.includes('does not exist')) {
        setSaved(true);
        setError('⚠️ Rechnungsdesign konnte nicht gespeichert werden – Migration 009 in Supabase noch nicht ausgeführt. Buchhaltungseinstellungen wurden gespeichert.');
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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* ── BUCHHALTUNGSEINSTELLUNGEN ─────────────────────── */}
      <SectionHeader title="Buchhaltung" />

      {/* Buchungsmodus */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-1">Buchungsmodus</h2>
        <p className="text-sm text-gray-500 mb-4">
          Legt fest ob beim Erfassen einer Buchung der Netto- oder Bruttobetrag eingegeben wird.
        </p>
        <div className="flex gap-3">
          <ModeButton
            active={bookingMode === 'netto'}
            onClick={() => setBookingMode('netto')}
            icon="📥"
            label="Netto-Eingabe"
            sub="Nettobetrag eingeben → Brutto wird berechnet"
          />
          <ModeButton
            active={bookingMode === 'brutto'}
            onClick={() => setBookingMode('brutto')}
            icon="🧾"
            label="Brutto-Eingabe"
            sub="Rechnungsbetrag eingeben → Netto wird berechnet"
          />
        </div>
      </div>

      {/* USt-Voranmeldung */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-1">USt-Voranmeldungszeitraum</h2>
        <p className="text-sm text-gray-500 mb-4">Wie oft wird die UVA eingereicht?</p>
        <div className="flex gap-3">
          <PeriodButton active={vatPeriod === 'monthly'}   onClick={() => setVatPeriod('monthly')}   label="Monatlich" />
          <PeriodButton active={vatPeriod === 'quarterly'} onClick={() => setVatPeriod('quarterly')} label="Vierteljährlich" />
        </div>
      </div>

      {/* UID-Nummer */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-1">UID-Nummer</h2>
        <p className="text-sm text-gray-500 mb-3">Österreichische Umsatzsteuer-Identifikationsnummer</p>
        <input
          type="text"
          placeholder="ATU12345678"
          value={uidNumber}
          onChange={e => setUidNumber(e.target.value)}
          className={inputCls}
        />
      </div>

      {/* Belegverwaltung */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-1">Belegverwaltung</h2>
        <p className="text-sm text-gray-500">
          Das Anhängen von Belegen (PDF, JPG, PNG) ist bei jeder Buchung verfügbar.
        </p>
        <p className="text-xs text-blue-600 mt-2 bg-blue-50 px-3 py-1.5 rounded-lg inline-block">
          📎 Belegverwaltung immer aktiv
        </p>
      </div>

      {/* ── RECHNUNGSDESIGN ───────────────────────────────── */}
      <SectionHeader
        title="Rechnungsdesign"
        subtitle="Wird auf Ausgangsrechnungen verwendet – unabhängig vom App-Design"
      />

      {/* Logo */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-1">Firmenlogo</h2>
        <p className="text-sm text-gray-500 mb-4">PNG, JPG oder SVG, max. 2 MB – erscheint oben auf der Rechnung</p>
        <div className="flex items-center gap-4">
          {logoUrl ? (
            <div className="w-24 h-16 border border-gray-200 rounded-lg overflow-hidden bg-gray-50 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain p-1" />
            </div>
          ) : (
            <div className="w-24 h-16 border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center text-gray-300 text-xs text-center leading-tight px-1">
              Kein Logo
            </div>
          )}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={logoUploading}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
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
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-1">Primärfarbe</h2>
        <p className="text-sm text-gray-500 mb-4">Wird für Rechnungskopf und Akzente verwendet</p>
        <div className="flex items-center gap-4">
          <input
            type="color"
            value={brandColor}
            onChange={e => setBrandColor(e.target.value)}
            className="w-12 h-10 rounded cursor-pointer border border-gray-200"
          />
          <input
            type="text"
            value={brandColor}
            onChange={e => setBrandColor(e.target.value)}
            placeholder="#1B3A6B"
            className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]"
          />
          <div
            className="flex-1 h-10 rounded-lg border border-gray-100"
            style={{ backgroundColor: brandColor }}
          />
        </div>
      </div>

      {/* Firmenadresse */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-1">Firmenadresse</h2>
        <p className="text-sm text-gray-500 mb-4">Erscheint im Rechnungskopf</p>
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
              className="w-28 border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]"
            />
            <input
              type="text" placeholder="Ort"
              value={companyCity} onChange={e => setCompanyCity(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]"
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
              className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]"
            />
            <input
              type="email" placeholder="E-Mail"
              value={companyEmail} onChange={e => setCompanyEmail(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]"
            />
          </div>
          <input
            type="url" placeholder="Website (https://…)"
            value={companyWebsite} onChange={e => setCompanyWebsite(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>

      {/* Bankverbindung */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-1">Bankverbindung</h2>
        <p className="text-sm text-gray-500 mb-4">Wird im Zahlungshinweis auf der Rechnung angezeigt</p>
        <div className="space-y-3">
          <input
            type="text" placeholder="IBAN (AT…)"
            value={iban} onChange={e => setIban(e.target.value)}
            className={inputCls}
          />
          <div className="flex gap-3">
            <input
              type="text" placeholder="BIC"
              value={bic} onChange={e => setBic(e.target.value)}
              className="w-40 border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]"
            />
            <input
              type="text" placeholder="Bankname"
              value={bankName} onChange={e => setBankName(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]"
            />
          </div>
        </div>
      </div>

      {/* Rechnungsnummer */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-3">Rechnungsnummer</h2>
        <div className="space-y-3">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-xs text-gray-500 font-medium block mb-1">Prefix</label>
              <input
                type="text" placeholder="RE-"
                value={invoicePrefix} onChange={e => setInvoicePrefix(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="w-28">
              <label className="text-xs text-gray-500 font-medium block mb-1">Nächste Nr.</label>
              <input
                type="number" min={1}
                value={invoiceNextNr} onChange={e => setInvoiceNextNr(Number(e.target.value))}
                className={inputCls}
              />
            </div>
            <div className="w-36">
              <label className="text-xs text-gray-500 font-medium block mb-1">Stellen</label>
              <select
                value={invoiceNrDigits}
                onChange={e => setInvoiceNrDigits(Number(e.target.value))}
                className={inputCls}
              >
                {[1,2,3,4,5,6].map(n => (
                  <option key={n} value={n}>{n} Stellen ({String(1).padStart(n,'0')})</option>
                ))}
              </select>
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg px-4 py-3 flex items-center gap-3">
            <span className="text-xs text-gray-400">Vorschau nächste Rechnung:</span>
            <span className="font-mono font-semibold text-[#1B3A6B]">{nrPreview}</span>
          </div>
        </div>
        <div className="mt-4">
          <label className="text-xs text-gray-500 font-medium block mb-1">Standard-Zahlungsziel (Tage)</label>
          <div className="flex items-center gap-3">
            <input
              type="number" min={0} max={365}
              value={paymentDays} onChange={e => setPaymentDays(Number(e.target.value))}
              className="w-28 border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]"
            />
            <span className="text-sm text-gray-500">Tage ab Rechnungsdatum</span>
          </div>
        </div>
      </div>

      {/* Fußzeile */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-1">Rechnungsfußzeile</h2>
        <p className="text-sm text-gray-500 mb-3">Freitext – z.B. Steuerberater-Hinweis, Gewerbeschein-Nr., Gerichtsstand</p>
        <textarea
          rows={3}
          placeholder="z.B. Gerichtsstand Wien · Steuerberater: KPS Steuerberatung GmbH"
          value={invoiceFooter}
          onChange={e => setInvoiceFooter(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B] resize-none"
        />
      </div>

      {/* Meldungen */}
      {error && (
        <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>
      )}
      {saved && (
        <p className="text-green-700 text-sm bg-green-50 px-3 py-2 rounded-lg">✅ Einstellungen gespeichert!</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-[#1B3A6B] hover:bg-[#1565C0] text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
      >
        {loading ? 'Speichern…' : 'Alle Einstellungen speichern'}
      </button>
    </form>
  );
}

// ── Hilfsstyles & Subkomponenten ──────────────────────────────

const inputCls = 'w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]';

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="pt-2 pb-1">
      <h2 className="text-base font-bold text-[#1B3A6B] uppercase tracking-wide">{title}</h2>
      {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function ModeButton({ active, onClick, icon, label, sub }: {
  active: boolean; onClick: () => void; icon: string; label: string; sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={active ? { backgroundColor: '#1B3A6B', color: 'white', borderColor: '#1B3A6B' } : {}}
      className={`flex-1 py-4 rounded-xl border-2 text-sm transition-all ${
        active ? '' : 'border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700'
      }`}
    >
      <div className="text-2xl mb-1">{icon}</div>
      <div className="font-semibold">{label}</div>
      <div className={`text-xs mt-1 ${active ? 'opacity-80' : 'text-gray-400'}`}>{sub}</div>
    </button>
  );
}

function PeriodButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={active ? { backgroundColor: '#1B3A6B', color: 'white', borderColor: '#1B3A6B' } : {}}
      className={`flex-1 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
        active ? '' : 'border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700'
      }`}
    >
      {label}
    </button>
  );
}
