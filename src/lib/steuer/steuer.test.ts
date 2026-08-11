import { describe, it, expect } from 'vitest';
import {
  berechneKilometergeld,
  berechneDiaeten,
  berechneNaechtigung,
  vorgeschlagenerSteuersatz,
  berechneEAutoVorsteuer,
  reiseSaetzeFuer,
  saetzeFuer,
  aufCent,
} from './index';

// ============================================================
// Kilometergeld
// ============================================================
describe('berechneKilometergeld', () => {
  it('rechnet mit dem amtlichen Satz von 0,50 €/km', () => {
    expect(berechneKilometergeld(100)).toBe(50);
    expect(berechneKilometergeld(1)).toBe(0.5);
    expect(berechneKilometergeld(247)).toBe(123.5);
  });

  it('rundet centgenau', () => {
    expect(berechneKilometergeld(33.3)).toBe(16.65);
    expect(berechneKilometergeld(0.5)).toBe(0.25);
  });

  it('liefert 0 bei ungültigen Eingaben', () => {
    expect(berechneKilometergeld(0)).toBe(0);
    expect(berechneKilometergeld(-10)).toBe(0);
    expect(berechneKilometergeld(NaN)).toBe(0);
  });
});

// ============================================================
// Diäten – hier steckt die eigentliche Fachlogik
// ============================================================
describe('berechneDiaeten', () => {
  it('gewährt unter und bei genau 3 Stunden nichts (§ 26 Z 4: MEHR als 3)', () => {
    expect(berechneDiaeten(0)).toBe(0);
    expect(berechneDiaeten(2.9)).toBe(0);
    expect(berechneDiaeten(3)).toBe(0);
  });

  it('rechnet je angefangener Stunde ein Zwölftel', () => {
    expect(berechneDiaeten(3.1)).toBe(10);    // 4 angefangene Stunden
    expect(berechneDiaeten(4)).toBe(10);
    expect(berechneDiaeten(4.5)).toBe(12.5);  // 5 angefangene
    expect(berechneDiaeten(10)).toBe(25);
  });

  it('gibt bei genau 11 Stunden 27,50 – nicht den vollen Satz', () => {
    // Der volle Tagessatz steht erst ab der 12. angefangenen Stunde zu.
    expect(berechneDiaeten(11)).toBe(27.5);
    expect(berechneDiaeten(11.5)).toBe(30);
    expect(berechneDiaeten(12)).toBe(30);
  });

  it('deckelt einen Tag bei 30,00', () => {
    expect(berechneDiaeten(13)).toBe(30);
    expect(berechneDiaeten(23.9)).toBe(30);
    expect(berechneDiaeten(24)).toBe(30);
  });

  it('rechnet Mehrtagesreisen korrekt hoch', () => {
    // Mo 08:00 bis Mi 18:00 = 58 Stunden
    // 2 volle Tage (60,00) + 10 angefangene Stunden (25,00)
    expect(berechneDiaeten(58)).toBe(85);
    expect(berechneDiaeten(48)).toBe(60);
    expect(berechneDiaeten(72)).toBe(90);
    expect(berechneDiaeten(30)).toBe(45);   // 1 Tag + 6 Std.
  });

  it('lässt einen Rest bis 3 Stunden unberücksichtigt', () => {
    expect(berechneDiaeten(26)).toBe(30);   // 1 Tag + 2 Std. -> kein Zuschlag
    expect(berechneDiaeten(27)).toBe(30);   // 1 Tag + genau 3 Std.
    expect(berechneDiaeten(27.5)).toBe(40); // 1 Tag + 4 angefangene Std.
  });

  it('liefert 0 bei ungültigen Eingaben', () => {
    expect(berechneDiaeten(NaN)).toBe(0);
    expect(berechneDiaeten(-5)).toBe(0);
  });
});

// ============================================================
// Nächtigung
// ============================================================
describe('berechneNaechtigung', () => {
  it('rechnet 17,00 je Nacht', () => {
    expect(berechneNaechtigung(1)).toBe(17);
    expect(berechneNaechtigung(3)).toBe(51);
    expect(berechneNaechtigung(0)).toBe(0);
  });
});

// ============================================================
// Steuersatz-Vorschlag je Reisekostenart
// ============================================================
describe('vorgeschlagenerSteuersatz', () => {
  it('erzwingt 0 % bei Pauschalen', () => {
    expect(vorgeschlagenerSteuersatz('kilometergeld')).toBe(0);
    expect(vorgeschlagenerSteuersatz('diaeten')).toBe(0);
  });

  it('schlägt bei Nächtigung und Fahrtkosten 10 % vor', () => {
    // Vorher wurde der 0-%-Satz der Kategorie "Reisekosten" übernommen,
    // wodurch bei einer Hotelrechnung die Vorsteuer verlorenging.
    expect(vorgeschlagenerSteuersatz('naechtigung')).toBe(10);
    expect(vorgeschlagenerSteuersatz('fahrtkosten')).toBe(10);
  });

  it('schlägt bei Konsumation 20 % vor', () => {
    expect(vorgeschlagenerSteuersatz('konsumation')).toBe(20);
  });
});

// ============================================================
// E-Auto-Vorsteuer
// ============================================================
describe('berechneEAutoVorsteuer', () => {
  it('gewährt unterhalb der Grenze die volle Vorsteuer', () => {
    const r = berechneEAutoVorsteuer(36000);
    expect(r.stufe).toBe('voll');
    expect(r.vstGesamt).toBe(6000);
    expect(r.vstAbzugsfaehig).toBe(6000);
    expect(r.vstNichtAbzugsfaehig).toBe(0);
    expect(r.aktivierungsNetto).toBe(30000);
  });

  it('kürzt zwischen 40.000 und 80.000 aliquot', () => {
    // 46.800 brutto = 39.000 netto + 7.800 USt.
    // Die alte Umsetzung prüfte 39.000 gegen 40.000 und gewährte
    // die vollen 7.800 – 1.133,33 zu viel.
    const r = berechneEAutoVorsteuer(46800);
    expect(r.stufe).toBe('aliquot');
    expect(r.vstGesamt).toBe(7800);
    expect(r.vstAbzugsfaehig).toBe(6666.67);
    expect(r.vstNichtAbzugsfaehig).toBe(1133.33);
    expect(r.aktivierungsNetto).toBe(40133.33);
  });

  it('gewährt über 80.000 gar keinen Abzug', () => {
    const r = berechneEAutoVorsteuer(120000);
    expect(r.stufe).toBe('kein_abzug');
    expect(r.vstAbzugsfaehig).toBe(0);
    expect(r.vstNichtAbzugsfaehig).toBe(20000);
    expect(r.aktivierungsNetto).toBe(120000);
  });

  it('behandelt die Grenzwerte selbst noch begünstigt', () => {
    expect(berechneEAutoVorsteuer(40000).stufe).toBe('voll');
    expect(berechneEAutoVorsteuer(40000.01).stufe).toBe('aliquot');
    expect(berechneEAutoVorsteuer(80000).stufe).toBe('aliquot');
    expect(berechneEAutoVorsteuer(80000.01).stufe).toBe('kein_abzug');
  });

  it('hält aktivierungsNetto + abzugsfähige VSt immer auf dem Bruttobetrag', () => {
    // Das ist die Invariante, an der die generierte Spalte
    // amount_gross hängt – sie muss dem bezahlten Betrag entsprechen.
    for (const brutto of [12345.67, 39999.99, 40000, 55123.45, 79999.99, 80000, 95000]) {
      const r = berechneEAutoVorsteuer(brutto);
      expect(aufCent(r.aktivierungsNetto + r.vstAbzugsfaehig)).toBe(aufCent(brutto));
    }
  });

  it('liefert bei 0 oder ungültig eine leere Berechnung', () => {
    const r = berechneEAutoVorsteuer(0);
    expect(r.vstGesamt).toBe(0);
    expect(r.vstAbzugsfaehig).toBe(0);
    expect(r.aktivierungsNetto).toBe(0);
  });
});

// ============================================================
// Datierte Sätze
// ============================================================
describe('saetzeFuer', () => {
  const tabelle = [
    { gueltigAb: '2025-01-01', wert: 'alt' },
    { gueltigAb: '2027-01-01', wert: 'neu' },
  ];

  it('wählt den zum Stichtag gültigen Eintrag', () => {
    expect(saetzeFuer(tabelle, '2026-06-15').wert).toBe('alt');
    expect(saetzeFuer(tabelle, '2027-01-01').wert).toBe('neu');
    expect(saetzeFuer(tabelle, '2028-03-01').wert).toBe('neu');
  });

  it('fällt bei einem Datum vor dem ersten Eintrag auf den ältesten zurück', () => {
    expect(saetzeFuer(tabelle, '2020-01-01').wert).toBe('alt');
  });

  it('verträgt vollständige Zeitstempel und ungültige Eingaben', () => {
    expect(saetzeFuer(tabelle, '2027-05-01T10:00:00Z').wert).toBe('neu');
    expect(saetzeFuer(tabelle, '').gueltigAb).toBeDefined();
    expect(saetzeFuer(tabelle, null).gueltigAb).toBeDefined();
  });

  it('rechnet eine Buchung aus dem Vorjahr weiterhin mit dem alten Satz', () => {
    // Der eigentliche Zweck der Datierung: eine bereits gemeldete
    // Periode darf sich durch eine Satzänderung nicht verändern.
    const satz2026 = reiseSaetzeFuer('2026-03-15');
    expect(berechneKilometergeld(100, '2026-03-15')).toBe(100 * satz2026.kmSatz);
  });
});

// ============================================================
// Rundung
// ============================================================
describe('aufCent', () => {
  it('rundet kaufmännisch', () => {
    expect(aufCent(2.445)).toBe(2.45);
    expect(aufCent(1.005)).toBe(1.01);
    expect(aufCent(0.145)).toBe(0.15);
    expect(aufCent(-2.445)).toBe(-2.45);
  });

  it('lässt bereits centgenaue Werte unverändert', () => {
    expect(aufCent(100)).toBe(100);
    expect(aufCent(0.01)).toBe(0.01);
    expect(aufCent(0)).toBe(0);
  });
});
