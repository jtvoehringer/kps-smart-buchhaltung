// UVA Druckansicht – /uva/drucken?year=2025&quarter=2
// Öffnet sich im neuen Tab, löst automatisch den Druck-Dialog aus
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import DruckButtons from './DruckButtons';
import { getMyClientId } from '@/lib/supabase/get-my-client';
import { VAT_RATES, calculateUVA } from '@/lib/utils';

const FAELLIGKEITEN: Record<number, string> = {
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
  return new Intl.NumberFormat('de-AT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(val);
}

export default async function UVADruckenPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; quarter?: string }>;
}) {
  const { year: yearParam, quarter: quarterParam } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const clientId = await getMyClientId(supabase, user.id);
  const { data: client } = !clientId ? { data: null } : await supabase
    .from('clients')
    .select('id, company_name, vat_liable')
    .eq('id', clientId)
    .maybeSingle();

  if (!client || !client.vat_liable) redirect('/uva');

  const year    = parseInt(yearParam    ?? String(new Date().getFullYear()));
  const quarter = parseInt(quarterParam ?? String(Math.ceil((new Date().getMonth() + 1) / 3)));

  if (isNaN(year) || isNaN(quarter) || quarter < 1 || quarter > 4) redirect('/uva');

  const qMonths = [quarter * 3 - 2, quarter * 3 - 1, quarter * 3];
  const dateFrom = `${year}-${String(qMonths[0]).padStart(2, '0')}-01`;
  const dateTo   = `${year}-${String(qMonths[2]).padStart(2, '0')}-31`;

  const { data: transactions } = await supabase
    .from('transactions')
    .select('type, amount_net, vat_rate, vat_amount, booking_date')
    .eq('client_id', client.id)
    .gte('booking_date', dateFrom)
    .lte('booking_date', dateTo);

  const tx = transactions ?? [];

  // UVA berechnen
  const { ustByRate, vstByRate, totalUSt, totalVSt, zahllast } = calculateUVA(tx);
  const isGutschrift = zahllast < 0;

  const today     = new Date().toLocaleDateString('de-AT');
  const faelligkeit = FAELLIGKEITEN[quarter];
  const quartalLabel = `Q${quarter} / ${year}`;
  const monateLabel  = QUARTAL_MONATE[quarter];

  const ustRows = VAT_RATES.map(r => ({
    label: r === 0
      ? 'Steuerfreie Umsätze (Kz 000)'
      : `Steuerpfl. Umsätze ${r}% USt (Kz 0${r < 10 ? '0'+r : r})`,
    bgl: ustByRate[r].bemessungsgrundlage,
    steuer: ustByRate[r].steuer,
    rate: r,
  }));

  const vstRows = VAT_RATES.map(r => ({
    label: r === 0
      ? 'Steuerfreie Eingangsleistungen'
      : `Vorsteuern ${r}% (Kz 060)`,
    bgl: vstByRate[r].bemessungsgrundlage,
    steuer: vstByRate[r].steuer,
    rate: r,
  }));

  return (
    <html lang="de">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>UVA {quartalLabel} – {client.company_name}</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 12px;
            color: #1a1a1a;
            background: white;
            padding: 32px 40px;
            max-width: 800px;
            margin: 0 auto;
          }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; border-bottom: 2px solid #3F454C; padding-bottom: 16px; }
          .logo-block { display: flex; align-items: center; gap: 12px; }
          .logo { width: 36px; height: 36px; background: #3F454C; color: white; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 10px; letter-spacing: 0.5px; }
          .brand-name { font-size: 9px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #888; }
          .company-name { font-size: 15px; font-weight: 700; color: #35609E; margin-top: 2px; }
          .header-right { text-align: right; }
          .doc-title { font-size: 18px; font-weight: 800; color: #35609E; }
          .period { font-size: 13px; color: #555; margin-top: 3px; }
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
            body { padding: 0; }
            @page { margin: 18mm 14mm; }
          }
        `}</style>
      </head>
      <body>
        {/* Drucken / Schließen – Client Component */}
        <DruckButtons />

        {/* Kopfzeile */}
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
            <div className="period">{quartalLabel} · {monateLabel}</div>
          </div>
        </div>

        {/* Meta-Infos */}
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

        {/* Umsatzsteuer-Tabelle */}
        <div className="section">
          <div className="section-header blue">
            <h3>Umsatzsteuer (Kennzahlen 000–072)</h3>
            <p>Ausgangsleistungen / Einnahmen</p>
          </div>
          {ustRows.every(r => r.bgl === 0 && r.steuer === 0) ? (
            <div className="empty-note">Keine Einnahmen in diesem Quartal</div>
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
                  <tr key={r.rate}>
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

        {/* Vorsteuer-Tabelle */}
        <div className="section">
          <div className="section-header teal">
            <h3>Vorsteuer (Kennzahl 060)</h3>
            <p>Eingangsleistungen / Ausgaben</p>
          </div>
          {vstRows.every(r => r.bgl === 0 && r.steuer === 0) ? (
            <div className="empty-note">Keine Ausgaben in diesem Quartal</div>
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
                  <tr key={r.rate}>
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

        {/* Ergebnis */}
        <div className={`result-box ${isGutschrift ? 'gutschrift' : 'zahllast'}`}>
          <div className="result-title">Ergebnis {quartalLabel}</div>
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
              <div className="label">{isGutschrift ? '✓ Gutschrift' : '⚠ Zahllast'}</div>
              <div className="value">{eur(Math.abs(zahllast))}</div>
            </div>
          </div>
        </div>

        {/* Footer */}
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
      </body>
    </html>
  );
}
