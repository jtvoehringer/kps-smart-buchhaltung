'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Receipt, Calculator, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import BelegUpload from './BelegUpload';

type Category = { id: string; name: string; type: string; vat_rate: number };
type Transaction = {
  id: string; type: string; amount_net: number; vat_rate: number;
  vat_amount: number; booking_date: string; description: string | null; category_id: string;
  bewirtung_anlass?: string | null;
  bewirtung_teilnehmer?: string | null;
  reise_typ?: string | null;
  reise_ziel?: string | null;
  reise_zweck?: string | null;
  reise_von?: string | null;
  reise_bis?: string | null;
  reise_km?: number | null;
  reise_stunden?: number | null;
};
type Attachment = { id: string; file_name: string; storage_path: string; uploaded_at: string };
const BEWIRTUNG_KATEGORIE_NAME = 'Bewirtungsspesen (Geschäftsessen)';
const REISEKOSTEN_KATEGORIE_NAME = 'Reisekosten';
const KM_SATZ = 0.50;              // amtliches Kilometergeld PKW (Stand 2025/2026)
const DIAETEN_TAGSSATZ = 30;       // Taggeld voll (ab 11 Std.)
const DIAETEN_STUNDENSATZ = 2.5;   // 1/12 des Taggelds je angefangener Stunde (3–11 Std.)
const DIAETEN_MIN_STUNDEN = 3;     // unter 3 Std. kein Taggeld
const DIAETEN_VOLL_STUNDEN = 11;   // ab 11 Std. voller Tagessatz

function eur(val: number) {
  return new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(val);
}

export default function BuchungBearbeitenForm({
  transaction, clientId, bookingMode, categories, attachmentsEnabled, attachments,
}: {
  transaction: Transaction;
  clientId: string;
  bookingMode: string;
  categories: Category[];
  attachmentsEnabled: boolean;
  attachments: Attachment[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const isBrutto = bookingMode === 'brutto';

  const initAmount = isBrutto
    ? (transaction.amount_net + transaction.vat_amount).toFixed(2)
    : transaction.amount_net.toFixed(2);

  const [type, setType]               = useState<'income' | 'expense'>(transaction.type as 'income' | 'expense');
  const [categoryId, setCategoryId]   = useState(transaction.category_id);
  const [bookingDate, setBookingDate] = useState(transaction.booking_date);
  const [amount, setAmount]           = useState(initAmount);
  const [vatRate, setVatRate]         = useState(transaction.vat_rate);
  const [description, setDescription] = useState(transaction.description ?? '');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [bewirtungAnlass, setBewirtungAnlass]         = useState(transaction.bewirtung_anlass ?? '');
  const [bewirtungTeilnehmer, setBewirtungTeilnehmer] = useState(transaction.bewirtung_teilnehmer ?? '');
  const [reiseTyp, setReiseTyp] = useState<'' | 'kilometergeld' | 'fahrtkosten' | 'naechtigung' | 'diaeten' | 'konsumation'>(
    (transaction.reise_typ as 'kilometergeld' | 'fahrtkosten' | 'naechtigung' | 'diaeten' | 'konsumation' | null) ?? ''
  );
  const [reiseZiel, setReiseZiel]       = useState(transaction.reise_ziel ?? '');
  const [reiseZweck, setReiseZweck]     = useState(transaction.reise_zweck ?? '');
  const [reiseVon, setReiseVon]         = useState(transaction.reise_von ?? '');
  const [reiseBis, setReiseBis]         = useState(transaction.reise_bis ?? '');
  const [reiseKm, setReiseKm]           = useState(transaction.reise_km != null ? String(transaction.reise_km) : '');
  const [reiseStunden, setReiseStunden] = useState(transaction.reise_stunden != null ? String(transaction.reise_stunden) : '');

  const filteredCategories = categories.filter(c => c.type === type);
  const isBewirtung = categories.find(c => c.id === categoryId)?.name === BEWIRTUNG_KATEGORIE_NAME;
  const isReisekosten = categories.find(c => c.id === categoryId)?.name === REISEKOSTEN_KATEGORIE_NAME;
  const kmBetrag = reiseTyp === 'kilometergeld' ? Math.round((parseFloat(reiseKm) || 0) * KM_SATZ * 100) / 100 : 0;
  const diaetenBetrag = (() => {
    if (reiseTyp !== 'diaeten') return 0;
    const std = parseFloat(reiseStunden) || 0;
    if (std < DIAETEN_MIN_STUNDEN) return 0;
    if (std >= DIAETEN_VOLL_STUNDEN) return DIAETEN_TAGSSATZ;
    return Math.round(Math.ceil(std) * DIAETEN_STUNDENSATZ * 100) / 100;
  })();

  useEffect(() => {
    const cat = categories.find(c => c.id === categoryId);
    if (cat) setVatRate(cat.vat_rate);
  }, [categoryId, categories]);

  useEffect(() => {
    if (!isReisekosten) return;
    if (reiseTyp === 'kilometergeld') {
      setVatRate(0);
      setAmount(kmBetrag > 0 ? kmBetrag.toFixed(2) : '');
    } else if (reiseTyp === 'diaeten') {
      setVatRate(0);
      setAmount(diaetenBetrag > 0 ? diaetenBetrag.toFixed(2) : '');
    }
  }, [isReisekosten, reiseTyp, kmBetrag, diaetenBetrag]);

  const inputNum = parseFloat(amount) || 0;
  const netNum   = isBrutto ? inputNum / (1 + vatRate / 100) : inputNum;
  const grossNum = isBrutto ? inputNum : inputNum * (1 + vatRate / 100);
  const vatAmt   = grossNum - netNum;

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
      if (reiseTyp === 'diaeten' && (!reiseStunden || parseFloat(reiseStunden) < DIAETEN_MIN_STUNDEN)) {
        setError('Für Diäten sind mindestens 3 Stunden Reisedauer erforderlich.');
        return;
      }
    }
    setLoading(true);
    setError('');

    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        type,
        category_id:  categoryId,
        amount_net:   Math.round(netNum  * 100) / 100,
        vat_rate:     vatRate as 0 | 10 | 13 | 20,
        vat_amount:   Math.round(vatAmt  * 100) / 100,
        booking_date: bookingDate,
        description:  description || null,
        bewirtung_anlass:     isBewirtung ? bewirtungAnlass.trim() : null,
        bewirtung_teilnehmer: isBewirtung ? bewirtungTeilnehmer.trim() : null,
        reise_typ:     isReisekosten && reiseTyp ? reiseTyp : null,
        reise_ziel:    isReisekosten ? reiseZiel.trim() : null,
        reise_zweck:   isReisekosten ? reiseZweck.trim() : null,
        reise_von:     isReisekosten ? reiseVon : null,
        reise_bis:     isReisekosten ? reiseBis : null,
        reise_km:      isReisekosten && reiseTyp === 'kilometergeld' ? parseFloat(reiseKm) : null,
        reise_stunden: isReisekosten && reiseTyp === 'diaeten' ? parseFloat(reiseStunden) : null,
      })
      .eq('id', transaction.id);

    if (updateError) {
      setError(`Fehler: ${updateError.message}`);
      setLoading(false);
    } else {
      router.push('/buchungen');
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">

      <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg font-medium ${isBrutto ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
        {isBrutto ? <Receipt size={16} strokeWidth={2} className="shrink-0" /> : <Calculator size={16} strokeWidth={2} className="shrink-0" />}
        <span>{isBrutto ? 'Brutto-Modus' : 'Netto-Modus'}</span>
        <span className="font-normal opacity-70">· in Einstellungen änderbar</span>
      </div>

      {/* Typ */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Art der Buchung</label>
        <div className="flex gap-3">
          {(['income', 'expense'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`flex items-center justify-center gap-1.5 flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 transition-colors ${
                type === t
                  ? t === 'income' ? 'bg-income text-white border-income' : 'bg-expense text-white border-expense'
                  : t === 'income' ? 'bg-white text-gray-600 border-gray-200 hover:border-income' : 'bg-white text-gray-600 border-gray-200 hover:border-expense'
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
        <label className="block text-sm font-medium text-gray-700 mb-1">Buchungsdatum</label>
        <input type="date" required value={bookingDate} onChange={e => setBookingDate(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E]" />
      </div>

      {/* Kategorie */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Kategorie</label>
        <select required value={categoryId} onChange={e => setCategoryId(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E]">
          {filteredCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Betrag */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{isBrutto ? 'Brutto (€)' : 'Netto (€)'}</label>
          <input type="number" required min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
            disabled={isReisekosten && (reiseTyp === 'kilometergeld' || reiseTyp === 'diaeten')}
            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E] disabled:bg-gray-100 disabled:cursor-not-allowed" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">USt %</label>
          <select value={vatRate} onChange={e => setVatRate(Number(e.target.value))}
            disabled={isReisekosten && (reiseTyp === 'kilometergeld' || reiseTyp === 'diaeten')}
            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E] disabled:bg-gray-100 disabled:cursor-not-allowed">
            {[0, 10, 13, 20].map(r => <option key={r} value={r}>{r} %</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{isBrutto ? 'Netto (€)' : 'Brutto (€)'}</label>
          <div className="w-full border border-gray-200 bg-gray-50 rounded-lg px-4 py-2.5 text-sm text-gray-700 font-medium">
            {inputNum > 0 ? (isBrutto ? netNum.toFixed(2) : grossNum.toFixed(2)) : '—'}
          </div>
        </div>
      </div>

      {vatAmt > 0 && (
        <p className="text-xs text-gray-500">USt-Betrag: <span className="font-medium">€ {vatAmt.toFixed(2)}</span></p>
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
            <label className="block text-xs font-medium text-amber-900 mb-1">Anlass der Bewirtung *</label>
            <input type="text" required={isBewirtung} placeholder="z.B. Projektbesprechung mit Kunde XY"
              value={bewirtungAnlass} onChange={e => setBewirtungAnlass(e.target.value)}
              className="w-full border border-amber-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
          </div>
          <div>
            <label className="block text-xs font-medium text-amber-900 mb-1">Teilnehmer *</label>
            <input type="text" required={isBewirtung} placeholder="z.B. Max Mustermann (Kunde XY GmbH), Jörgen Voehringer"
              value={bewirtungTeilnehmer} onChange={e => setBewirtungTeilnehmer(e.target.value)}
              className="w-full border border-amber-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
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
            <label className="block text-xs font-medium text-amber-900 mb-1">Art der Reisekosten *</label>
            <select required value={reiseTyp} onChange={e => setReiseTyp(e.target.value as typeof reiseTyp)}
              className="w-full border border-amber-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white">
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
              <label className="block text-xs font-medium text-amber-900 mb-1">Reiseziel *</label>
              <input type="text" required placeholder="z.B. Wien" value={reiseZiel}
                onChange={e => setReiseZiel(e.target.value)}
                className="w-full border border-amber-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-amber-900 mb-1">Zweck der Reise *</label>
              <input type="text" required placeholder="z.B. Kundentermin XY GmbH" value={reiseZweck}
                onChange={e => setReiseZweck(e.target.value)}
                className="w-full border border-amber-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-amber-900 mb-1">Von *</label>
              <input type="date" required value={reiseVon} onChange={e => setReiseVon(e.target.value)}
                className="w-full border border-amber-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-amber-900 mb-1">Bis *</label>
              <input type="date" required value={reiseBis} onChange={e => setReiseBis(e.target.value)}
                className="w-full border border-amber-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
            </div>
          </div>

          {reiseTyp === 'kilometergeld' && (
            <div className="bg-white rounded-lg border border-amber-300 p-3 space-y-2">
              <label className="block text-xs font-medium text-amber-900 mb-1">Gefahrene Kilometer *</label>
              <input type="number" required min="0.1" step="0.1" placeholder="z.B. 120" value={reiseKm}
                onChange={e => setReiseKm(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              <p className="text-xs text-gray-500">
                Amtliches Kilometergeld PKW: {eur(KM_SATZ)}/km · Betrag: <strong>{eur(kmBetrag)}</strong> · keine Vorsteuer (Pauschale)
              </p>
            </div>
          )}

          {reiseTyp === 'diaeten' && (
            <div className="bg-white rounded-lg border border-amber-300 p-3 space-y-2">
              <label className="block text-xs font-medium text-amber-900 mb-1">Reisedauer in Stunden *</label>
              <input type="number" required min="0.5" step="0.5" placeholder="z.B. 9,5" value={reiseStunden}
                onChange={e => setReiseStunden(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              <p className="text-xs text-gray-500">
                Unter 3 Std. kein Taggeld · 3–11 Std.: {eur(DIAETEN_STUNDENSATZ)} je angefangener Stunde ·
                ab 11 Std. voller Satz {eur(DIAETEN_TAGSSATZ)} · Betrag: <strong>{eur(diaetenBetrag)}</strong> · keine Vorsteuer (Pauschale)
              </p>
            </div>
          )}

          {reiseTyp === 'naechtigung' && (
            <p className="text-xs text-amber-700 bg-white rounded-lg border border-amber-300 p-3">
              Nächtigungspauschale ohne Beleg: {eur(17)}/Nacht (inkl. Frühstück). Liegt eine Hotelrechnung vor,
              bitte den tatsächlichen Rechnungsbetrag inkl. ausgewiesener USt oben eintragen.
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


      {/* Beschreibung */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Beschreibung <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input type="text" placeholder="z.B. Rechnung Nr. 2024-001 …" value={description}
          onChange={e => setDescription(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#35609E]" />
      </div>

      {/* Belegverwaltung */}
      {attachmentsEnabled && (
        <div className="border-t border-gray-100 pt-5">
          <BelegUpload
            transactionId={transaction.id}
            clientId={clientId}
            initialAttachments={attachments}
          />
        </div>
      )}

      {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={() => router.push('/buchungen')}
          className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors">
          Abbrechen
        </button>
        <button type="submit" disabled={loading}
          className={`flex items-center justify-center gap-1.5 flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50 ${
            type === 'income' ? 'bg-income hover:bg-income-dark' : 'bg-expense hover:bg-expense-dark'
          }`}>
          {loading ? 'Speichern…' : (
            <>
              {type === 'income' ? <ArrowUpCircle size={16} strokeWidth={2} /> : <ArrowDownCircle size={16} strokeWidth={2} />}
              Änderungen speichern
            </>
          )}
        </button>
      </div>
    </form>
  );
}
