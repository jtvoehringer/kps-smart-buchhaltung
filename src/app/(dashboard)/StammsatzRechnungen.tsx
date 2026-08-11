// Rechnungsübersicht auf den Kunden- und Lieferanten-Detailseiten.
// Server-Komponente – reine Anzeige, keine Interaktion.
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils';

export type StammsatzRechnung = {
  id: string;
  nummer: string | null;
  datum: string;
  faellig: string | null;
  status: string;
  brutto: number;
  /** Ziel für den Klick auf die Zeile. Ohne href wird nicht verlinkt. */
  href?: string;
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Entwurf', open: 'Offen', paid: 'Bezahlt', cancelled: 'Storniert',
};
const STATUS_STYLE: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-500',
  open:      'bg-amber-100 text-amber-700',
  paid:      'bg-green-100 text-green-700',
  cancelled: 'bg-red-50 text-red-400',
};

function datum(d: string | null) {
  return d ? new Date(d).toLocaleDateString('de-AT') : '—';
}

export default function StammsatzRechnungen({
  titel,
  zeilen,
  leerText,
}: {
  titel: string;
  zeilen: StammsatzRechnung[];
  leerText: string;
}) {
  const gezaehlt = zeilen.filter(z => z.status !== 'cancelled');
  const gesamt   = gezaehlt.reduce((s, z) => s + Number(z.brutto), 0);
  const offen    = gezaehlt.filter(z => z.status === 'open');
  const offenSum = offen.reduce((s, z) => s + Number(z.brutto), 0);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="font-semibold text-gray-800">{titel}</h2>
        {zeilen.length > 0 && (
          <p className="text-xs text-gray-400">
            {gezaehlt.length} {gezaehlt.length === 1 ? 'Rechnung' : 'Rechnungen'} ·{' '}
            {formatCurrency(gesamt)} gesamt
            {offen.length > 0 && (
              <> · <span className="text-amber-600 font-medium">{formatCurrency(offenSum)} offen</span></>
            )}
          </p>
        )}
      </div>

      {zeilen.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center">{leerText}</p>
      ) : (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="text-left  px-2 py-2 font-medium">Nummer</th>
                <th className="text-left  px-2 py-2 font-medium">Datum</th>
                <th className="text-left  px-2 py-2 font-medium">Fällig</th>
                <th className="text-left  px-2 py-2 font-medium">Status</th>
                <th className="text-right px-2 py-2 font-medium">Brutto</th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map(z => {
                const zelleNummer = z.nummer ?? <span className="text-gray-300 italic">ohne Nummer</span>;
                return (
                  <tr key={z.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                    <td className="px-2 py-2 font-mono text-xs text-gray-700">
                      {z.href ? (
                        <Link href={z.href} className="hover:text-[#35609E] hover:underline">
                          {zelleNummer}
                        </Link>
                      ) : zelleNummer}
                    </td>
                    <td className="px-2 py-2 text-gray-500">{datum(z.datum)}</td>
                    <td className="px-2 py-2 text-gray-500">{datum(z.faellig)}</td>
                    <td className="px-2 py-2">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[z.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {STATUS_LABEL[z.status] ?? z.status}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right font-medium text-gray-800">
                      {formatCurrency(Number(z.brutto))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
