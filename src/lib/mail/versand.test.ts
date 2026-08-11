import { describe, it, expect, afterEach } from 'vitest';
import { istEmail, htmlEscape, appBasisUrl, versandProtokollieren } from './versand';

describe('istEmail', () => {
  it('nimmt gültige Adressen an', () => {
    expect(istEmail('jv@icp-consultants.at')).toBe(true);
    expect(istEmail('vorname.nachname+tag@sub.example.co.at')).toBe(true);
  });

  it('lehnt ab, was keine einzelne Adresse ist', () => {
    expect(istEmail('')).toBe(false);
    expect(istEmail('kein-at-zeichen.at')).toBe(false);
    expect(istEmail('ohne@punkt')).toBe(false);
    expect(istEmail('a@b.at, c@d.at')).toBe(false);   // Liste statt Adresse
    expect(istEmail('a@b.at\nBcc: x@y.at')).toBe(false);
    expect(istEmail('"Name" <a@b.at>')).toBe(false);
  });

  it('lehnt absurd lange Eingaben ab', () => {
    expect(istEmail('a'.repeat(250) + '@b.at')).toBe(false);
  });
});

describe('htmlEscape', () => {
  it('entschärft Markup aus den Stammdaten', () => {
    // Der Firmenname landete ungeprüft im HTML-Teil der Mail. Damit
    // hätte man im Namen der Kanzlei beliebige Links verschicken können.
    expect(htmlEscape('<a href="http://boese.at">Klick</a>'))
      .toBe('&lt;a href=&quot;http://boese.at&quot;&gt;Klick&lt;/a&gt;');
  });

  it('lässt harmlosen Text unverändert', () => {
    expect(htmlEscape('Müller & Söhne OG')).toBe('Müller &amp; Söhne OG');
  });

  it('kommt mit null zurecht', () => {
    expect(htmlEscape(null as unknown as string)).toBe('');
  });
});

describe('appBasisUrl', () => {
  const vorher = process.env.NEXT_PUBLIC_APP_URL;
  afterEach(() => {
    if (vorher === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = vorher;
  });

  it('bevorzugt die konfigurierte Adresse', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://buchhaltung.kps.at/';
    expect(appBasisUrl('https://fremde-domain.at')).toBe('https://buchhaltung.kps.at');
  });

  it('nimmt ohne Konfiguration die Herkunft des Requests', () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(appBasisUrl('https://kps.vercel.app/')).toBe('https://kps.vercel.app');
  });

  it('ignoriert eine unbrauchbare Konfiguration', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'buchhaltung.kps.at';
    expect(appBasisUrl('https://kps.vercel.app')).toBe('https://kps.vercel.app');
  });
});

describe('versandProtokollieren', () => {
  const args = { clientId: 'c1', userId: 'u1', zweck: 'rechnung' as const, empfaenger: 'a@b.at' };

  it('gibt frei, wenn die Datenbank nicht widerspricht', async () => {
    const admin = { rpc: async () => ({ data: null, error: null }) };
    expect(await versandProtokollieren(admin, args)).toEqual({ ok: true });
  });

  it('reicht die Limit-Meldung durch', async () => {
    const admin = {
      rpc: async () => ({ data: null, error: { message: 'Versand-Limit erreicht: 50 E-Mails' } }),
    };
    const r = await versandProtokollieren(admin, args);
    expect(r.ok).toBe(false);
    expect(r.fehler).toContain('Limit');
  });

  it('lässt bei jedem anderen Fehler ebenfalls nichts durch', async () => {
    // Lieber keine Mail als eine ungezählte.
    const admin = { rpc: async () => ({ data: null, error: { message: 'connection reset' } }) };
    expect((await versandProtokollieren(admin, args)).ok).toBe(false);
  });

  it('übergibt Zweck und Limit an die Datenbank', async () => {
    let gesehen: Record<string, unknown> | null = null;
    const admin = {
      rpc: async (_fn: string, a: Record<string, unknown>) => { gesehen = a; return { data: null, error: null }; },
    };
    await versandProtokollieren(admin, { ...args, zweck: 'app_einladung' });
    expect(gesehen).toMatchObject({ p_zweck: 'app_einladung', p_limit: 10, p_empfaenger: 'a@b.at' });
  });
});
