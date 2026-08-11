import { describe, it, expect } from 'vitest';
import { baueUvaAufstellung, kennzeichenFuer, type Summenzeile, type KzZeile } from './uva-kennzahlen';

const z = (
  typ: 'income' | 'expense',
  ust_kennzeichen: Summenzeile['ust_kennzeichen'],
  vat_rate: number,
  bemessungsgrundlage: number,
  steuer: number,
): Summenzeile => ({ typ, ust_kennzeichen, vat_rate, bemessungsgrundlage, steuer });

const kz = (zeilen: KzZeile[], k: string) => zeilen.find(x => x.kz === k);

describe('baueUvaAufstellung – Inlandsumsätze', () => {
  it('ordnet die Steuersätze den richtigen Kennzahlen zu', () => {
    const a = baueUvaAufstellung([
      z('income', 'normal', 20, 1000, 200),
      z('income', 'normal', 10, 500, 50),
      z('income', 'normal', 13, 200, 26),
    ]);
    expect(kz(a.umsatz, '022')).toMatchObject({ bemessungsgrundlage: 1000, steuer: 200 });
    expect(kz(a.umsatz, '029')).toMatchObject({ bemessungsgrundlage: 500,  steuer: 50 });
    expect(kz(a.umsatz, '006')).toMatchObject({ bemessungsgrundlage: 200,  steuer: 26 });
    expect(a.gesamtUst).toBe(276);
    expect(a.gesamtBemessungsgrundlage).toBe(1700);
  });

  it('summiert mehrere Buchungen derselben Kennzahl', () => {
    const a = baueUvaAufstellung([
      z('income', 'normal', 20, 100, 20),
      z('income', 'normal', 20, 300, 60),
    ]);
    expect(kz(a.umsatz, '022')).toMatchObject({ bemessungsgrundlage: 400, steuer: 80 });
  });
});

describe('baueUvaAufstellung – steuerfreie Ausgangsumsätze', () => {
  it('trennt Ausfuhr, ig. Lieferung, Reverse Charge, Kleinunternehmer und unecht befreit', () => {
    // Vorher landeten alle fünf gemeinsam in Kz 011 – der Kennzahl
    // für Ausfuhrlieferungen.
    const a = baueUvaAufstellung([
      z('income', 'ausfuhr',                0, 1000, 0),
      z('income', 'ig_lieferung',           0, 2000, 0),
      z('income', 'reverse_charge_ausgang', 0, 3000, 0),
      z('income', 'kleinunternehmer',       0, 4000, 0),
      z('income', 'unecht_befreit',         0, 5000, 0),
    ]);
    expect(kz(a.umsatz, '011')?.bemessungsgrundlage).toBe(1000);
    expect(kz(a.umsatz, '017')?.bemessungsgrundlage).toBe(2000);
    expect(kz(a.umsatz, '021')?.bemessungsgrundlage).toBe(3000);
    expect(kz(a.umsatz, '016')?.bemessungsgrundlage).toBe(4000);
    expect(kz(a.umsatz, '020')?.bemessungsgrundlage).toBe(5000);
    expect(a.gesamtUst).toBe(0);
  });

  it('meldet für diese Umsätze keine Steuer, auch wenn eine gebucht wäre', () => {
    const a = baueUvaAufstellung([z('income', 'reverse_charge_ausgang', 0, 3000, 600)]);
    expect(kz(a.umsatz, '021')?.steuer).toBe(0);
    expect(a.gesamtUst).toBe(0);
  });
});

describe('baueUvaAufstellung – innergemeinschaftlicher Erwerb', () => {
  it('erzeugt Erwerbsteuer UND den korrespondierenden Vorsteuerabzug', () => {
    // Wareneinkauf aus Deutschland über 5.000. Es entsteht Erwerbsteuer
    // von 1.000 (Kz 072), die zugleich als Vorsteuer abziehbar ist
    // (Kz 065). Vorher fehlte beides vollständig.
    const a = baueUvaAufstellung([z('expense', 'ig_erwerb', 20, 5000, 1000)]);
    expect(kz(a.erwerb, '070')?.bemessungsgrundlage).toBe(5000);
    expect(kz(a.erwerb, '072')).toMatchObject({ bemessungsgrundlage: 5000, steuer: 1000 });
    expect(kz(a.vorsteuer, '065')?.steuer).toBe(1000);
  });

  it('lässt die Zahllast dabei unverändert', () => {
    const nurInland = baueUvaAufstellung([z('income', 'normal', 20, 1000, 200)]);
    const mitErwerb = baueUvaAufstellung([
      z('income', 'normal', 20, 1000, 200),
      z('expense', 'ig_erwerb', 20, 5000, 1000),
    ]);
    expect(nurInland.zahllast).toBe(200);
    expect(mitErwerb.zahllast).toBe(200);
  });

  it('rechnet die Erwerbsteuer selbst aus, wenn keine gebucht wurde', () => {
    const a = baueUvaAufstellung([z('expense', 'ig_erwerb', 20, 5000, 0)]);
    expect(kz(a.erwerb, '072')?.steuer).toBe(1000);
    expect(kz(a.vorsteuer, '065')?.steuer).toBe(1000);
  });

  it('nutzt bei 10 % die Kennzahl 073', () => {
    const a = baueUvaAufstellung([z('expense', 'ig_erwerb', 10, 1000, 100)]);
    expect(kz(a.erwerb, '073')?.steuer).toBe(100);
    expect(kz(a.erwerb, '072')).toBeUndefined();
  });
});

describe('baueUvaAufstellung – Reverse Charge auf der Eingangsseite', () => {
  it('setzt Steuerschuld nach § 19 und den Vorsteuerabzug', () => {
    const a = baueUvaAufstellung([z('expense', 'reverse_charge_eingang', 20, 2000, 400)]);
    expect(kz(a.erwerb, '057')).toMatchObject({ bemessungsgrundlage: 2000, steuer: 400 });
    expect(kz(a.vorsteuer, '066')?.steuer).toBe(400);
    expect(a.zahllast).toBe(0);
  });
});

describe('baueUvaAufstellung – Vorsteuer und Zahllast', () => {
  it('summiert die Inlandsvorsteuer unter Kz 060', () => {
    const a = baueUvaAufstellung([
      z('expense', 'normal', 20, 500, 100),
      z('expense', 'normal', 10, 300, 30),
    ]);
    expect(kz(a.vorsteuer, '060')).toMatchObject({ bemessungsgrundlage: 800, steuer: 130 });
    expect(a.gesamtVorsteuer).toBe(130);
  });

  it('ergibt bei Vorsteuerüberhang eine Gutschrift', () => {
    const a = baueUvaAufstellung([
      z('income', 'normal', 20, 100, 20),
      z('expense', 'normal', 20, 900, 180),
    ]);
    expect(a.zahllast).toBe(-160);
  });

  it('liefert bei leerer Eingabe überall Null', () => {
    const a = baueUvaAufstellung([]);
    expect(a.umsatz).toEqual([]);
    expect(a.erwerb).toEqual([]);
    expect(a.vorsteuer).toEqual([]);
    expect(a.zahllast).toBe(0);
  });

  it('behandelt ein fehlendes Kennzeichen wie einen Inlandsumsatz', () => {
    // Altbestand ohne gesetztes Kennzeichen darf nicht verschwinden.
    const a = baueUvaAufstellung([
      { typ: 'income', vat_rate: 20, bemessungsgrundlage: 1000, steuer: 200 } as Summenzeile,
    ]);
    expect(kz(a.umsatz, '022')?.steuer).toBe(200);
  });
});

describe('kennzeichenFuer', () => {
  it('bietet je Buchungsart nur passende Kennzeichen an', () => {
    const einnahmen = kennzeichenFuer('income').map(k => k.wert);
    const ausgaben  = kennzeichenFuer('expense').map(k => k.wert);
    expect(einnahmen).toContain('ig_lieferung');
    expect(einnahmen).not.toContain('ig_erwerb');
    expect(ausgaben).toContain('ig_erwerb');
    expect(ausgaben).not.toContain('ig_lieferung');
  });

  it('enthält für beide Arten den Normalfall', () => {
    expect(kennzeichenFuer('income')[0].wert).toBe('normal');
    expect(kennzeichenFuer('expense')[0].wert).toBe('normal');
  });
});
