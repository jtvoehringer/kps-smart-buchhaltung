// Datenbankgröße je Firma über die Zeit (SVG, serverseitig gerendert).
// Gestrichelte Linie bei der Hoster-Grenze, direkte Beschriftung am Linienende.

import { DB_GRENZE_MB, dbSerien, zahl, type HealthcheckLauf } from '@/lib/healthcheck';
import { Legend } from '@/components/ui';

const B = 720, H = 260;
const RAND = { l: 56, r: 24, o: 16, u: 32 };
const FARBEN = ['#2e64b0', '#3fa0c8', '#14355c', '#7a8aa0', '#1e7b4f', '#9a6700'];
const FARB_KLASSEN = ['bg-chart-1', 'bg-chart-2', 'bg-navy', 'bg-ink-3', 'bg-good', 'bg-warn'];

const tickFormat = (spanneTage: number) => new Intl.DateTimeFormat('de-AT', {
  timeZone: 'Europe/Vienna',
  day: '2-digit', month: '2-digit',
  ...(spanneTage < 3 ? { hour: '2-digit', minute: '2-digit' } : {}),
});

export default function DbVerlaufDiagramm({ laeufe }: { laeufe: HealthcheckLauf[] }) {
  const serien = dbSerien(laeufe);
  const punkte = serien.flatMap(s => s.punkte);
  if (punkte.length === 0) {
    return <p className="text-[13px] text-ink-3">Noch keine Datenbankgrößen gemessen.</p>;
  }

  let t0 = Math.min(...punkte.map(p => p.t));
  let t1 = Math.max(...punkte.map(p => p.t));
  if (t0 === t1) { t0 -= 12 * 3600e3; t1 += 12 * 3600e3; }   // ein einzelner Messpunkt in der Mitte
  const yMax = Math.max(DB_GRENZE_MB, ...punkte.map(p => p.mb)) * 1.1;

  const x = (t: number) => RAND.l + (t - t0) / (t1 - t0) * (B - RAND.l - RAND.r);
  const y = (mb: number) => H - RAND.u - mb / yMax * (H - RAND.o - RAND.u);

  const yTicks = niceTicks(yMax);
  const fmt = tickFormat((t1 - t0) / 86400e3);
  const xTicks = [0, 0.5, 1].map(f => t0 + f * (t1 - t0));

  return (
    <div>
      <svg viewBox={`0 0 ${B} ${H}`} className="w-full h-auto" role="img" aria-label="Datenbankgröße je Firma über die Zeit">
        {/* Raster + y-Achse */}
        {yTicks.map(v => (
          <g key={v}>
            <line x1={RAND.l} x2={B - RAND.r} y1={y(v)} y2={y(v)} stroke="#e4e8ed" strokeWidth={1} />
            <text x={RAND.l - 8} y={y(v) + 4} textAnchor="end" className="fill-ink-3 font-mono" fontSize={11}>{zahl(v)}</text>
          </g>
        ))}
        {/* x-Achse */}
        {xTicks.map((t, i) => (
          <text key={i} x={x(t)} y={H - 10} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} className="fill-ink-3 font-mono" fontSize={11}>
            {fmt.format(new Date(t))}
          </text>
        ))}

        {/* Hoster-Grenze */}
        <line x1={RAND.l} x2={B - RAND.r} y1={y(DB_GRENZE_MB)} y2={y(DB_GRENZE_MB)} stroke="#b3372e" strokeWidth={1.5} strokeDasharray="6 4" />
        <text x={B - RAND.r} y={y(DB_GRENZE_MB) - 6} textAnchor="end" className="fill-crit font-mono" fontSize={11}>
          Hoster-Grenze {zahl(DB_GRENZE_MB, 'MB')}
        </text>

        {/* Serien */}
        {serien.map((s, i) => {
          const farbe = FARBEN[i % FARBEN.length];
          const pfad = s.punkte.map(p => `${x(p.t).toFixed(1)},${y(p.mb).toFixed(1)}`).join(' ');
          return (
            <g key={s.firma}>
              {s.punkte.length > 1 && <polyline points={pfad} fill="none" stroke={farbe} strokeWidth={2} strokeLinejoin="round" />}
              {s.punkte.map((p, j) => (
                <circle key={j} cx={x(p.t)} cy={y(p.mb)} r={3.5} fill="#fff" stroke={farbe} strokeWidth={2}>
                  <title>{`${s.firma}: ${zahl(p.mb, 'MB')}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      {serien.length > 0 && (
        <Legend
          className="mt-2"
          items={serien.map((s, i) => ({ color: FARB_KLASSEN[i % FARB_KLASSEN.length], label: `${s.firma} (zuletzt ${zahl(s.punkte.at(-1)!.mb, 'MB')})` }))}
        />
      )}
    </div>
  );
}

/** 4–6 runde Rasterwerte von 0 bis max */
function niceTicks(max: number): number[] {
  const roh = max / 5;
  const pot = 10 ** Math.floor(Math.log10(roh));
  const schritt = [1, 2, 2.5, 5, 10].map(f => f * pot).find(s => s >= roh) ?? roh;
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += schritt) ticks.push(v);
  return ticks;
}
