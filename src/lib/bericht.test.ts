import { describe, it, expect } from 'vitest';
import { kontoStaende, offenePosten, nachKategorie, jahresSumme, anlagenZugaenge, ustOffen, afaGebuchtImJahr, ohneAfaBuchungen } from './bericht';

describe('kontoStaende', () => {
  const konto = { id: 'k1', name: 'Bank', type: 'kontokorrent', iban: null, opening_balance: 1000, opening_date: '2026-01-31', is_active: true };

  it('rechnet Eröffnungssaldo + Einnahmen − Ausgaben ± Umbuchungen, nur nach dem Eröffnungsdatum', () => {
    const [s] = kontoStaende([konto], [
      { account_id: 'k1', type: 'income',  amount_gross: 500,  booking_date: '2026-02-01', is_reconciled: true },
      { account_id: 'k1', type: 'expense', amount_gross: 120.5, booking_date: '2026-02-03', is_reconciled: false },
      { account_id: 'k1', type: 'income',  amount_gross: 9999, booking_date: '2026-01-15', is_reconciled: true }, // vor Eröffnung → im Saldo enthalten
      { account_id: 'k2', type: 'income',  amount_gross: 77,   booking_date: '2026-02-03', is_reconciled: true }, // anderes Konto
    ], [
      { from_account_id: 'k1', to_account_id: 'k2', amount: 200, transfer_date: '2026-02-10', is_reconciled_from: false, is_reconciled_to: true },
      { from_account_id: 'k2', to_account_id: 'k1', amount: 50,  transfer_date: '2026-02-12', is_reconciled_from: true,  is_reconciled_to: true },
    ]);
    expect(s.saldo).toBe(1000 + 500 - 120.5 - 200 + 50);
    expect(s.bewegungen).toBe(4);
    expect(s.nichtAbgestimmt).toBe(2);
    expect(s.letzteBewegung).toBe('2026-02-12');
  });
});

describe('offenePosten', () => {
  it('summiert und erkennt Überfälliges', () => {
    const r = offenePosten([
      { id: 'a', label: 'A', nummer: '1', faelligAm: '2026-09-01', betrag: 100 },
      { id: 'b', label: 'B', nummer: '2', faelligAm: '2026-09-20', betrag: 50.25 },
    ], '2026-09-08');
    expect(r.anzahl).toBe(2);
    expect(r.summe).toBe(150.25);
    expect(r.ueberfaelligAnzahl).toBe(1);
    expect(r.ueberfaelligSumme).toBe(100);
    expect(r.posten[0].tageUeberfaellig).toBe(7);
  });
});

describe('Erfolgsrechnung', () => {
  const b = [
    { type: 'income' as const,  amount_net: 1000, amount_gross: 1200, booking_date: '2026-03-01', is_private: false, kategorie: 'Erlöse 20%', konto_nr: '4000' },
    { type: 'income' as const,  amount_net: 300,  amount_gross: 360,  booking_date: '2026-04-01', is_private: false, kategorie: 'Erlöse 20%', konto_nr: '4000' },
    { type: 'expense' as const, amount_net: 200,  amount_gross: 240,  booking_date: '2026-04-02', is_private: false, kategorie: 'Büro', konto_nr: '7200' },
    { type: 'expense' as const, amount_net: 999,  amount_gross: 999,  booking_date: '2026-04-02', is_private: true,  kategorie: 'Büro', konto_nr: '7200' },
    { type: 'expense' as const, amount_net: 2500, amount_gross: 3000, booking_date: '2025-11-02', is_private: false, kategorie: 'BGA', konto_nr: '0660' },
    { type: 'expense' as const, amount_net: 1200, amount_gross: 1440, booking_date: '2026-02-02', is_private: false, kategorie: 'BGA', konto_nr: '0660' },
  ];

  it('nachKategorie lässt Privates und andere Jahre weg', () => {
    const e = nachKategorie(b, 2026, 'income');
    expect(e).toEqual([{ kategorie: 'Erlöse 20%', konto_nr: '4000', netto: 1300, brutto: 1560, anzahl: 2 }]);
    const a = nachKategorie(b, 2026, 'expense');
    expect(a.map(x => [x.kategorie, x.netto])).toEqual([['BGA', 1200], ['Büro', 200]]);
  });

  it('anlagenZugaenge nimmt nur Kontenklasse 0, kumuliert über Jahre', () => {
    const z = anlagenZugaenge(b);
    expect(z.gesamt).toBe(3700);
    expect(z.jeJahr).toEqual([[2026, 1200], [2025, 2500]]);
  });

  it('jahresSumme und ustOffen', () => {
    const ms = [
      { jahr: 2026, monat: 1, einnahmen: 100, ausgaben: 40, ust: 20, vst: 8 },
      { jahr: 2026, monat: 2, einnahmen: 200, ausgaben: 60, ust: 40, vst: 12 },
      { jahr: 2026, monat: 3, einnahmen: 300, ausgaben: 80, ust: 60, vst: 16 },
      { jahr: 2025, monat: 12, einnahmen: 999, ausgaben: 1, ust: 0, vst: 0 },
    ];
    expect(jahresSumme(ms, 2026)).toEqual({ einnahmen: 600, ausgaben: 180, ueberschuss: 420, ust: 120, vst: 36 });
    expect(jahresSumme(ms, 2026, 2).einnahmen).toBe(300);
    // Jänner monatlich eingereicht → nur Feb+März offen
    expect(ustOffen(ms, [{ period_year: 2026, period_month: 1, status: 'submitted' }], 2026, 'monthly'))
      .toEqual({ betrag: 72, monate: [2, 3] });
    // Q1 quartalsweise eingereicht → nichts offen
    expect(ustOffen(ms, [{ period_year: 2026, period_month: 3, status: 'submitted' }], 2026, 'quarterly').monate).toEqual([]);
  });
});

describe('gebuchte AfA (Welle 8)', () => {
  it('afaGebuchtImJahr summiert nur das Jahr bis zum Monat', () => {
    const b = [
      { amount_net: 1000, booking_date: '2026-12-31' },
      { amount_net: 300, booking_date: '2026-12-31' },
      { amount_net: 500, booking_date: '2025-12-31' },
    ];
    expect(afaGebuchtImJahr(b, 2026)).toBe(1300);
    expect(afaGebuchtImJahr(b, 2026, 11)).toBe(0);
    expect(afaGebuchtImJahr(b, 2025)).toBe(500);
  });

  it('ohneAfaBuchungen zieht die AfA aus den Ausgaben und korrigiert den Überschuss', () => {
    const s = { einnahmen: 10000, ausgaben: 4300, ueberschuss: 5700, ust: 0, vst: 0 };
    expect(ohneAfaBuchungen(s, 1300)).toEqual({ einnahmen: 10000, ausgaben: 3000, ueberschuss: 7000, ust: 0, vst: 0 });
    expect(ohneAfaBuchungen(s, 0)).toBe(s);
  });
});
