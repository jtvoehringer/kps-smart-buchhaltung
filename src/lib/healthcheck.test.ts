import { describe, it, expect } from 'vitest';
import { dbSerien, gesamtSatz, kennzahlTon, letzteJeFirma, pruefeLauf, punkte, zeitpunkt } from './healthcheck';

const gueltig = {
  firma: 'hetych.at',
  domain: 'www.hetych.at',
  datum: '2026-11-24T19:05:00+01:00',
  ampel: 'gelb',
  db_mb: 324,
  seiten_ms_max: 1208,
  ssl_tage: 81,
  plugin_updates: 2,
  wartestellung: 0,
  bearbeitung: 4,
  as_fehler: 32,
  neu: 'DMARC-Eintrag mit Leerzeichen | Systemsicherung fehlte',
  zusammenfassung: 'Erstlauf von Hand.',
};

describe('pruefeLauf', () => {
  it('nimmt einen vollständigen Lauf an und rechnet den Zeitpunkt in UTC um', () => {
    const r = pruefeLauf(gueltig);
    expect(r.ok).toBe(true);
    if (!('lauf' in r)) return;
    expect(r.lauf.datum).toBe('2026-11-24T18:05:00.000Z');
    expect(r.lauf.alarme).toBeNull();
    expect(r.lauf.bericht).toBeNull();
    expect(r.lauf.db_mb).toBe(324);
  });

  it('Zahlen dürfen null sein, leere Texte werden null', () => {
    const r = pruefeLauf({ ...gueltig, seiten_ms_max: null, alarme: '  ' });
    expect(r.ok && r.lauf.seiten_ms_max).toBeNull();
    expect(r.ok && r.lauf.alarme).toBeNull();
  });

  it('lehnt fehlende Pflichtfelder, falsche Ampel und unbekannte Felder ab', () => {
    const r = pruefeLauf({ ampel: 'orange', db_groesse: 3 });
    expect(r.ok).toBe(false);
    if (!('fehler' in r)) return;
    expect(r.fehler.join(' ')).toMatch(/Unbekanntes Feld „db_groesse“/);
    expect(r.fehler.join(' ')).toMatch(/„firma“ fehlt/);
    expect(r.fehler.join(' ')).toMatch(/„domain“ fehlt/);
    expect(r.fehler.join(' ')).toMatch(/„datum“ fehlt/);
    expect(r.fehler.join(' ')).toMatch(/gruen, gelb oder rot/);
  });

  it('verlangt eine Zeitzone im Datum', () => {
    const r = pruefeLauf({ ...gueltig, datum: '2026-11-25T08:00:00' });
    expect(r.ok).toBe(false);
  });

  it('lehnt negative Zahlen und Text in Zahlenfeldern ab', () => {
    expect(pruefeLauf({ ...gueltig, ssl_tage: -1 }).ok).toBe(false);
    expect(pruefeLauf({ ...gueltig, db_mb: '324' }).ok).toBe(false);
  });

  it('lehnt Nicht-Objekte ab', () => {
    expect(pruefeLauf(null).ok).toBe(false);
    expect(pruefeLauf([gueltig]).ok).toBe(false);
  });
});

describe('Auswertung', () => {
  it('punkte trennt an " | "', () => {
    expect(punkte('a | b |  c ')).toEqual(['a', 'b', 'c']);
    expect(punkte(null)).toEqual([]);
  });

  it('letzteJeFirma nimmt den jüngsten Lauf', () => {
    const l = letzteJeFirma([
      { firma: 'b', datum: '2026-11-24T08:15:00Z' },
      { firma: 'a', datum: '2026-11-24T08:15:00Z' },
      { firma: 'b', datum: '2026-11-24T18:05:00Z' },
    ]);
    expect(l.map(x => `${x.firma}@${x.datum}`)).toEqual(['a@2026-11-24T08:15:00Z', 'b@2026-11-24T18:05:00Z']);
  });

  it('gesamtSatz', () => {
    expect(gesamtSatz([{ ampel: 'gelb' }])).toBe('Kein Handlungsbedarf. 1 von 1 Firma hat Hinweise.');
    expect(gesamtSatz([{ ampel: 'rot' }, { ampel: 'gelb' }, { ampel: 'gruen' }]))
      .toBe('Handlungsbedarf: 1 von 3 Firmen hat Alarme. 1 von 3 Firmen hat Hinweise.');
    expect(gesamtSatz([{ ampel: 'gruen' }, { ampel: 'gruen' }])).toBe('Kein Handlungsbedarf. Alle 2 Firmen sind ohne Befund.');
    expect(gesamtSatz([])).toBe('Noch keine Prüfläufe eingetragen.');
  });

  it('dbSerien sortiert je Firma aufsteigend und lässt Läufe ohne Messung weg', () => {
    const s = dbSerien([
      { firma: 'hetych.at', datum: '2026-11-24T18:05:00Z', db_mb: 324 },
      { firma: 'hetych.at', datum: '2026-11-24T08:15:00Z', db_mb: 2320 },
      { firma: 'x.at', datum: '2026-11-24T08:15:00Z', db_mb: null },
    ]);
    expect(s).toHaveLength(1);
    expect(s[0].punkte.map(p => p.mb)).toEqual([2320, 324]);
  });

  it('kennzahlTon: Datenbank über der Hoster-Grenze ist rot', () => {
    expect(kennzahlTon('db_mb', 2320)).toBe('crit');
    expect(kennzahlTon('db_mb', 850)).toBe('warn');
    expect(kennzahlTon('db_mb', 324)).toBe('navy');
    expect(kennzahlTon('ssl_tage', 5)).toBe('crit');
  });

  it('zeitpunkt zeigt Wiener Zeit', () => {
    expect(zeitpunkt('2026-11-24T18:05:00Z')).toBe('24.11.2026, 19:05');
  });
});
