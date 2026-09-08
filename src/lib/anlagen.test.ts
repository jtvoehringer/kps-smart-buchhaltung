import { describe, it, expect } from 'vitest';
import { afaPlan, afaImJahr, buchwertAm, buchwertEndeJahr, anlagenspiegel, afaSatzProzent, type Anlage } from './anlagen';

const basis = (o: Partial<Anlage> = {}): Anlage => ({
  id: 'a1', name: 'Laptop', asset_group: 'BGA', konto_nr: '0660',
  acquired_on: '2026-03-15', cost_net: 3000, useful_life_years: 3, method: 'linear',
  degressive_rate: null, residual_value: 0, disposed_on: null, disposal_proceeds: null,
  ...o,
});

describe('afaPlan linear', () => {
  it('verteilt gleichmäßig über die Nutzungsdauer (Zugang im 1. Halbjahr)', () => {
    const p = afaPlan(basis());
    expect(p.map(z => [z.jahr, z.afa, z.buchwertEnde])).toEqual([
      [2026, 1000, 2000], [2027, 1000, 1000], [2028, 1000, 0],
    ]);
    expect(p.every(z => !z.halb)).toBe(true);
  });

  it('Halbjahresregel: Zugang im 2. Halbjahr → halbe AfA zuerst, Rest im 4. Jahr', () => {
    const p = afaPlan(basis({ acquired_on: '2026-09-01' }));
    expect(p.map(z => [z.jahr, z.afa, z.halb])).toEqual([
      [2026, 500, true], [2027, 1000, false], [2028, 1000, false], [2029, 500, false],
    ]);
    expect(p[3].buchwertEnde).toBe(0);
  });

  it('berücksichtigt einen Restwert', () => {
    const p = afaPlan(basis({ cost_net: 3100, residual_value: 100 }));
    expect(p[2].buchwertEnde).toBe(100);
    expect(p.reduce((s, z) => s + z.afa, 0)).toBe(3000);
  });

  it('Abgang im 1. Halbjahr: halbe AfA, danach Restbuchwert', () => {
    const p = afaPlan(basis({ disposed_on: '2027-04-10', disposal_proceeds: 1500 }));
    expect(p.map(z => [z.jahr, z.afa, z.buchwertEnde, z.abgang])).toEqual([
      [2026, 1000, 2000, false], [2027, 500, 1500, true],
    ]);
  });
});

describe('GWG und degressiv', () => {
  it('GWG: Sofortabschreibung im Zugangsjahr, auch im 2. Halbjahr', () => {
    const p = afaPlan(basis({ method: 'gwg', cost_net: 800, acquired_on: '2026-11-02', useful_life_years: 1 }));
    expect(p).toHaveLength(1);
    expect(p[0].afa).toBe(800);
    expect(afaSatzProzent(basis({ method: 'gwg' }))).toBe(100);
  });

  it('degressiv 30 % vom Restbuchwert, Wechsel auf linear zum Schluss', () => {
    const p = afaPlan(basis({ method: 'degressiv', degressive_rate: 30, cost_net: 10000, useful_life_years: 5, acquired_on: '2026-02-01' }));
    expect(p[0].afa).toBe(3000);           // 30 % von 10.000
    expect(p[1].afa).toBe(2100);           // 30 % von 7.000
    expect(p[p.length - 1].buchwertEnde).toBe(0);
    expect(p).toHaveLength(5);             // innerhalb der Nutzungsdauer fertig
    expect(p.reduce((s, z) => s + z.afa, 0)).toBe(10000);
  });
});

describe('Buchwerte und Anlagenspiegel', () => {
  it('buchwertAm bleibt innerhalb des Jahres konstant, buchwertEndeJahr nach AfA', () => {
    const a = basis();
    expect(buchwertAm(a, '2026-12-31')).toBe(3000);
    expect(buchwertAm(a, '2027-06-30')).toBe(2000);
    expect(buchwertEndeJahr(a, 2026)).toBe(2000);
    expect(buchwertEndeJahr(a, 2029)).toBe(0);
    expect(buchwertAm(a, '2025-12-31')).toBe(0);       // vor Anschaffung
    expect(afaImJahr(a, 2030)).toBe(0);
  });

  it('anlagenspiegel summiert Zugänge, AfA, kumulierte AfA und Buchwert', () => {
    const a = [
      basis(),                                                                        // 3.000, 3 J.
      basis({ id: 'a2', name: 'Tisch', acquired_on: '2025-07-20', cost_net: 1200, useful_life_years: 4 }),  // Halbjahr 2025
      basis({ id: 'a3', name: 'Alt', acquired_on: '2024-01-10', cost_net: 500, useful_life_years: 2, disposed_on: '2026-02-01', disposal_proceeds: 50 }),
    ];
    const s = anlagenspiegel(a, 2026);
    expect(s.anzahlAktiv).toBe(2);
    expect(s.zugaenge).toBe(3000);
    expect(s.abgaenge).toBe(500);
    expect(s.veraeusserungserloese).toBe(50);
    expect(s.anschaffungskosten).toBe(4200);
    expect(s.afaJahr).toBe(1000 + 300);                 // Laptop 1.000 + Tisch 300 (Alt: 2024 250, 2025 250 → 2026 nichts mehr)
    expect(s.buchwertEnde).toBe(2000 + (1200 - 150 - 300));
    expect(s.kumulierteAfa).toBe(4200 - s.buchwertEnde);
  });
});
