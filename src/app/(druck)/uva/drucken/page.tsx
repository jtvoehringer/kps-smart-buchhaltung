// UVA Druckansicht – /uva/drucken?year=2025&quarter=2  ODER  ?year=2025&month=3
// Öffnet sich im neuen Tab, löst automatisch den Druck-Dialog aus
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import DruckButtons from './DruckButtons';
import { getMyClientId } from '@/lib/supabase/get-my-client';
import { baueUvaAufstellung, type UstKennzeichen } from '@/lib/steuer/uva-kennzahlen';

const MONATE = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

const QUARTAL_FAELLIGKEIT: Record<number, string> = {
  1: '15. Mai',
  2: '15. August',
  3: '15. November',
  4: '15. Februar (Folgejahr)',
};

const QUARTAL_MONATE: Record<number, string> = {
  1: 'Jänner – März',
  2: 'April – Juni',
  3: 'Juli – September',
  4: 'Oktober – Dezember',
};

function eur(val: number) {
  return new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(val);
}

function formatDateTime(ts: string | null) {
  return ts ? new Date(ts).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;
}

export default async function UVADruckenPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; quarter?: string; month?: string }>;
}) {
  const { year: yearParam, quarter: quarterParam, month: monthParam } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const clientId = await getMyClientId(supabase, user.id);
  const { data: client } = !clientId ? { data: null } : await supabase
    .from('clients')
    .select('id, company_name, vat_liable, vat_period')
    .eq('id', clientId)
    .maybeSingle();

  if (!client || !client.vat_liable) redirect('/uva');

  const isQuarterly = (client.vat_period ?? 'quarterly') !== 'monthly';
  const year = parseInt(yearParam ?? String(new Date().getFullYear()));

  let periodMonth: number;   // letzter Monat des Zeitraums (Quartalsende bzw. der Monat selbst)
  let periodStartMonth: number;
  let periodLabel: string;
  let monateLabel: string;
  let faelligkeit: string;

  if (isQuarterly) {
    const quarter = parseInt(quarterParam ?? String(Math.ceil((new Date().getMonth() + 1) / 3)));
    if (isNaN(year) || isNaN(quarter) || quarter < 1 || quarter > 4) redirect('/uva');
    periodMonth = quarter * 3;
    periodStartMonth = quarter * 3 - 2;
    periodLabel = `Q${quarter} / ${year}`;
    monateLabel = QUARTAL_MONATE[quarter];
    faelligkeit = QUARTAL_FAELLIGKEIT[quarter];
  } else {
    const month = parseInt(monthParam ?? String(new Date().getMonth() + 1));
    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) redirect('/uva');
    periodMonth = month;
    periodStartMonth = month;
    periodLabel = `${MONATE[month - 1]} / ${year}`;
    monateLabel = MONATE[month - 1];
    let dueMonth = month + 2, dueYear = year;
    if (dueMonth > 12) { dueMonth -= 12; dueYear += 1; }
    faelligkeit = `15. ${MONATE[dueMonth - 1]}${dueYear !== year ? ` ${dueYear}` : ''}`;
  }

  const dateFrom = `${year}-${String(periodStartMonth).padStart(2, '0')}-01`;
  const lastDay = new Date(year, periodMonth, 0).getDate();
  const dateTo = `${year}-${String(periodMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  // Dieselbe Quelle wie die Bildschirmansicht: uva_summe(). Vorher
  // aggregierten beide Seiten unabhängig voneinander und konnten
  // dadurch unterschiedliche Zahlen anzeigen.
  const { data: summenZeilen } = await supabase.rpc('uva_summe', {
    p_client_id: client.id,
    p_von: dateFrom,
    p_bis: dateTo,
  });

  const transactions = (summenZeilen ?? []).map(
    (s: { typ: 'income' | 'expense'; vat_rate: number; bemessungsgrundlage: number; steuer: number }) => ({
      type: s.typ,
      amount_net: Number(s.bemessungsgrundlage),
      vat_rate: Number(s.vat_rate),
      vat_amount: Number(s.steuer),
      booking_date: dateFrom,
    }),
  );

  const { data: taxReturn } = await supabase
    .from('tax_returns')
    .select('status, submitted_at')
    .eq('client_id', client.id)
    .eq('period_year', year)
    .eq('period_month', periodMonth)
    .maybeSingle();

  const tx = transactions ?? [];
  void tx;

  // Dieselbe Kennzahlen-Zuordnung wie in der Bildschirmansicht.
  const aufstellung = baueUvaAufstellung((summenZeilen ?? []).map(
    (s: { typ: 'income' | 'expense'; ust_kennzeichen: string; vat_rate: number; bemessungsgrundlage: number; steuer: number }) => ({
      typ: s.typ,
      ust_kennzeichen: (s.ust_kennzeichen ?? 'normal') as UstKennzeichen,
      vat_rate: Number(s.vat_rate),
      bemessungsgrundlage: Number(s.bemessungsgrundlage),
      steuer: Number(s.steuer),
    }),
  ));
  const totalUSt = aufstellung.gesamtUst;
  const totalVSt = aufstellung.gesamtVorsteuer;
  const zahllast = aufstellung.zahllast;
  const isGutschrift = zahllast < 0;
  const isSubmitted = taxReturn?.status === 'submitted';

  const today = new Date().toLocaleDateString('de-AT');

  const ustRows = [
    ...aufstellung.umsatz.map(z => ({
      label: `${z.label} (Kz ${z.kz})`, bgl: z.bemessungsgrundlage, steuer: z.steuer, rate: 0,
    })),
    ...aufstellung.erwerb.map(z => ({
      label: `${z.label} (Kz ${z.kz})`, bgl: z.bemessungsgrundlage, steuer: z.steuer, rate: 0,
    })),
  ];

  const vstRows = aufstellung.vorsteuer.map(z => ({
    label: `${z.label} (Kz ${z.kz})`, bgl: z.bemessungsgrundlage, steuer: z.steuer, rate: 0,
  }));

  // Kein eigenes <html>/<body> mehr – siehe Rechnungs-Druckseite:
  // verschachteltes <html> löst seit Next 16 / React 19 den
  // Hydration-Fehler #418 aus und die Seite bleibt leer.
  return (
    <>
      <title>{`UVA ${periodLabel} – ${client.company_name}`}</title>
      <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          html, body { background: white; }
          .sheet {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 12px;
            color: #1a1a1a;
            background: white;
            padding: 32px 40px;
            max-width: 800px;
            margin: 0 auto;
          }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; border-bottom: 2px solid #14355C; padding-bottom: 16px; }
          .logo-block { display: flex; align-items: center; gap: 12px; }
          .logo { width: 36px; height: 36px; background: #14355C; color: white; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 10px; letter-spacing: 0.5px; }
          .brand-name { font-size: 9px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #888; }
          .company-name { font-size: 15px; font-weight: 700; color: #35609E; margin-top: 2px; }
          .header-right { text-align: right; }
          .doc-title { font-size: 18px; font-weight: 800; color: #35609E; }
          .period { font-size: 13px; color: #555; margin-top: 3px; }
          .status-badge { display: inline-block; margin-top: 6px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; padding: 3px 10px; border-radius: 999px; }
          .status-badge.submitted { background: #f3f4f6; color: #4b5563; }
          .status-badge.draft { background: #fef3c7; color: #92400e; }
          .meta-row { display: flex; gap: 24px; margin-bottom: 24px; }
          .meta-card { background: #f8f9fa; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 16px; flex: 1; }
          .meta-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 3px; }
          .meta-value { font-size: 13px; font-weight: 600; color: #1a1a1a; }
          .section { margin-bottom: 20px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
          .section-header { padding: 10px 16px; }
          .section-header.blue { background: #35609E; }
          .section-header.teal { background: #00897B; }
          .section-header h3 { color: white; font-size: 12px; font-weight: 700; }
          .section-header p { color: rgba(255,255,255,0.65); font-size: 10px; margin-top: 1px; }
          table { width: 100%; border-collapse: collapse; }
          thead tr { background: #f9fafb; border-bottom: 1px solid #e5e7eb; }
          th { padding: 8px 14px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #6b7280; text-align: right; }
          th:first-child { text-align: left; }
          td { padding: 8px 14px; border-bottom: 1px solid #f3f4f6; text-align: right; color: #374151; }
          td:first-child { text-align: left; }
          tr.total-row { background: #f9fafb; border-top: 1px solid #d1d5db; }
          tr.total-row td { font-weight: 700; font-size: 12px; color: #111; border-bottom: none; }
          .result-box { border-radius: 8px; padding: 20px 24px; margin-bottom: 20px; }
          .result-box.zahllast { background: #fef2f2; border: 1px solid #fecaca; }
          .result-box.gutschrift { background: #ecfdf5; border: 1px solid #a7f3d0; }
          .result-title { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #6b7280; margin-bottom: 12px; }
          .result-row { display: flex; align-items: center; gap: 16px; }
          .result-item { }
          .result-item .label { font-size: 9px; color: #9ca3af; margin-bottom: 2px; }
          .result-item .value { font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; }
          .result-divider { font-size: 18px; color: #d1d5db; font-weight: 300; }
          .result-final { margin-left: auto; }
          .result-final .label { font-size: 10px; font-weight: 700; text-transform: uppercase; margin-bottom: 2px; }
          .result-final.zahllast .label { color: #dc2626; }
          .result-final.gutschrift .label { color: #059669; }
          .result-final .value { font-size: 22px; font-weight: 900; font-variant-numeric: tabular-nums; }
          .result-final.zahllast .value { color: #b91c1c; }
          .result-final.gutschrift .value { color: #047857; }
          .footer { margin-top: 28px; padding-top: 16px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; }
          .footer-disclaimer { font-size: 9px; color: #9ca3af; max-width: 480px; line-height: 1.5; }
          .footer-meta { font-size: 9px; color: #9ca3af; text-align: right; }
          .no-print { margin-bottom: 16px; display: flex; gap: 8px; }
          .btn-print { background: #35609E; color: white; border: none; padding: 8px 18px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
          .btn-close { background: #f3f4f6; color: #374151; border: none; padding: 8px 18px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
          .empty-note { padding: 16px; text-align: center; color: #9ca3af; font-size: 11px; }
          @media print {
            .no-print { display: none !important; }
            .sheet { padding: 0; }
            @page { margin: 18mm 14mm; }
          }
        `}</style>
      <div className="sheet">
        <DruckButtons />

        <div className="header">
          <div className="logo-block">
            <div className="logo">KPS</div>
            <div>
              <div className="brand-name">Smart Buchhaltung</div>
              <div className="company-name">{client.company_name}</div>
            </div>
          </div>
          <div className="header-right">
            <div className="doc-title">UVA – Umsatzsteuervoranmeldung</div>
            <div className="period">{periodLabel} · {monateLabel}</div>
            <div className={`status-badge ${isSubmitted ? 'submitted' : 'draft'}`}>
              {isSubmitted ? `Übermittelt${formatDateTime(taxReturn?.submitted_at ?? null) ? ` am ${formatDateTime(taxReturn!.submitted_at)}` : ''}` : 'Entwurf'}
            </div>
          </div>
        </div>

        <div className="meta-row">
          <div className="meta-card">
            <div className="meta-label">Zeitraum</div>
            <div className="meta-value">{monateLabel} {year}</div>
          </div>
          <div className="meta-card">
            <div className="meta-label">Fälligkeit</div>
            <div className="meta-value">{faelligkeit}</div>
          </div>
          <div className="meta-card">
            <div className="meta-label">Anzahl Buchungen</div>
            <div className="meta-value">{tx.length}</div>
          </div>
          <div className="meta-card">
            <div className="meta-label">Erstellt am</div>
            <div className="meta-value">{today}</div>
          </div>
        </div>

        <div className="section">
          <div className="section-header blue">
            <h3>1. Umsätze (Kz 000)</h3>
            <p>Ausgangsleistungen / Einnahmen</p>
          </div>
          {ustRows.every(r => r.bgl === 0 && r.steuer === 0) ? (
            <div className="empty-note">Keine Einnahmen in diesem Zeitraum</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{textAlign: 'left'}}>Bezeichnung</th>
                  <th>Bemessungsgrundlage</th>
                  <th>Steuerbetrag</th>
                </tr>
              </thead>
              <tbody>
                {ustRows.filter(r => r.bgl > 0 || r.steuer > 0).map(r => (
                  <tr key={r.label}>
                    <td>{r.label}</td>
                    <td>{eur(r.bgl)}</td>
                    <td>{r.rate === 0 ? '–' : eur(r.steuer)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="total-row">
                  <td>Gesamte Umsatzsteuer</td>
                  <td></td>
                  <td>{eur(totalUSt)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div className="section">
          <div className="section-header teal">
            <h3>2. Vorsteuer (Kz 060)</h3>
            <p>Eingangsleistungen / Ausgaben</p>
          </div>
          {vstRows.every(r => r.bgl === 0 && r.steuer === 0) ? (
            <div className="empty-note">Keine Ausgaben in diesem Zeitraum</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{textAlign: 'left'}}>Bezeichnung</th>
                  <th>Bemessungsgrundlage</th>
                  <th>Steuerbetrag</th>
                </tr>
              </thead>
              <tbody>
                {vstRows.filter(r => r.bgl > 0 || r.steuer > 0).map(r => (
                  <tr key={r.label}>
                    <td>{r.label}</td>
                    <td>{eur(r.bgl)}</td>
                    <td>{r.rate === 0 ? '–' : eur(r.steuer)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="total-row">
                  <td>Gesamte Vorsteuer</td>
                  <td></td>
                  <td>{eur(totalVSt)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div className={`result-box ${isGutschrift ? 'gutschrift' : 'zahllast'}`}>
          <div className="result-title">Ergebnis {periodLabel} (Kz 095)</div>
          <div className="result-row">
            <div className="result-item">
              <div className="label">Umsatzsteuer</div>
              <div className="value">{eur(totalUSt)}</div>
            </div>
            <div className="result-divider">−</div>
            <div className="result-item">
              <div className="label">Vorsteuer</div>
              <div className="value">{eur(totalVSt)}</div>
            </div>
            <div className="result-divider">=</div>
            <div className={`result-final ${isGutschrift ? 'gutschrift' : 'zahllast'}`}>
              <div className="label">{isGutschrift ? '✓ Gutschrift' : 'Zahllast'}</div>
              <div className="value">{eur(Math.abs(zahllast))}</div>
            </div>
          </div>
        </div>

        <div className="footer">
          <div className="footer-disclaimer">
            Diese Berechnung dient als Orientierungshilfe und ersetzt nicht die offizielle UVA-Meldung.
            Maßgeblich ist die Erklärung über FinanzOnline (finanz.at). Bitte mit Ihrem Steuerberater abstimmen.
          </div>
          <div className="footer-meta">
            IC&amp;P Consultants e.U.<br />
            KPS Smart Buchhaltung
          </div>
        </div>
      </div>
    </>
  );
}
