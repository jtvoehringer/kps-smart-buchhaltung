import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fehlerText, meldeFehler, heute, alsDatum } from './fehler';

describe('fehlerText', () => {
  it('übersetzt eine doppelte Rechnungsnummer', () => {
    expect(fehlerText({ message: 'duplicate key value violates unique constraint "invoices_client_nr_uq"' }))
      .toBe('Diese Rechnungsnummer ist bereits vergeben.');
  });

  it('übersetzt eine bereits importierte Bankbuchung', () => {
    expect(fehlerText({ message: 'duplicate key value violates unique constraint "idx_transactions_bank_ref"' }))
      .toBe('Diese Bankbuchung wurde bereits importiert.');
  });

  it('übersetzt eine RLS-Verletzung', () => {
    expect(fehlerText({ message: 'new row violates row-level security policy for table "transactions"' }))
      .toBe('Keine Berechtigung für diesen Vorgang.');
  });

  it('übersetzt einen fehlenden Spaltenstand', () => {
    expect(fehlerText({ message: "Could not find the 'file_size' column of 'attachments' in the schema cache" }))
      .toBe('Die Datenbank ist nicht auf dem erwarteten Stand – bitte die ausstehenden Migrationen ausführen.');
  });

  it('reicht eigene, bereits verständliche Meldungen durch', () => {
    const m = 'Monat 2/2026 ist abgeschlossen und gesperrt.';
    expect(fehlerText({ message: m })).toBe(m);
  });

  it('reicht Unbekanntes unverändert durch statt es zu verschlucken', () => {
    expect(fehlerText({ message: 'irgendwas ganz Neues' })).toBe('irgendwas ganz Neues');
  });

  it('nutzt den Fallback bei null', () => {
    expect(fehlerText(null)).toBe('Unbekannter Fehler');
    expect(fehlerText(null, 'Speichern fehlgeschlagen')).toBe('Speichern fehlgeschlagen');
  });
});

describe('meldeFehler', () => {
  beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('gibt bei null false zurück und meldet nichts', () => {
    const zeigen = vi.fn();
    expect(meldeFehler('Test', null, zeigen)).toBe(false);
    expect(zeigen).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('loggt und zeigt bei einem Fehler', () => {
    const zeigen = vi.fn();
    expect(meldeFehler('Buchung speichern', { message: 'kaputt' }, zeigen)).toBe(true);
    expect(zeigen).toHaveBeenCalledWith('kaputt');
    expect(console.error).toHaveBeenCalled();
  });

  it('funktioniert auch ohne Anzeigefunktion', () => {
    expect(meldeFehler('Hintergrund', { message: 'kaputt' })).toBe(true);
    expect(console.error).toHaveBeenCalled();
  });
});

describe('heute / alsDatum', () => {
  it('liefert das Format YYYY-MM-DD', () => {
    expect(heute()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('liefert das LOKALE Datum, nicht das UTC-Datum', () => {
    // 1.8.2026, 00:30 Uhr Ortszeit. toISOString() läge in Wien (UTC+2)
    // beim 31.07. – also im Vormonat und womöglich in einem bereits
    // gemeldeten UVA-Zeitraum.
    const d = new Date(2026, 7, 1, 0, 30, 0);
    expect(alsDatum(d)).toBe('2026-08-01');
    expect(d.toISOString().slice(0, 10)).not.toBe('2026-08-01');
  });

  it('stimmt auch am Jahreswechsel', () => {
    expect(alsDatum(new Date(2027, 0, 1, 0, 15, 0))).toBe('2027-01-01');
    expect(alsDatum(new Date(2026, 11, 31, 23, 45, 0))).toBe('2026-12-31');
  });
});
