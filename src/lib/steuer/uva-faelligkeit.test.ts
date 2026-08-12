import { describe, it, expect } from 'vitest';
import { offeneUvaPerioden } from './uva-faelligkeit';

const KEINE: { period_year: number; period_month: number; status: string }[] = [];

describe('offeneUvaPerioden – monatlich', () => {
  it('Vormonat offen, Fälligkeit 15. des übernächsten Monats', () => {
    const r = offeneUvaPerioden(new Date(2026, 7, 12), 'monthly', KEINE, 1); // 12.08.2026
    expect(r).toHaveLength(1);
    expect(r[0].label).toBe('Juli 2026');
    expect(r[0].periodMonth).toBe(7);
    expect(r[0].faelligAm.getMonth()).toBe(8); // September
    expect(r[0].faelligAm.getDate()).toBe(15);
    expect(r[0].tageBisFaellig).toBe(34);
  });

  it('eingereichte Periode taucht nicht auf', () => {
    const r = offeneUvaPerioden(new Date(2026, 7, 12), 'monthly', [
      { period_year: 2026, period_month: 7, status: 'submitted' },
    ], 1);
    expect(r).toHaveLength(0);
  });

  it('nur berechnete (draft) Periode gilt weiter als offen', () => {
    const r = offeneUvaPerioden(new Date(2026, 7, 12), 'monthly', [
      { period_year: 2026, period_month: 7, status: 'draft' },
    ], 1);
    expect(r).toHaveLength(1);
  });

  it('Jahreswechsel: im Jänner ist der Dezember des Vorjahres dran', () => {
    const r = offeneUvaPerioden(new Date(2026, 0, 10), 'monthly', KEINE, 2);
    expect(r.map(x => x.label)).toEqual(['November 2025', 'Dezember 2025']);
    // Dezember 2025 fällig am 15. Februar 2026
    const dez = r[1];
    expect(dez.faelligAm.getFullYear()).toBe(2026);
    expect(dez.faelligAm.getMonth()).toBe(1);
  });

  it('überfällige Periode hat negative Tage', () => {
    // 20.09.2026: Juli-UVA war am 15.09. fällig
    const r = offeneUvaPerioden(new Date(2026, 8, 20), 'monthly', KEINE, 2);
    const juli = r.find(x => x.label === 'Juli 2026')!;
    expect(juli.tageBisFaellig).toBe(-5);
  });
});

describe('offeneUvaPerioden – quartalsweise', () => {
  it('im August ist Q2 die letzte abgeschlossene Periode (fällig 15. August)', () => {
    const r = offeneUvaPerioden(new Date(2026, 7, 12), 'quarterly', KEINE, 1);
    expect(r).toHaveLength(1);
    expect(r[0].label).toBe('Q2 2026');
    expect(r[0].periodMonth).toBe(6);
    expect(r[0].faelligAm.getMonth()).toBe(7); // August
    expect(r[0].tageBisFaellig).toBe(3);
  });

  it('Q4 gehört zum Vorjahr und ist am 15. Februar fällig', () => {
    const r = offeneUvaPerioden(new Date(2026, 1, 1), 'quarterly', KEINE, 1); // 01.02.2026
    expect(r[0].label).toBe('Q4 2025');
    expect(r[0].periodMonth).toBe(12);
    expect(r[0].faelligAm.getFullYear()).toBe(2026);
    expect(r[0].faelligAm.getMonth()).toBe(1);
  });

  it('zwei Perioden, älteste zuerst', () => {
    const r = offeneUvaPerioden(new Date(2026, 7, 12), 'quarterly', KEINE, 2);
    expect(r.map(x => x.label)).toEqual(['Q1 2026', 'Q2 2026']);
  });
});
