import { describe, it, expect } from 'vitest';
import { calcVat, calculateUVA, zahlungszielTage, zahlungskondition, type UVATransaction } from './utils';

describe('calcVat', () => {
  it('rechnet die Normalfälle', () => {
    expect(calcVat(100, 20)).toBe(20);
    expect(calcVat(100, 10)).toBe(10);
    expect(calcVat(100, 13)).toBe(13);
    expect(calcVat(100, 0)).toBe(0);
  });

  it('rundet Halb-Cent-Fälle kaufmännisch auf', () => {
    // Diese vier lieferten vorher jeweils einen Cent zu wenig
    expect(calcVat(24.45, 10)).toBe(2.45);
    expect(calcVat(10.05, 10)).toBe(1.01);
    expect(calcVat(1.45, 10)).toBe(0.15);
    expect(calcVat(18.50, 13)).toBe(2.41);
  });

  it('stimmt mit der Brutto-minus-Netto-Rechnung der Buchungsmaske überein', () => {
    // Vorher wich der Rechnungsweg vom Buchungsweg ab: derselbe
    // Sachverhalt erzeugte je nach Erfassung unterschiedliche USt.
    for (let cent = 1; cent <= 200000; cent += 7) {
      const netto = cent / 100;
      for (const satz of [10, 13, 20]) {
        const ust = calcVat(netto, satz);
        const erwartet = Math.round((Math.round(netto * 100) * satz) / 100) / 100;
        expect(ust).toBe(erwartet);
      }
    }
  });

  it('liefert nie mehr als zwei Nachkommastellen', () => {
    // Nicht ust*100 gegen Math.round(ust*100) prüfen – die Multiplikation
    // erzeugt selbst ein Float-Artefakt (0,07*100 = 7.000000000000001).
    for (let cent = 1; cent <= 5000; cent++) {
      for (const satz of [10, 13, 20]) {
        const ust = calcVat(cent / 100, satz);
        expect(Math.abs(ust * 100 - Math.round(ust * 100))).toBeLessThan(1e-9);
      }
    }
  });

  it('behandelt negative Beträge symmetrisch (Gutschriften)', () => {
    expect(calcVat(-24.45, 10)).toBe(-2.45);
    expect(calcVat(-100, 20)).toBe(-20);
  });

  it('verträgt ungültige Eingaben', () => {
    expect(calcVat(NaN, 20)).toBe(0);
    expect(calcVat(100, NaN)).toBe(0);
    expect(calcVat(0, 20)).toBe(0);
  });
});

describe('calculateUVA', () => {
  const tx = (
    type: 'income' | 'expense', amount_net: number, vat_rate: number, vat_amount: number,
  ): UVATransaction => ({ type, amount_net, vat_rate, vat_amount });

  it('liefert bei leerer Liste überall 0', () => {
    const r = calculateUVA([]);
    expect(r.totalUSt).toBe(0);
    expect(r.totalVSt).toBe(0);
    expect(r.zahllast).toBe(0);
  });

  it('trennt Einnahmen und Ausgaben nach Steuersatz', () => {
    const r = calculateUVA([
      tx('income', 1000, 20, 200),
      tx('income',  500, 10,  50),
      tx('expense', 300, 20,  60),
    ]);
    expect(r.ustByRate[20]).toEqual({ bemessungsgrundlage: 1000, steuer: 200 });
    expect(r.ustByRate[10]).toEqual({ bemessungsgrundlage: 500,  steuer: 50 });
    expect(r.vstByRate[20]).toEqual({ bemessungsgrundlage: 300,  steuer: 60 });
    expect(r.totalUSt).toBe(250);
    expect(r.totalVSt).toBe(60);
    expect(r.zahllast).toBe(190);
  });

  it('ergibt bei Vorsteuerüberhang eine negative Zahllast (Gutschrift)', () => {
    const r = calculateUVA([
      tx('income',  100, 20,  20),
      tx('expense', 900, 20, 180),
    ]);
    expect(r.zahllast).toBe(-160);
  });

  it('ordnet einen unbekannten Steuersatz dem 0-%-Topf zu', () => {
    // 19 % kommt bei ausländischen Belegen vor. Der Betrag darf nicht
    // verschwinden – er landet sichtbar unter 0 %.
    const r = calculateUVA([tx('income', 100, 19, 19)]);
    expect(r.ustByRate[0].bemessungsgrundlage).toBe(100);
    expect(r.ustByRate[0].steuer).toBe(19);
    expect(r.totalUSt).toBe(19);
  });

  it('summiert mehrere Buchungen desselben Satzes', () => {
    const r = calculateUVA([
      tx('income', 100, 20, 20),
      tx('income', 200, 20, 40),
      tx('income', 300, 20, 60),
    ]);
    expect(r.ustByRate[20].bemessungsgrundlage).toBe(600);
    expect(r.ustByRate[20].steuer).toBe(120);
  });
});

describe('zahlungszielTage / zahlungskondition', () => {
  it('rechnet die Tagesdifferenz', () => {
    expect(zahlungszielTage('2026-08-11', '2026-08-25')).toBe(14);
    expect(zahlungszielTage('2026-08-11', '2026-09-10')).toBe(30);
  });

  it('erkennt "zahlbar bei Erhalt"', () => {
    // Genau der Fall aus der Praxis: Kunde mit Zahlungsziel 0. Auf der
    // Rechnung stand trotzdem "Innerhalb von 14 Tagen netto", weil der
    // Text aus den globalen Einstellungen kam statt aus der Rechnung.
    expect(zahlungszielTage('2026-08-11', '2026-08-11')).toBe(0);
    expect(zahlungskondition('2026-08-11', '2026-08-11')).toBe('Zahlbar bei Erhalt');
  });

  it('formuliert das Zahlungsziel als Satz', () => {
    expect(zahlungskondition('2026-08-11', '2026-08-25')).toBe('Innerhalb von 14 Tagen netto');
    expect(zahlungskondition('2026-08-11', '2026-08-12')).toBe('Innerhalb von 1 Tagen netto');
  });

  it('rechnet über Monats- und Jahresgrenzen', () => {
    expect(zahlungszielTage('2026-12-20', '2027-01-03')).toBe(14);
    expect(zahlungszielTage('2026-02-20', '2026-03-06')).toBe(14);
  });

  it('bleibt bei Sommerzeitwechseln exakt', () => {
    // Ohne UTC-Verankerung wäre hier 13 oder 15 herausgekommen
    expect(zahlungszielTage('2026-03-25', '2026-04-08')).toBe(14);
    expect(zahlungszielTage('2026-10-20', '2026-11-03')).toBe(14);
  });

  it('verträgt ungültige Daten', () => {
    expect(zahlungszielTage('', '')).toBe(0);
    expect(zahlungszielTage('quatsch', '2026-08-25')).toBe(0);
  });
});
