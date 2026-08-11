import { describe, it, expect } from 'vitest';
import { parseBetrag } from './betrag';

describe('parseBetrag – deutsches Format', () => {
  it('liest einfache Beträge', () => {
    expect(parseBetrag('123,45')).toBe(123.45);
    expect(parseBetrag('0,01')).toBe(0.01);
    expect(parseBetrag('999,99')).toBe(999.99);
  });

  it('liest eine Tausendergruppe', () => {
    expect(parseBetrag('1.234,56')).toBe(1234.56);
    expect(parseBetrag('12.345,67')).toBe(12345.67);
  });

  it('liest MEHRERE Tausendergruppen', () => {
    // Genau hier lag der Fehler: der alte Parser lieferte 1.234567
    expect(parseBetrag('1.234.567,89')).toBe(1234567.89);
    expect(parseBetrag('12.345.678,90')).toBe(12345678.90);
    expect(parseBetrag('1.000.000,00')).toBe(1000000);
  });

  it('liest Ganzbeträge mit Tausenderpunkt als Tausender', () => {
    // "1.234" meint 1234,00 – nicht 1,234
    expect(parseBetrag('1.234')).toBe(1234);
    expect(parseBetrag('1.234.567')).toBe(1234567);
  });
});

describe('parseBetrag – Vorzeichen', () => {
  it('erkennt führendes Minus', () => {
    expect(parseBetrag('-1.234,56')).toBe(-1234.56);
    expect(parseBetrag('-0,01')).toBe(-0.01);
  });

  it('erkennt NACHGESTELLTES Minus', () => {
    // Ohne das wurde eine Ausgabe als Einnahme importiert
    expect(parseBetrag('1.234,56-')).toBe(-1234.56);
    expect(parseBetrag('99,00-')).toBe(-99);
  });

  it('erkennt Klammern als negativ', () => {
    expect(parseBetrag('(1.234,56)')).toBe(-1234.56);
  });

  it('verträgt ein Plus', () => {
    expect(parseBetrag('+1.234,56')).toBe(1234.56);
    expect(parseBetrag('1.234,56+')).toBe(1234.56);
  });
});

describe('parseBetrag – englisches Format', () => {
  it('liest Punkt als Dezimaltrenner', () => {
    expect(parseBetrag('1234.56')).toBe(1234.56);
    expect(parseBetrag('1,234.56')).toBe(1234.56);
    expect(parseBetrag('1,234,567.89')).toBe(1234567.89);
  });
});

describe('parseBetrag – Randfälle', () => {
  it('entfernt Währung und Leerzeichen', () => {
    expect(parseBetrag(' 1.234,56 EUR ')).toBe(1234.56);
    expect(parseBetrag('€ 500,00')).toBe(500);
    expect(parseBetrag('"1.234,56"')).toBe(1234.56);
  });

  it('liefert null bei ungültigen Eingaben', () => {
    expect(parseBetrag('')).toBeNull();
    expect(parseBetrag(null)).toBeNull();
    expect(parseBetrag(undefined)).toBeNull();
    expect(parseBetrag('abc')).toBeNull();
    expect(parseBetrag('12,34,56,78 EUR abc')).toBeNull();
    expect(parseBetrag('-')).toBeNull();
  });

  it('liest Null korrekt', () => {
    expect(parseBetrag('0')).toBe(0);
    expect(parseBetrag('0,00')).toBe(0);
    expect(parseBetrag('-0,00')).toBe(-0);
  });

  it('verliert bei großen Beträgen keine Genauigkeit', () => {
    expect(parseBetrag('9.999.999,99')).toBe(9999999.99);
  });
});
