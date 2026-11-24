// Kunden-Health-Check – Übersicht (/health-check), Welle 10.
// Je betreuter Firma der jüngste Prüflauf des Morgenlaufs mit Ampel,
// Kennzahlen und den Punkten Alarme / Neu / Hinweise / Bekannt.

import { HeartPulse } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import { Badge, Button, Card, Tile } from '@/components/ui';
import { cn } from '@/lib/utils';
import {
  AMPEL_LABEL, AMPEL_TON, DB_GRENZE_MB, gesamtSatz, kennzahlTon, letzteJeFirma, punkte, zahl, zeitpunkt,
  type HealthcheckLauf,
} from '@/lib/healthcheck';
import { ladeLaeufe } from './daten';
import LadeHinweis from './LadeHinweis';
import Ampelpunkt from './Ampelpunkt';

export const dynamic = 'force-dynamic';

export default async function HealthCheckPage() {
  const laden = await ladeLaeufe();
  const letzte = 'laeufe' in laden ? (letzteJeFirma(laden.laeufe) as HealthcheckLauf[]) : [];

  return (
    <div className="px-6 py-7 max-w-6xl mx-auto">
      <PageHeader
        title="Kunden-Health-Check"
        subtitle={'laeufe' in laden ? gesamtSatz(letzte) : 'Täglicher Morgenlauf über die betreuten Kunden-Websites.'}
        icon={HeartPulse}
      >
        <Button href="/health-check/verlauf" variant="ghost">Verlauf</Button>
      </PageHeader>

      {'grund' in laden && <LadeHinweis grund={laden.grund} meldung={laden.meldung} />}

      {laden.ok && letzte.length === 0 && (
        <EmptyState
          icon={HeartPulse}
          text="Noch keine Prüfläufe eingetragen."
          hinweis="Sobald der Morgenlauf Ergebnisse an /api/healthcheck schickt, erscheint hier je Firma eine Karte."
          href="/health-check/verlauf"
          cta="Zum Verlauf"
        />
      )}

      <div className="space-y-5">
        {letzte.map(l => <FirmaKarte key={l.firma} lauf={l} />)}
      </div>
    </div>
  );
}

function FirmaKarte({ lauf: l }: { lauf: HealthcheckLauf }) {
  const ampelRand = { gruen: 'border-l-good', gelb: 'border-l-warn-bar', rot: 'border-l-crit' }[l.ampel];
  return (
    <Card className={cn('border-l-4', ampelRand)}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-[19px] font-semibold text-navy leading-snug flex items-center gap-2.5">
            <Ampelpunkt ampel={l.ampel} />
            {l.firma}
          </h2>
          <a
            href={`https://${l.domain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[12.5px] text-ink-3 hover:text-navy"
          >
            {l.domain}
          </a>
        </div>
        <div className="text-right">
          <Badge tone={AMPEL_TON[l.ampel]}>{AMPEL_LABEL[l.ampel]}</Badge>
          <div className="text-[12.5px] text-ink-3 mt-1.5">Geprüft {zeitpunkt(l.datum)}</div>
        </div>
      </div>

      {l.zusammenfassung && <p className="text-[14.5px] text-ink-2 mb-4 max-w-[80ch]">{l.zusammenfassung}</p>}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <Tile label="Datenbank" value={zahl(l.db_mb, 'MB')} detail={`Grenze ${zahl(DB_GRENZE_MB, 'MB')}`} tone={kennzahlTon('db_mb', l.db_mb)} />
        <Tile label="Langsamste Seite" value={zahl(l.seiten_ms_max, 'ms')} tone={kennzahlTon('seiten_ms_max', l.seiten_ms_max)} />
        <Tile label="SSL gültig noch" value={zahl(l.ssl_tage, 'Tage')} tone={kennzahlTon('ssl_tage', l.ssl_tage)} />
        <Tile label="Offene Updates" value={zahl(l.plugin_updates)} tone={kennzahlTon('plugin_updates', l.plugin_updates)} />
        <Tile
          label="Wartestellung"
          value={zahl(l.wartestellung)}
          detail={l.bearbeitung !== null ? `${zahl(l.bearbeitung)} in Bearbeitung` : undefined}
          tone={kennzahlTon('wartestellung', l.wartestellung)}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-x-8 gap-y-4">
        <Punkte titel="Alarme"   ton="crit" eintraege={punkte(l.alarme)} />
        <Punkte titel="Neu"      ton="warn" eintraege={punkte(l.neu)} />
        <Punkte titel="Hinweise" ton="info" eintraege={punkte(l.warnungen)} />
        <Punkte titel="Bekannt"  ton="gray" eintraege={punkte(l.bekannt)} />
      </div>

      {l.as_fehler !== null && l.as_fehler > 0 && (
        <p className="text-[12.5px] text-ink-3 mt-4">Hintergrundaufgaben mit Fehler: <span className="num">{zahl(l.as_fehler)}</span></p>
      )}

      {l.bericht && (
        <details className="mt-4 group">
          <summary className="cursor-pointer text-[13px] font-medium text-navy hover:underline">Ganzer Bericht</summary>
          <pre className="mt-2 p-3 bg-well rounded-md text-[12.5px] text-ink-2 whitespace-pre-wrap font-mono">{l.bericht}</pre>
        </details>
      )}
    </Card>
  );
}

function Punkte({ titel, ton, eintraege }: { titel: string; ton: 'crit' | 'warn' | 'info' | 'gray'; eintraege: string[] }) {
  const farbe = { crit: 'text-crit', warn: 'text-warn', info: 'text-info', gray: 'text-ink-3' }[ton];
  const punkt = { crit: 'bg-crit', warn: 'bg-warn-bar', info: 'bg-info', gray: 'bg-line-2' }[ton];
  return (
    <div>
      <div className={cn('label-mono mb-1.5', farbe)}>
        {titel} <span className="text-ink-3">({eintraege.length})</span>
      </div>
      {eintraege.length === 0 ? (
        <p className="text-[13px] text-ink-3">–</p>
      ) : (
        <ul className="space-y-1">
          {eintraege.map((p, i) => (
            <li key={i} className={cn('flex gap-2 text-[13.5px]', ton === 'gray' ? 'text-ink-3' : 'text-ink')}>
              <i className={cn('mt-[7px] w-1.5 h-1.5 rounded-full shrink-0', punkt)} aria-hidden />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
