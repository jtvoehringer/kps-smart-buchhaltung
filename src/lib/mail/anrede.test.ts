import { describe, it, expect } from 'vitest';
import { anrede } from './anrede';

describe('anrede', () => {
  it('bildet aus dem Stammdaten-Kürzel die richtige Ansprache', () => {
    // Das Kontaktfeld folgt der Konvention "Fr./Hrn. Vorname Nachname".
    expect(anrede('Fr. Maria Huber')).toBe('Sehr geehrte Frau Maria Huber,');
    expect(anrede('Hrn. Max Maier')).toBe('Sehr geehrter Herr Max Maier,');
  });

  it('versteht auch ausgeschriebene und abweichende Kürzel', () => {
    expect(anrede('Frau Huber')).toBe('Sehr geehrte Frau Huber,');
    expect(anrede('Herrn Maier')).toBe('Sehr geehrter Herr Maier,');
    expect(anrede('Herr Maier')).toBe('Sehr geehrter Herr Maier,');
    expect(anrede('Hr. Maier')).toBe('Sehr geehrter Herr Maier,');
    expect(anrede('fr. huber')).toBe('Sehr geehrte Frau huber,');
  });

  it('rät bei einem Kontakt ohne Kürzel kein Geschlecht', () => {
    expect(anrede('Maria Huber')).toBe('Guten Tag, Maria Huber,');
  });

  it('bleibt ohne Kontakt bei der neutralen Grußformel', () => {
    // Vorher wurde hier die Firmenbezeichnung angehängt:
    // "Sehr geehrte Damen und Herren, Musterfirma GmbH,"
    expect(anrede('')).toBe('Sehr geehrte Damen und Herren,');
    expect(anrede(null)).toBe('Sehr geehrte Damen und Herren,');
    expect(anrede(undefined)).toBe('Sehr geehrte Damen und Herren,');
    expect(anrede('   ')).toBe('Sehr geehrte Damen und Herren,');
  });

  it('glättet überzählige Leerzeichen', () => {
    expect(anrede('  Fr.   Maria   Huber ')).toBe('Sehr geehrte Frau Maria Huber,');
  });

  it('stolpert nicht über Namen, die mit einem Kürzel beginnen', () => {
    // "Franziska" beginnt mit "Fr", ist aber kein Kürzel – das Muster
    // verlangt "Fr." oder "Frau" als eigenes Wort.
    expect(anrede('Franziska Berger')).toBe('Guten Tag, Franziska Berger,');
    expect(anrede('Hermann Schulz')).toBe('Guten Tag, Hermann Schulz,');
  });
});
