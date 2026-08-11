import { describe, it, expect } from 'vitest';
import {
  baueBmdZeilen, baueBmdCsv, bmdNum, bmdDate, belegnummer,
  csvFeld, nachCp1252, bmdSummen, BMD_SPALTEN, type BmdTransaction,
} from './export';

const basis: BmdTransaction = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  booking_date: '2026-03-07',
  description: 'Bürobedarf',
  type: 'expense',
  amount_net: 100,
  vat_amount: 20,
  amount_gross: 120,
  vat_rate: 20,
  beleg_jahr: 2026,
  beleg_nr: 42,
  ust_kennzeichen: 'normal',
  is_eauto: false,
  bewirtung_anlass: null,
  bewirtung_teilnehmer: null,
  reise_typ: null,
  reise_ziel: null,
  reise_zweck: null,
  reise_von: null,
  reise_bis: null,
  reise_km: null,
  reise_stunden: null,
  category: { name: 'Büromaterial', konto_nr: '7600' },
};

const t = (over: Partial<BmdTransaction> = {}): BmdTransaction => ({ ...basis, ...over });

describe('Formatierung', () => {
  it('schreibt Beträge mit Komma und zwei Nachkommastellen', () => {
    expect(bmdNum(1234.5)).toBe('1234,50');
    expect(bmdNum(-0.005)).toBe('-0,01');
    expect(bmdNum(NaN)).toBe('0,00');
  });

  it('schreibt das Datum als TT.MM.JJJJ', () => {
    expect(bmdDate('2026-03-07')).toBe('07.03.2026');
    expect(bmdDate('2026-03-07T12:00:00Z')).toBe('07.03.2026');
  });
});

describe('Belegnummer', () => {
  it('bleibt an der Buchung hängen statt an der Listenposition', () => {
    // Vorher: String(index + 1) – dieselbe Buchung bekam bei jedem
    // Export eine andere Nummer, sobald sich der Zeitraum änderte.
    const zeilen = baueBmdZeilen([
      t({ beleg_nr: 7 }),
      t({ id: 'x', beleg_nr: 8 }),
    ]);
    expect(zeilen[0].belegnr).toBe('2026/00007');
    expect(zeilen[1].belegnr).toBe('2026/00008');

    // Gleiche Buchung, jetzt an zweiter Stelle: gleiche Nummer.
    const andereReihenfolge = baueBmdZeilen([t({ id: 'x', beleg_nr: 8 }), t({ beleg_nr: 7 })]);
    expect(andereReihenfolge[1].belegnr).toBe('2026/00007');
  });

  it('kennzeichnet Altbestand ohne Nummer erkennbar', () => {
    expect(belegnummer({ id: 'abcdef12-3456', beleg_jahr: null, beleg_nr: null }))
      .toBe('X-abcdef12');
  });
});

describe('Kontozuordnung', () => {
  it('nimmt die Kontonummer der Kategorie', () => {
    expect(baueBmdZeilen([t()])[0].konto).toBe('7600');
  });

  it('fällt auf 4000/5000 zurück, wenn keine hinterlegt ist', () => {
    expect(baueBmdZeilen([t({ category: { name: 'Sonstiges', konto_nr: null } })])[0].konto).toBe('5000');
    expect(baueBmdZeilen([t({ type: 'income', category: null })])[0].konto).toBe('4000');
  });

  it('ignoriert eine leere Kontonummer', () => {
    expect(baueBmdZeilen([t({ category: { name: 'X', konto_nr: '   ' } })])[0].konto).toBe('5000');
  });
});

describe('Vorzeichen', () => {
  it('exportiert Ausgaben negativ und Einnahmen positiv', () => {
    const [aus] = baueBmdZeilen([t()]);
    const [ein] = baueBmdZeilen([t({ type: 'income' })]);
    expect(aus.netto).toBe('-100,00');
    expect(aus.brutto).toBe('-120,00');
    expect(ein.netto).toBe('100,00');
  });
});

describe('UVA-Kennzahl je Zeile', () => {
  it('unterscheidet die steuerfreien Ausgangsumsätze', () => {
    const kz = (k: BmdTransaction['ust_kennzeichen']) =>
      baueBmdZeilen([t({ type: 'income', vat_rate: 0, ust_kennzeichen: k })])[0].steuercode;
    expect(kz('ausfuhr')).toBe('011');
    expect(kz('ig_lieferung')).toBe('017');
    expect(kz('reverse_charge_ausgang')).toBe('021');
    expect(kz('kleinunternehmer')).toBe('016');
    expect(kz('unecht_befreit')).toBe('020');
  });

  it('setzt für Inlandsumsätze die Kennzahl des Steuersatzes', () => {
    expect(baueBmdZeilen([t({ type: 'income', vat_rate: 20 })])[0].steuercode).toBe('022');
    expect(baueBmdZeilen([t({ type: 'income', vat_rate: 10 })])[0].steuercode).toBe('029');
  });

  it('erkennt ig. Erwerb und Reverse Charge auf der Eingangsseite', () => {
    expect(baueBmdZeilen([t({ ust_kennzeichen: 'ig_erwerb' })])[0].steuercode).toBe('072');
    expect(baueBmdZeilen([t({ ust_kennzeichen: 'reverse_charge_eingang' })])[0].steuercode).toBe('057');
    expect(baueBmdZeilen([t()])[0].steuercode).toBe('060');
  });
});

describe('Zusatzangaben für die Kanzlei', () => {
  it('führt Anlass und Teilnehmer einer Bewirtung mit', () => {
    // Ohne diese Angaben kann die Kanzlei die 50%-Kürzung nach
    // § 20 Abs. 1 Z 3 EStG gar nicht vornehmen.
    const [z] = baueBmdZeilen([t({
      bewirtung_anlass: 'Projektbesprechung',
      bewirtung_teilnehmer: 'Fr. Huber, Hr. Maier',
    })]);
    expect(z.bewirtungAnlass).toBe('Projektbesprechung');
    expect(z.bewirtungTeilnehmer).toBe('Fr. Huber, Hr. Maier');
    expect(z.hinweis).toContain('50 %');
  });

  it('fasst die Reisedaten lesbar zusammen', () => {
    const [z] = baueBmdZeilen([t({
      reise_typ: 'km', reise_ziel: 'Linz', reise_zweck: 'Kundentermin',
      reise_von: '2026-03-07', reise_bis: '2026-03-07', reise_km: 180,
    })]);
    expect(z.reise).toBe('Kilometergeld | Linz | Kundentermin | 07.03.2026 | 180 km');
    expect(z.hinweis).toContain('Pauschale');
  });

  it('weist auf die Zusammenfassende Meldung hin', () => {
    const [z] = baueBmdZeilen([t({ type: 'income', vat_rate: 0, ust_kennzeichen: 'ig_lieferung' })]);
    expect(z.hinweis).toContain('Zusammenfassende Meldung');
  });

  it('markiert E-Auto-Buchungen', () => {
    expect(baueBmdZeilen([t({ is_eauto: true })])[0].hinweis).toContain('E-Auto');
  });
});

describe('CSV', () => {
  it('fasst Felder mit Semikolon oder Anführungszeichen ein', () => {
    expect(csvFeld('ohne')).toBe('ohne');
    expect(csvFeld('mit;Semikolon')).toBe('"mit;Semikolon"');
    expect(csvFeld('sagt "hallo"')).toBe('"sagt ""hallo"""');
  });

  it('verliert keine Spalte, wenn der Text ein Semikolon enthält', () => {
    // Vorher wurde das Semikolon durch ein Komma ersetzt – der Text
    // wurde also stillschweigend verfälscht.
    const csv = baueBmdCsv(baueBmdZeilen([t({ description: 'Miete; Betriebskosten' })]));
    const zeile = csv.split('\r\n')[1];
    expect(zeile).toContain('"Miete; Betriebskosten"');
    expect(csv.split('\r\n')[0].split(';')).toHaveLength(BMD_SPALTEN.length);
  });

  it('macht aus einem mehrzeiligen Buchungstext eine Zeile', () => {
    // Bankimporte liefern Verwendungszwecke mit Umbrüchen. Ohne
    // Behandlung zerriss das die CSV-Zeile.
    const csv = baueBmdCsv(baueBmdZeilen([t({ description: 'Rechnung\r\n12345\nDanke' })]));
    const zeilen = csv.trimEnd().split('\r\n');
    expect(zeilen).toHaveLength(2);
    expect(zeilen[1]).toContain('Rechnung 12345 Danke');
  });

  it('hat für jede Kopfspalte genau ein Feld', () => {
    const csv = baueBmdCsv(baueBmdZeilen([t()]));
    const [kopf, zeile] = csv.trimEnd().split('\r\n');
    expect(kopf.split(';')).toHaveLength(BMD_SPALTEN.length);
    expect(zeile.split(';')).toHaveLength(BMD_SPALTEN.length);
  });

  it('endet mit einem Zeilenumbruch', () => {
    expect(baueBmdCsv(baueBmdZeilen([t()]))).toMatch(/\r\n$/);
  });
});

describe('Zeichensatz', () => {
  it('kodiert Umlaute als ein Byte, nicht als UTF-8-Paar', () => {
    // Vorher: Header sagte iso-8859-1, geliefert wurde UTF-8.
    // "ä" kam im BMD als "Ã¤" an.
    const bytes = nachCp1252('äöüÄÖÜß');
    expect(Array.from(bytes)).toEqual([0xe4, 0xf6, 0xfc, 0xc4, 0xd6, 0xdc, 0xdf]);
  });

  it('bildet Euro-Zeichen und Gedankenstrich auf Windows-1252 ab', () => {
    expect(Array.from(nachCp1252('€'))).toEqual([0x80]);
    expect(Array.from(nachCp1252('–'))).toEqual([0x96]);
  });

  it('ersetzt Unabbildbares durch ein Fragezeichen statt zu verrutschen', () => {
    const bytes = nachCp1252('a中b');
    expect(Array.from(bytes)).toEqual([0x61, 0x3f, 0x62]);
  });

  it('lässt die Feldstruktur unangetastet', () => {
    const csv = baueBmdCsv(baueBmdZeilen([t({ description: 'Größe für Müller' })]));
    const bytes = nachCp1252(csv);
    const semikolons = Array.from(bytes).filter(b => b === 0x3b).length;
    expect(semikolons).toBe((BMD_SPALTEN.length - 1) * 2);
  });
});

describe('Kontrollsummen', () => {
  it('saldiert Einnahmen gegen Ausgaben', () => {
    const s = bmdSummen([
      t({ type: 'income', amount_net: 1000, vat_amount: 200, amount_gross: 1200 }),
      t({ amount_net: 100, vat_amount: 20, amount_gross: 120 }),
    ]);
    expect(s).toEqual({ anzahl: 2, netto: 900, steuer: 180, brutto: 1080 });
  });

  it('liefert für einen leeren Zeitraum Nullen', () => {
    expect(bmdSummen([])).toEqual({ anzahl: 0, netto: 0, steuer: 0, brutto: 0 });
  });
});
