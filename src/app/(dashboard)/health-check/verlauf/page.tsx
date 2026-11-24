// Kunden-Health-Check – Verlauf (/health-check/verlauf), Welle 10.
// Datenbankgröße je Firma über die Zeit und alle Prüfläufe als Tabelle.

import { ChartLine } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { Badge, Card, CardHeader, Td, Th, Tr } from '@/components/ui';
import { AMPEL_LABEL, AMPEL_TON, DB_GRENZE_MB, kennzahlTon, zahl, zeitpunkt } from '@/lib/healthcheck';
import { cn } from '@/lib/utils';
import { ladeLaeufe } from '../daten';
import LadeHinweis from '../LadeHinweis';
import DbVerlaufDiagramm from '../DbVerlaufDiagramm';

export const dynamic = 'force-dynamic';

const TON_KLASSE = { navy: '', warn: 'text-warn font-semibold', crit: 'text-crit font-semibold' } as const;

export default async function HealthCheckVerlaufPage() {
  const laden = await ladeLaeufe();

  return (
    <div className="px-6 py-7 max-w-6xl mx-auto">
      <PageHeader
        title="Health-Check-Verlauf"
        subtitle={`Datenbankgröße je Firma gegen die Hoster-Grenze von ${zahl(DB_GRENZE_MB, 'MB')} und alle Prüfläufe.`}
        icon={ChartLine}
      />

      {'grund' in laden ? <LadeHinweis grund={laden.grund} meldung={laden.meldung} /> : (
        <div className="space-y-5">
          <Card>
            <CardHeader title="Datenbankgröße" />
            <DbVerlaufDiagramm laeufe={laden.laeufe} />
          </Card>

          <Card padded={false}>
            <CardHeader title={`Prüfläufe (${laden.laeufe.length})`} border />
            {laden.laeufe.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-ink-3">Noch keine Prüfläufe eingetragen.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13.5px]">
                  <thead>
                    <tr>
                      <Th>Zeitpunkt</Th>
                      <Th>Firma</Th>
                      <Th>Ampel</Th>
                      <Th num>DB</Th>
                      <Th num>Langsamste Seite</Th>
                      <Th num>SSL</Th>
                      <Th num>Updates</Th>
                      <Th>Zusammenfassung</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {laden.laeufe.map(l => (
                      <Tr key={l.id}>
                        <Td className="num text-[12.5px] whitespace-nowrap">{zeitpunkt(l.datum)}</Td>
                        <Td className="whitespace-nowrap">
                          <div className="font-medium text-ink">{l.firma}</div>
                          <div className="font-mono text-[11.5px] text-ink-3">{l.domain}</div>
                        </Td>
                        <Td><Badge tone={AMPEL_TON[l.ampel]}>{AMPEL_LABEL[l.ampel]}</Badge></Td>
                        <Td num className={cn('whitespace-nowrap', TON_KLASSE[kennzahlTon('db_mb', l.db_mb)])}>{zahl(l.db_mb, 'MB')}</Td>
                        <Td num className={cn('whitespace-nowrap', TON_KLASSE[kennzahlTon('seiten_ms_max', l.seiten_ms_max)])}>{zahl(l.seiten_ms_max, 'ms')}</Td>
                        <Td num className={cn('whitespace-nowrap', TON_KLASSE[kennzahlTon('ssl_tage', l.ssl_tage)])}>{zahl(l.ssl_tage, 'T')}</Td>
                        <Td num>{zahl(l.plugin_updates)}</Td>
                        <Td className="text-ink-2 min-w-[280px]">{l.zusammenfassung ?? '–'}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
