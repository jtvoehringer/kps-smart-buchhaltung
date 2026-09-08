'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { heute } from '@/lib/fehler';
import {
  berechneKilometergeld, berechneDiaeten, berechneEAutoVorsteuer,
  vorgeschlagenerSteuersatz, istPauschale, reiseSaetzeFuer,
} from '@/lib/steuer';
import { kennzeichenFuer, kennzeichenInfo, type UstKennzeichen } from '@/lib/steuer/uva-kennzahlen';
import {
  Receipt, Calculator, ArrowUpCircle, ArrowDownCircle, BatteryCharging,
  Check, X, Paperclip, FileText, Image as ImageIcon,
} from 'lucide-react';

type Category = { id: string; name: string; type: string; vat_rate: number; konto_nr?: string | null };

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_SIZE_MB = 10;
const BEWIRTUNG_KATEGORIE_NAME = 'Bewirtungsspesen (Geschäftsessen)';
const REISEKOSTEN_KATEGORIE_NAME = 'Reisekosten';

export default function BuchungForm({
  clientId,
  categories,
  bookingMode,
}: {
  clientId: string;
  categories: Category[];
  bookingMode: string;
}) {
  const router   = useRouter();
  const supabase = createClient();
  const isBrutto = bookingMode === 'brutto';
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const today = heute();

  const [type, setType]               = useState<'income' | 'expense'>('income');
  const [categoryId, setCategoryId]   = useState('');
  const [bookingDate, setBookingDate] = useState(today);
  const [amount, setAmount]           = useState('');
  const [vatRate, setVatRate]         = useState(20);
  const [description, setDescription] = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [isEAuto, setIsEAuto]         = useState(false);
  const [ustKennzeichen, setUstKennzeichen] = useState<UstKennzeichen>('normal');
  const [bewirtungAnlass, setBewirtungAnlass]         = useState('');
  const [bewirtungTeilnehmer, setBewirtungTeilnehmer] = useState('');
  const [reiseTyp, setReiseTyp] = useState<'' | 'kilometergeld' | 'fahrtkosten' | 'naechtigung' | 'diaeten' | 'konsumation'>('');
  const [reiseZiel, setReiseZiel]       = useState('');
  const [reiseZweck, setReiseZweck]     = useState('');
  const [reiseVon, setReiseVon]         = useState('');
  const [reiseBis, setReiseBis]         = useState('');
  const [reiseKm, setReiseKm]           = useState('');
  const [reiseStunden, setReiseStunden] = useState('');

  // Belegauswahl (optional)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileError, setFileError]         = useState('');

  const filteredCategories = categories.filter(c => c.type === type);
  const aktuellesKennzeichen = kennzeichenInfo(ustKennzeichen, type);
  // Beim Wechsel zwischen Einnahme und Ausgabe passen die Kennzeichen
  // nicht mehr – dann auf den Normalfall zurückfallen.
  useEffect(() => {
    if (!kennzeichenInfo(ustKennzeichen, type)) setUstKennzeichen('normal');
  }, [type, ustKennzeichen]);
  const isBewirtung = categories.find(c => c.id === categoryId)?.name === BEWIRTUNG_KATEGORIE_NAME;
  const isReisekosten = categories.find(c => c.id === categoryId)?.name === REISEKOSTEN_KATEGORIE_NAME;
  // Sätze richten sich nach dem Buchungsdatum – eine nachgetragene
  // Buchung aus dem Vorjahr rechnet mit den damals gültigen Werten.
  const saetze = reiseSaetzeFuer(bookingDate);
  const kmBetrag      = reiseTyp === 'kilometergeld' ? berechneKilometergeld(parseFloat(reiseKm), bookingDate) : 0;
  const diaetenBetrag = reiseTyp === 'diaeten'       ? berechneDiaeten(parseFloat(reiseStunden), bookingDate)  : 0;

  useEffect(() => {
    const cat = categories.find(c => c.id === categoryId);
    if (cat) setVatRate(cat.vat_rate);
  }, [categoryId, categories]);

  useEffect(() => {
    const first = categories.find(c => c.type === type);
    if (first) { setCategoryId(first.id); setVatRate(first.vat_rate); }
    if (type === 'income') setIsEAuto(false);
  }, [type, categories]);

  useEffect(() => { if (isEAuto) setVatRate(20); }, [isEAuto]);

  useEffect(() => {
    if (!isReisekosten || !reiseTyp) return;
    // Steuersatz je Reisekostenart vorbelegen. Vorher wurde der
    // 0-%-Satz der Kategorie übernommen – dadurch ging bei einer
    // Hotelrechnung die Vorsteuer verloren.
    setVatRate(vorgeschlagenerSteuersatz(reiseTyp));
    if (reiseTyp === 'kilometergeld') {
      setAmount(kmBetrag > 0 ? kmBetrag.toFixed(2) : '');
    } else if (reiseTyp === 'diaeten') {
      setAmount(diaetenBetrag > 0 ? diaetenBetrag.toFixed(2) : '');
    }
  }, [isReisekosten, reiseTyp, kmBetrag, diaetenBetrag]);

  const inputNum = parseFloat(amount) || 0;
  const netNum   = isBrutto ? inputNum / (1 + vatRate / 100) : inputNum;
  const grossNum = isBrutto ? inputNum : inputNum * (1 + vatRate / 100);
  const vatAmt   = grossNum - netNum;

  // Die Angemessenheitsgrenze ist ein BRUTTOwert inkl. USt und NoVA.
  const eAuto = berechneEAutoVorsteuer(grossNum, vatRate, bookingDate);
  const eAutoUeberschreitung = eAuto.stufe !== 'voll';
  const vatAmtSaved  = isEAuto ? eAuto.vstAbzugsfaehig  : vatAmt;
  // Die nicht abzugsfähige Vorsteuer gehört zu den Anschaffungskosten
  // (AfA-Basis) und darf nicht verschwinden.
  const netAmtSaved  = isEAuto ? eAuto.aktivierungsNetto : netNum;

  const displayNet   = netNum   > 0 ? netNum.toFixed(2)   : '—';
  const displayGross = grossNum > 0 ? grossNum.toFixed(2) : '—';
  const displayVat   = vatAmt   > 0 ? vatAmt.toFixed(2)   : '—';

  function eur(val: number) {
    return new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(val);
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    setFileError('');
    const toAdd: File[] = [];
    for (const file of Array.from(files)) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setFileError('Nur PDF, JPG, PNG und WebP erlaubt.');
        continue;
      }
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        setFileError(`"${file.name}" ist zu groß (max. ${MAX_SIZE_MB} MB).`);
        continue;
      }
      toAdd.push(file);
    }
    setSelectedFiles(prev => [...prev, ...toAdd]);
  }

  function removeFile(idx: number) {
    setSelectedFiles(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) {
      setError('Bitte einen gültigen Betrag eingeben.');
      return;
    }
    if (isBewirtung && (!bewirtungAnlass.trim() || !bewirtungTeilnehmer.trim())) {
      setError('Bei Bewirtungsspesen bitte Anlass und Teilnehmer angeben (Voraussetzung für die steuerliche Abzugsfähigkeit).');
      return;
    }
    if (isReisekosten) {
      if (!reiseTyp) { setError('Bitte die Art der Reisekosten auswählen.'); return; }
      if (!reiseZiel.trim() || !reiseZweck.trim() || !reiseVon || !reiseBis) {
        setError('Bei Reisekosten bitte Reiseziel, Zweck sowie Von/Bis-Datum angeben.');
        return;
      }
      if (reiseTyp === 'kilometergeld' && (!reiseKm || parseFloat(reiseKm) <= 0)) {
        setError('Bitte die gefahrenen Kilometer angeben.');
        return;
      }
      if (reiseTyp === 'diaeten' && (!reiseStunden || parseFloat(reiseStunden) <= saetze.taggeldMindestStunden)) {
        setError(`Für Diäten ist eine Reisedauer von mehr als ${saetze.taggeldMindestStunden} Stunden erforderlich.`);
        return;
      }
    }
    setLoading(true);
    setError('');

    // Die E-Auto-Kennzeichnung steht jetzt in transactions.is_eauto
    // und nicht mehr als Freitext in der Beschreibung – sonst geht
    // sie beim Bearbeiten verloren.
    const descFinal = description || null;

    // Buchung anlegen – mit ID zurückholen für Beleguploads
    const { data: newTx, error: insertError } = await supabase
      .from('transactions')
      .insert({
        client_id:    clientId,
        category_id:  categoryId,
        type,
        amount_net:   Math.round(netAmtSaved * 100) / 100,
        // amount_gross NICHT mitschicken: ist in der DB eine GENERATED ALWAYS-Spalte
        // (amount_net + vat_amount), Postgres berechnet sie automatisch.
        vat_rate:     vatRate as 0 | 10 | 13 | 20,
        vat_amount:   Math.round(vatAmtSaved * 100) / 100,
        booking_date: bookingDate,
        description:  descFinal,
        bewirtung_anlass:     isBewirtung ? bewirtungAnlass.trim() : null,
        bewirtung_teilnehmer: isBewirtung ? bewirtungTeilnehmer.trim() : null,
        reise_typ:     isReisekosten && reiseTyp ? reiseTyp : null,
        reise_ziel:    isReisekosten ? reiseZiel.trim() : null,
        reise_zweck:   isReisekosten ? reiseZweck.trim() : null,
        reise_von:     isReisekosten ? reiseVon : null,
        reise_bis:     isReisekosten ? reiseBis : null,
        reise_km:      isReisekosten && reiseTyp === 'kilometergeld' ? parseFloat(reiseKm) : null,
        reise_stunden: isReisekosten && reiseTyp === 'diaeten' ? parseFloat(reiseStunden) : null,
        is_eauto:      isEAuto,
        ust_kennzeichen: ustKennzeichen,
      })
      .select('id')
      .single();

    if (insertError || !newTx) {
      setError(`Fehler: ${insertError?.message ?? 'Unbekannter Fehler'}`);
      setLoading(false);
      return;
    }

    // Belege hochladen (optional – Fehler blockieren nicht die Navigation)
    if (selectedFiles.length > 0) {
      const { data: { user } } = await supabase.auth.getUser();
      for (const file of selectedFiles) {
        const ext         = file.name.split('.').pop() ?? 'bin';
        const storagePath = `${clientId}/${newTx.id}/${Date.now()}.${ext}`;

        const { error: storageErr } = await supabase.storage
          .from('belege')
          .upload(storagePath, file, { upsert: false });

        if (!storageErr) {
          await supabase.from('attachments').insert({
            transaction_id: newTx.id,
            client_id:      clientId,
            file_name:      file.name,
            storage_path:   storagePath,
            mime_type:      file.type,
            file_size:      file.size,
            uploaded_by:    user?.id,
          });
        }
      }
    }

    // Anschaffung in einer Kategorie der Kontenklasse 0 (Anlagevermögen)?
    // Dann direkt weiter ins Anlagenverzeichnis – die Anlage wird mit
    // dieser Buchung verknüpft und aus ihr vorbefüllt (Welle 7b).
    const kat = categories.find(c => c.id === categoryId);
    if (type === 'expense' && (kat?.konto_nr ?? '').startsWith('0')) {
      router.push(`/anlagen/neu?buchung=${newTx.id}`);
    } else {
      router.push('/buchungen');
    }
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card p-6 space-y-5">

      {/* Modus-Hinweis */}
      <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg font-medium ${isBrutto ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
        {isBrutto ? <Receipt size={16} strokeWidth={2} className="shrink-0" /> : <Calculator size={16} strokeWidth={2} className="shrink-0" />}
        <span>{isBrutto ? 'Brutto-Modus: Rechnungsbetrag eingeben' : 'Netto-Modus: Nettobetrag eingeben'}</span>
        <span className="font-normal opacity-70">· in Einstellungen änderbar</span>
      </div>

      {/* Typ */}
      <div>
        <span id="gruppe-buchungsart" className="block text-sm font-medium text-ink mb-2">Art der Buchung</span>
        <div role="group" aria-labelledby="gruppe-buchungsart" className="flex gap-3">
          {(['income', 'expense'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              aria-pressed={type === t}
              className={`flex items-center justify-center gap-1.5 flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 transition-colors ${
                type === t
                  ? t === 'income' ? 'bg-income text-white border-income' : 'bg-expense text-white border-expense'
                  : t === 'income' ? 'bg-white text-ink-2 border-line-2 hover:border-income' : 'bg-white text-ink-2 border-line-2 hover:border-expense'
              }`}
            >
              {t === 'income' ? <ArrowUpCircle size={16} strokeWidth={2} /> : <ArrowDownCircle size={16} strokeWidth={2} />}
              {t === 'income' ? 'Einnahme' : 'Ausgabe'}
            </button>
          ))}
        </div>
      </div>

      {/* Datum */}
      <div>
        <label htmlFor="buchungForm-0" className="block text-sm font-medium text-ink mb-1">Buchungsdatum</label>
        <input id="buchungForm-0" type="date" required value={bookingDate} onChange={e => setBookingDate(e.target.value)}
          className="w-full border border-line-2 rounded-lg px-4 py-2.5 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30" />
      </div>

      {/* Kategorie */}
      <div>
        <label htmlFor="buchungForm-1" className="block text-sm font-medium text-ink mb-1">Kategorie</label>
        <select id="buchungForm-1" required value={categoryId} onChange={e => setCategoryId(e.target.value)}
          className="w-full border border-line-2 rounded-lg px-4 py-2.5 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30">
          {filteredCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Betrag */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label htmlFor="buchungForm-2" className="block text-sm font-medium text-ink mb-1">{isBrutto ? 'Brutto (€)' : 'Netto (€)'}</label>
          <input id="buchungForm-2" type="number" required min="0.01" step="0.01" placeholder="0,00" value={amount}
            onChange={e => setAmount(e.target.value)}
            disabled={isReisekosten && (reiseTyp === 'kilometergeld' || reiseTyp === 'diaeten')}
            className="w-full border border-line-2 rounded-lg px-4 py-2.5 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30 disabled:bg-well disabled:cursor-not-allowed" />
        </div>
        <div>
          <label htmlFor="buchungForm-3" className="block text-sm font-medium text-ink mb-1">USt %</label>
          <select id="buchungForm-3" value={vatRate} onChange={e => setVatRate(Number(e.target.value))}
            disabled={isEAuto || (isReisekosten && (reiseTyp === 'kilometergeld' || reiseTyp === 'diaeten'))}
            className="w-full border border-line-2 rounded-lg px-4 py-2.5 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30 disabled:bg-well disabled:cursor-not-allowed">
            <option value={0}>0 %</option>
            <option value={10}>10 %</option>
            <option value={13}>13 %</option>
            <option value={20}>20 %</option>
          </select>
        </div>
        <div>
          <p className="block text-sm font-medium text-ink mb-1">{isBrutto ? 'Netto (€)' : 'Brutto (€)'}</p>
          <div className="w-full border border-line-2 bg-row rounded-lg px-4 py-2.5 text-sm text-ink font-medium">
            {isBrutto ? displayNet : displayGross}
          </div>
        </div>
      </div>

      {/* Umsatzsteuerliche Einordnung. Bestimmt zusammen mit dem
          Steuersatz die Kennzahl in der UVA. Ohne dieses Feld landete
          jeder 0-%-Umsatz pauschal unter Kz 011 (Ausfuhrlieferung). */}
      <div>
        <label htmlFor="ust-kz" className="block text-sm font-medium text-ink mb-1">
          Umsatzsteuerliche Einordnung
        </label>
        <select
          id="ust-kz"
          value={ustKennzeichen}
          onChange={e => setUstKennzeichen(e.target.value as UstKennzeichen)}
          className="w-full border border-line-2 rounded-lg px-4 py-2.5 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30"
        >
          {kennzeichenFuer(type).map(k => (
            <option key={k.wert} value={k.wert}>{k.label}</option>
          ))}
        </select>
        {aktuellesKennzeichen && ustKennzeichen !== 'normal' && (
          <p className="text-xs text-ink-2 mt-1 leading-relaxed">{aktuellesKennzeichen.hilfe}</p>
        )}
      </div>

      {vatAmt > 0 && !isEAuto && (
        <p className="text-sm text-ink-2">
          USt-Betrag: <span className="font-medium">€ {displayVat}</span>
          {isBrutto && <span className="ml-3">Netto: <span className="font-medium">€ {displayNet}</span></span>}
        </p>
      )}


      {/* Bewirtungsspesen: Pflichtangaben für steuerliche Abzugsfähigkeit */}
      {isBewirtung && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
          <p className="text-xs text-amber-800 leading-relaxed">
            Bewirtungsspesen sind einkommensteuerlich idR nur zu <strong>50 % abzugsfähig</strong>
            (§ 20 EStG), die Vorsteuer bleibt idR zur Gänze abzugsfähig. Voraussetzung ist die
            Dokumentation von Anlass und Teilnehmern – beides ist daher hier verpflichtend.
          </p>
          <div>
            <label htmlFor="buchungForm-4" className="block text-xs font-medium text-amber-900 mb-1">Anlass der Bewirtung *</label>
            <input id="buchungForm-4" type="text" required={isBewirtung} placeholder="z.B. Projektbesprechung mit Kunde XY"
              value={bewirtungAnlass} onChange={e => setBewirtungAnlass(e.target.value)}
              className="w-full border border-amber-300 rounded-lg px-4 py-2.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-400 bg-white" />
          </div>
          <div>
            <label htmlFor="buchungForm-5" className="block text-xs font-medium text-amber-900 mb-1">Teilnehmer *</label>
            <input id="buchungForm-5" type="text" required={isBewirtung} placeholder="z.B. Max Mustermann (Kunde XY GmbH), Jörgen Voehringer"
              value={bewirtungTeilnehmer} onChange={e => setBewirtungTeilnehmer(e.target.value)}
              className="w-full border border-amber-300 rounded-lg px-4 py-2.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-400 bg-white" />
          </div>
        </div>
      )}

      {/* Reisekosten: Typ, Pflichtangaben, Rechner für Kilometergeld/Diäten */}
      {isReisekosten && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
          <p className="text-xs text-amber-800 leading-relaxed">
            Reisekosten werden steuerlich unterschiedlich behandelt: Kilometergeld und Diäten sind
            pauschale, vorsteuerfreie Aufwandsentschädigungen (§ 4 Abs. 5 / § 26 Z 4 EStG), Fahrtkosten,
            Nächtigung und Konsumation werden mit dem tatsächlichen Belegbetrag gebucht. Ziel, Zweck und
            Zeitraum der Reise sind für den Nachweis verpflichtend.
          </p>
          <div>
            <label htmlFor="buchungForm-6" className="block text-xs font-medium text-amber-900 mb-1">Art der Reisekosten *</label>
            <select id="buchungForm-6" required value={reiseTyp} onChange={e => setReiseTyp(e.target.value as typeof reiseTyp)}
              className="w-full border border-amber-300 rounded-lg px-4 py-2.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-400 bg-white">
              <option value="">Bitte wählen…</option>
              <option value="kilometergeld">Kilometergeld</option>
              <option value="fahrtkosten">Fahrtkosten (Bahn/Flug/Taxi)</option>
              <option value="naechtigung">Nächtigung/Hotel</option>
              <option value="diaeten">Diäten (Verpflegungsmehraufwand)</option>
              <option value="konsumation">Konsumation auf Reisen</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="buchungForm-7" className="block text-xs font-medium text-amber-900 mb-1">Reiseziel *</label>
              <input id="buchungForm-7" type="text" required placeholder="z.B. Wien" value={reiseZiel}
                onChange={e => setReiseZiel(e.target.value)}
                className="w-full border border-amber-300 rounded-lg px-4 py-2.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-400 bg-white" />
            </div>
            <div>
              <label htmlFor="buchungForm-8" className="block text-xs font-medium text-amber-900 mb-1">Zweck der Reise *</label>
              <input id="buchungForm-8" type="text" required placeholder="z.B. Kundentermin XY GmbH" value={reiseZweck}
                onChange={e => setReiseZweck(e.target.value)}
                className="w-full border border-amber-300 rounded-lg px-4 py-2.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-400 bg-white" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="buchungForm-9" className="block text-xs font-medium text-amber-900 mb-1">Von *</label>
              <input id="buchungForm-9" type="date" required value={reiseVon} onChange={e => setReiseVon(e.target.value)}
                className="w-full border border-amber-300 rounded-lg px-4 py-2.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-400 bg-white" />
            </div>
            <div>
              <label htmlFor="buchungForm-10" className="block text-xs font-medium text-amber-900 mb-1">Bis *</label>
              <input id="buchungForm-10" type="date" required value={reiseBis} onChange={e => setReiseBis(e.target.value)}
                className="w-full border border-amber-300 rounded-lg px-4 py-2.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-400 bg-white" />
            </div>
          </div>

          {reiseTyp === 'kilometergeld' && (
            <div className="bg-white rounded-lg border border-amber-300 p-3 space-y-2">
              <label htmlFor="buchungForm-11" className="block text-xs font-medium text-amber-900 mb-1">Gefahrene Kilometer *</label>
              <input id="buchungForm-11" type="number" required min="0.1" step="0.1" placeholder="z.B. 120" value={reiseKm}
                onChange={e => setReiseKm(e.target.value)}
                className="w-full border border-line-2 rounded-lg px-4 py-2.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-400" />
              <p className="text-xs text-ink-2">
                Amtliches Kilometergeld PKW: {eur(saetze.kmSatz)}/km · Betrag: <strong>{eur(kmBetrag)}</strong> · keine Vorsteuer (Pauschale)
              </p>
            </div>
          )}

          {reiseTyp === 'diaeten' && (
            <div className="bg-white rounded-lg border border-amber-300 p-3 space-y-2">
              <label htmlFor="buchungForm-12" className="block text-xs font-medium text-amber-900 mb-1">Reisedauer in Stunden *</label>
              <input id="buchungForm-12" type="number" required min="0.5" step="0.5" placeholder="z.B. 9,5 – bei Mehrtagesreisen 58" value={reiseStunden}
                onChange={e => setReiseStunden(e.target.value)}
                className="w-full border border-line-2 rounded-lg px-4 py-2.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-400" />
              <p className="text-xs text-ink-2">
                Bis {saetze.taggeldMindestStunden} Std. kein Taggeld · darüber {eur(saetze.taggeld / 12)} je angefangener Stunde ·
                voller Satz {eur(saetze.taggeld)} ab der 12. angefangenen Stunde ·
                Betrag: <strong>{eur(diaetenBetrag)}</strong> · keine Vorsteuer (Pauschale)
              </p>
              <p className="text-xs text-ink-3">
                Mehrtagesreisen: Gesamtstunden eintragen. Je vollem 24-Stunden-Zeitraum wird
                der volle Satz gerechnet, der Rest wieder nach Zwölfteln.
              </p>
            </div>
          )}

          {reiseTyp === 'naechtigung' && (
            <p className="text-xs text-amber-700 bg-white rounded-lg border border-amber-300 p-3">
              Nächtigungspauschale ohne Beleg: {eur(saetze.naechtigung)}/Nacht (inkl. Frühstück) – dann bitte
              den Steuersatz auf 0 % stellen. Liegt eine Hotelrechnung vor, den tatsächlichen
              Rechnungsbetrag inkl. ausgewiesener USt eintragen (Beherbergung 10 %).
            </p>
          )}

          {reiseTyp === 'konsumation' && (
            <p className="text-xs text-amber-700 bg-white rounded-lg border border-amber-300 p-3">
              Hinweis: Verpflegungskosten auf Dienstreisen sind idR bereits durch die Diäten-Pauschale
              abgegolten – zusätzliche Konsumationsbelege sind meist nicht separat abzugsfähig. Bitte im
              Zweifel mit der Kanzlei abstimmen.
            </p>
          )}
        </div>
      )}

      {/* E-Auto Toggle */}
      {type === 'expense' && (
        <button type="button" onClick={() => setIsEAuto(v => !v)}
          className={`flex items-center gap-2.5 text-sm font-medium px-4 py-2.5 rounded-xl border-2 transition-all w-full ${
            isEAuto ? 'bg-blue-50 border-blue-400 text-blue-800' : 'bg-white border-line-2 text-ink-2 hover:border-blue-300 hover:text-blue-700'
          }`}>
          <BatteryCharging size={18} strokeWidth={1.75} className="shrink-0" />
          <span className="flex-1 text-left">Elektroauto-Anschaffung (Vorsteuer-Sonderregelung)</span>
          <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isEAuto ? 'bg-blue-500 border-blue-500 text-white' : 'border-line-2'}`}>
            {isEAuto && <Check size={12} strokeWidth={3} />}
          </span>
        </button>
      )}

      {/* E-Auto Berechnung */}
      {isEAuto && netNum > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-blue-800 text-sm">Vorsteuerberechnung E-Auto</span>
            <span className="text-blue-400 text-xs">§ 12 Abs. 2 Z 2 lit. b UStG</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-white rounded-lg px-3 py-2">
              <p className="text-xs text-ink-2">Kaufpreis brutto</p>
              <p className="font-bold text-ink">{eur(eAuto.bruttoAnschaffung)}</p>
            </div>
            <div className={`rounded-lg px-3 py-2 ${eAutoUeberschreitung ? 'bg-amber-100' : 'bg-white'}`}>
              <p className="text-xs text-ink-2">Angemessenheitsgrenze (brutto)</p>
              <p className="font-bold text-ink">{eur(eAuto.angemessenheitsgrenzeBrutto)}</p>
            </div>
            <div className="bg-white rounded-lg px-3 py-2">
              <p className="text-xs text-ink-2">USt gesamt</p>
              <p className="font-semibold text-ink">{eur(eAuto.vstGesamt)}</p>
            </div>
            <div className="bg-white rounded-lg px-3 py-2">
              <p className="text-xs text-ink-2">Zu aktivieren (AfA-Basis)</p>
              <p className="font-semibold text-ink">{eur(eAuto.aktivierungsNetto)}</p>
            </div>
          </div>
          <div className="border-t border-blue-200 pt-3 space-y-1.5">
            <div className="flex justify-between items-center text-sm">
              <span className="inline-flex items-center gap-1.5 text-green-700 font-medium">
                <Check size={14} strokeWidth={2.5} />
                Abzugsfähige Vorsteuer
              </span>
              <span className="font-bold text-green-700">{eur(eAuto.vstAbzugsfaehig)}</span>
            </div>
            {eAutoUeberschreitung && (
              <div className="flex justify-between items-center text-sm">
                <span className="inline-flex items-center gap-1.5 text-amber-700">
                  <X size={14} strokeWidth={2.5} />
                  Nicht abzugsfähige VSt (Luxuslimit)
                </span>
                <span className="font-semibold text-amber-700">{eur(eAuto.vstNichtAbzugsfaehig)}</span>
              </div>
            )}
          </div>
          {eAuto.stufe === 'kein_abzug' ? (
            <p className="text-xs text-amber-800 bg-amber-100 rounded-lg px-3 py-2 leading-relaxed">
              Über {eur(eAuto.ausschlussgrenzeBrutto)} brutto steht <strong>kein Vorsteuerabzug</strong> zu.
              Der gesamte Bruttobetrag wird als Anschaffungskosten aktiviert.
            </p>
          ) : eAuto.stufe === 'aliquot' ? (
            <p className="text-xs text-blue-700 bg-blue-100 rounded-lg px-3 py-2 leading-relaxed">
              Der Kaufpreis überschreitet die Angemessenheitsgrenze von {eur(eAuto.angemessenheitsgrenzeBrutto)} brutto.
              Abzugsfähig ist die Vorsteuer nur anteilig: <strong>{eur(eAuto.vstAbzugsfaehig)}</strong>.
              Die restlichen {eur(eAuto.vstNichtAbzugsfaehig)} erhöhen die Anschaffungskosten.
            </p>
          ) : (
            <p className="text-xs text-blue-700">
              Kaufpreis innerhalb der Angemessenheitsgrenze – volle Vorsteuer von <strong>{eur(eAuto.vstAbzugsfaehig)}</strong> abzugsfähig.
            </p>
          )}
        </div>
      )}

      {/* Beschreibung */}
      <div>
        <label htmlFor="buchungForm-13" className="block text-sm font-medium text-ink mb-1">
          Beschreibung <span className="text-ink-3 font-normal">(optional)</span>
        </label>
        <input id="buchungForm-13" type="text" placeholder="z.B. Büromaterial Dezember, Rechnung Nr. 2024-001 …"
          value={description} onChange={e => setDescription(e.target.value)}
          className="w-full border border-line-2 rounded-lg px-4 py-2.5 text-sm focus:outline-hidden focus:border-signal focus:ring-2 focus:ring-signal/30" />
      </div>

      {/* Belege (optional) */}
      <div className="border border-line-2 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
            <Paperclip size={15} strokeWidth={2} className="text-ink-3" />
            Beleg anhängen
            <span className="ml-1 text-xs text-ink-3 font-normal">(optional · PDF, JPG, PNG · max. {MAX_SIZE_MB} MB)</span>
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => cameraInputRef.current?.click()}
              className="inline-flex items-center gap-1 text-xs text-white font-medium bg-navy hover:bg-navy-2 px-3 py-1 rounded-lg transition-colors">
              Foto aufnehmen
            </button>
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1 text-xs text-navy hover:text-navy font-medium border border-navy hover:border-accent px-3 py-1 rounded-lg transition-colors">
              <Paperclip size={12} strokeWidth={2} />
              Datei wählen
            </button>
          </div>
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment"
            onChange={e => addFiles(e.target.files)} className="hidden" />
          <input ref={fileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={e => addFiles(e.target.files)} className="hidden" />
        </div>

        {selectedFiles.length > 0 && (
          <ul className="space-y-1.5">
            {selectedFiles.map((f, idx) => (
              <li key={idx} className="flex items-center gap-2 bg-row rounded-lg px-3 py-2 text-sm">
                {f.name.toLowerCase().endsWith('.pdf')
                  ? <FileText size={16} strokeWidth={1.75} className="text-ink-3 shrink-0" />
                  : <ImageIcon size={16} strokeWidth={1.75} className="text-ink-3 shrink-0" />}
                <span className="flex-1 truncate text-ink">{f.name}</span>
                <span className="text-xs text-ink-3 shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                <button type="button" onClick={() => removeFile(idx)}
                  className="text-ink-3 hover:text-red-500 transition-colors shrink-0">
                  <X size={14} strokeWidth={2} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {fileError && <p className="text-red-600 text-xs">{fileError}</p>}
      </div>

      {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      {/* Buttons */}
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={() => router.back()}
          className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-line-2 text-ink-2 hover:bg-row transition-colors">
          Abbrechen
        </button>
        <button type="submit" disabled={loading}
          className={`flex items-center justify-center gap-1.5 flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50 ${
            type === 'income' ? 'bg-income hover:bg-income-dark' : 'bg-expense hover:bg-expense-dark'
          }`}>
          {loading ? (
            selectedFiles.length > 0 ? 'Speichern & Hochladen…' : 'Speichern…'
          ) : (
            <>
              {type === 'income' ? <ArrowUpCircle size={16} strokeWidth={2} /> : <ArrowDownCircle size={16} strokeWidth={2} />}
              {type === 'income' ? 'Einnahme speichern' : 'Ausgabe speichern'}
            </>
          )}
        </button>
      </div>
    </form>
  );
}
