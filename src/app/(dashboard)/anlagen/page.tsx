export const dynamic = 'force-dynamic';

// Anlagenverzeichnis – /anlagen (Welle 7)
// Liste aller Anlagen mit AfA des gewählten Jahres und Buchwert zum
// Jahresende, darüber der Anlagenspiegel. Rechenlogik: src/lib/anlagen.ts

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Landmark, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getMyClientId } from '@/lib/supabase/get-my-client';
import { formatCurrency } from '@/lib/utils';
import { afaImJahr, afaSatzProzent, anlagenspiegel, buchwertEndeJahr, type Anlage } from '@/lib/anlagen';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import { Badge, Button, Card, CardHeader, Note, Td, Th, Tile, Tr } from '@/components/ui';
import JahrWaehler from './JahrWaehler';
import { ladeBuchungsKandidaten } from './kandidaten';

const METHODE: Record<string, string> = { linear: 'linear', degressiv: 'degressiv', gwg: 'GWG' };
const datum = (iso: string | null) =>
  iso ? new Date(iso + 'T00:00:00').toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

export default async function AnlagenPage({ searchParams }: { searchParams: Promise<{ jahr?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const clientId = await getMyClientId(supabase, user.id);
  if (!clientId) redirect('/dashboard');

  const { data } = await supabase
    .from('assets')
    .select('*')
    .eq('client_id', clientId)
    .order('acquired_on', { ascending: false });
  const anlagen = (data ?? []) as Anlage[];
  const offeneKaeufe = await ladeBuchungsKandidaten(supabase, clientId);

  const aktJahr = new Date().getFullYear();
  const { jahr: jahrParam } = await searchParams;
  const jahre = [...new Set([aktJahr, ...anlagen.map(a => Number(a.acquired_on.slice(0, 4)))])].sort((a, b) => a - b);
  const jahr = jahre.includes(Number(jahrParam)) ? Number(jahrParam) : aktJahr;
  const spiegel = anlagenspiegel(anlagen, jahr);

  const zeilen = anlagen
    .filter(a => Number(a.acquired_on.slice(0, 4)) <= jahr)
    .map(a => ({
      a,
      afa: afaImJahr(a, jahr),
      buchwert: buchwertEndeJahr(a, jahr),
      abgegangen: !!a.disposed_on && Number(a.disposed_on.slice(0, 4)) <= jahr,
    }));

  return (
    <div className="px-6 py-7 max-w-6xl mx-auto">
      <PageHeader
        title="Anlagenverzeichnis"
        subtitle="Abnutzbares Anlagevermögen mit Nutzungsdauer, AfA je Jahr und Buchwert"
        icon={Landmark}
      >
        <JahrWaehler jahre={jahre} jahr={jahr} />
        <Button href="/anlagen/neu"><Plus size={16} strokeWidth={2.5} />Anlage erfassen</Button>
      </PageHeader>

      {offeneKaeufe.length > 0 && (
        <Card className="mb-4 border-amber-200 bg-warn-bg/40">
          <CardHeader title={`${offeneKaeufe.length} ${offeneKaeufe.length === 1 ? 'Anlagenkauf' : 'Anlagenkäufe'} ohne Eintrag im Verzeichnis`}>
            <Badge tone="warn">zu erfassen</Badge>
          </CardHeader>
          <ul className="divide-y divide-line">
            {offeneKaeufe.slice(0, 6).map(b => (
              <li key={b.id} className="flex items-center gap-3 py-2">
                <span className="num text-[12.5px] text-ink-2 shrink-0">{datum(b.booking_date)}</span>
                <span className="flex-1 min-w-0 truncate text-sm text-ink">{b.description || b.kategorie}</span>
                <span className="num text-[13px] font-semibold text-ink shrink-0">{formatCurrency(b.amount_net)}</span>
                <Button href={`/anlagen/neu?buchung=${b.id}`} variant="ghost" size="sm">Anlage anlegen</Button>
              </li>
            ))}
          </ul>
          {offeneKaeufe.length > 6 && <p className="text-[12px] text-ink-3 mt-2">+ {offeneKaeufe.length - 6} weitere</p>}
        </Card>
      )}

      {anlagen.length === 0 ? (
        <EmptyState
          icon={Landmark}
          text="Noch keine Anlage erfasst."
          hinweis="Anschaffungen über 1.000 € netto (Laptop, Möbel, Fahrzeug …) gehören ins Anlagenverzeichnis und werden über die Nutzungsdauer abgeschrieben."
          href="/anlagen/neu"
          cta="Erste Anlage erfassen"
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Tile label={`Anschaffungskosten (Bestand ${jahr})`} value={formatCurrency(spiegel.anschaffungskosten)} detail={`${spiegel.anzahlAktiv} ${spiegel.anzahlAktiv === 1 ? 'Anlage' : 'Anlagen'}`} />
            <Tile label={`AfA ${jahr}`} value={formatCurrency(spiegel.afaJahr)} tone="ink" detail="Abschreibung des Jahres" />
            <Tile label="Kumulierte AfA" value={formatCurrency(spiegel.kumulierteAfa)} tone="ink" detail={`bis 31.12.${jahr}`} />
            <Tile label={`Buchwert 31.12.${jahr}`} value={formatCurrency(spiegel.buchwertEnde)} tone="good" detail={spiegel.zugaenge > 0 ? `Zugänge ${formatCurrency(spiegel.zugaenge)}` : spiegel.abgaenge > 0 ? `Abgänge ${formatCurrency(spiegel.abgaenge)}` : 'keine Zu-/Abgänge'} />
          </div>

          <Card padded={false} className="mt-4">
            <CardHeader title={`Anlagen ${jahr}`} border>
              <span className="font-mono text-[11px] text-ink-3">{zeilen.length} {zeilen.length === 1 ? 'Eintrag' : 'Einträge'}</span>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead><tr>
                  <Th>Anlage</Th><Th>Konto</Th><Th>Anschaffung</Th><Th num>AK netto</Th><Th num>ND</Th><Th>Methode</Th><Th num>AfA {jahr}</Th><Th num>Buchwert 31.12.</Th><Th>Status</Th>
                </tr></thead>
                <tbody>
                  {zeilen.map(({ a, afa, buchwert, abgegangen }) => (
                    <Tr key={a.id} className={abgegangen ? 'opacity-60' : ''}>
                      <Td className="font-medium text-ink">
                        <Link href={`/anlagen/${a.id}`} className="hover:underline">{a.name}</Link>
                        {a.asset_group && <span className="block text-[11.5px] text-ink-3 font-normal">{a.asset_group}</span>}
                      </Td>
                      <Td className="num text-[12.5px] text-ink-3">{a.konto_nr ?? '—'}</Td>
                      <Td className="num text-[13px] text-ink-2">{datum(a.acquired_on)}</Td>
                      <Td num className="text-ink">{formatCurrency(Number(a.cost_net))}</Td>
                      <Td num className="text-ink-2">{a.method === 'gwg' ? '—' : `${a.useful_life_years} J.`}</Td>
                      <Td className="text-ink-2">{METHODE[a.method]} <span className="num text-[11.5px] text-ink-3">{afaSatzProzent(a).toLocaleString('de-AT')} %</span></Td>
                      <Td num className="text-ink-2">{afa > 0 ? formatCurrency(afa) : '—'}</Td>
                      <Td num className="font-semibold text-navy">{formatCurrency(buchwert)}</Td>
                      <Td>{abgegangen
                        ? <Badge tone="gray">Abgang {datum(a.disposed_on).slice(3)}</Badge>
                        : buchwert <= Number(a.residual_value ?? 0) ? <Badge tone="info">abgeschrieben</Badge>
                        : <Badge tone="good">aktiv</Badge>}</Td>
                    </Tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Note className="mt-4">
            Halbjahresregel: bei Inbetriebnahme im zweiten Halbjahr im ersten Jahr nur die halbe Jahres-AfA. Geringwertige
            Wirtschaftsgüter (bis 1.000 € netto) werden im Jahr der Anschaffung voll abgeschrieben. Die Anschaffung selbst bleibt als
            Buchung in einer Kategorie der Kontenklasse 0 erfasst – so stimmen Vorsteuer und Export für den Steuerberater.
          </Note>
        </>
      )}
    </div>
  );
}
