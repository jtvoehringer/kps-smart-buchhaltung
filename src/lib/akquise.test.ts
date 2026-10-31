import { describe, it, expect } from 'vitest';
import {
  STAGES, OFFENE_STAGES, stageLabel, defaultProbability, istOffen, stageNachAktivitaet, stageAnheben,
  addWerktage, followupDatum, wochenende, tageZwischen, faelligkeit, faelligeFollowups,
  projektwert, gewichteterWert, antwortquote, durchlaufzeit, letzteAktivitaet, istReaktion,
  parseDateiname, camelZuText, dokumentAusPfad,
} from './akquise';
import type { AcqStage } from './supabase/database.types';

describe('Stages', () => {
  it('neun Stufen, sechs davon offen', () => {
    expect(STAGES).toHaveLength(9);
    expect(OFFENE_STAGES).toEqual(['recherche', 'beworben', 'rueckmeldung', 'gespraech', 'endkunde', 'angebot']);
    expect(istOffen('pausiert')).toBe(false);
    expect(istOffen('angebot')).toBe(true);
  });

  it('Labels je Art: Festanstellung heißt Erst-/Zweitgespräch', () => {
    expect(stageLabel('gespraech', 'projekt')).toBe('Gespräch Vermittler');
    expect(stageLabel('gespraech', 'festanstellung')).toBe('Erstgespräch');
    expect(stageLabel('endkunde', 'festanstellung')).toBe('Zweitgespräch');
    expect(stageLabel('angebot', 'festanstellung')).toBe('Angebot / Verhandlung');
  });

  it('Default-Wahrscheinlichkeiten', () => {
    expect(defaultProbability('beworben')).toBe(15);
    expect(defaultProbability('gewonnen')).toBe(100);
    expect(defaultProbability('pausiert')).toBeNull();
  });

  it('Aktivitäten heben die Stage an, nie ab', () => {
    expect(stageNachAktivitaet('notiz')).toBeNull();
    expect(stageNachAktivitaet('interview')).toBe('endkunde');
    expect(stageAnheben('beworben', 'antwort')).toBe('rueckmeldung');
    expect(stageAnheben('gespraech', 'antwort')).toBeNull();          // schon weiter
    expect(stageAnheben('angebot', 'absage')).toBe('verloren');
    expect(stageAnheben('gewonnen', 'absage')).toBeNull();            // abgeschlossen bleibt
    expect(stageAnheben('pausiert', 'antwort')).toBe('rueckmeldung'); // Wiederaufnahme
    expect(stageAnheben('beworben', 'followup')).toBeNull();
  });
});

describe('Werktage und Fälligkeit', () => {
  it('addWerktage überspringt das Wochenende', () => {
    expect(addWerktage('2026-10-26', 5)).toBe('2026-11-02'); // Mo → Mo
    expect(addWerktage('2026-10-30', 1)).toBe('2026-11-02'); // Fr → Mo
    expect(addWerktage('2026-10-31', 1)).toBe('2026-11-02'); // Sa → Mo
    expect(addWerktage('2026-10-28', 0)).toBe('2026-10-28');
    expect(followupDatum('2026-10-29')).toBe('2026-11-05');   // Do + 5 WT
  });

  it('wochenende und tageZwischen (auch über die Zeitumstellung)', () => {
    expect(wochenende('2026-10-28')).toBe('2026-11-01');
    expect(wochenende('2026-11-01')).toBe('2026-11-01');
    expect(tageZwischen('2026-10-24', '2026-10-26')).toBe(2);   // 25.10. Umstellung auf Winterzeit
    expect(tageZwischen('2026-10-24T09:00:00Z', '2026-10-31')).toBe(7);
  });

  it('faelligkeit unterscheidet überfällig, heute, diese Woche, später', () => {
    const h = '2026-10-28'; // Mittwoch
    const o = (stage: AcqStage, d: string | null) => ({ stage, next_action_on: d });
    expect(faelligkeit(o('beworben', '2026-10-27'), h)).toBe('ueberfaellig');
    expect(faelligkeit(o('beworben', '2026-10-28'), h)).toBe('heute');
    expect(faelligkeit(o('beworben', '2026-11-01'), h)).toBe('woche');
    expect(faelligkeit(o('beworben', '2026-11-02'), h)).toBe('spaeter');
    expect(faelligkeit(o('verloren', '2026-10-01'), h)).toBe('keine');
    expect(faelligkeit(o('pausiert', '2026-10-01'), h)).toBe('ueberfaellig'); // Wiedervorlage
  });

  it('faelligeFollowups gruppiert und sortiert nach Datum', () => {
    const opps = [
      { id: 'a', stage: 'beworben' as AcqStage, next_action_on: '2026-10-20' },
      { id: 'b', stage: 'gespraech' as AcqStage, next_action_on: '2026-10-10' },
      { id: 'c', stage: 'beworben' as AcqStage, next_action_on: '2026-10-28' },
      { id: 'd', stage: 'beworben' as AcqStage, next_action_on: '2026-10-30' },
      { id: 'e', stage: 'gewonnen' as AcqStage, next_action_on: '2026-10-01' },
      { id: 'f', stage: 'beworben' as AcqStage, next_action_on: '2026-11-15' },
    ];
    const f = faelligeFollowups(opps, '2026-10-28');
    expect(f.ueberfaellig.map(o => o.id)).toEqual(['b', 'a']);
    expect(f.heute.map(o => o.id)).toEqual(['c']);
    expect(f.dieseWoche.map(o => o.id)).toEqual(['d']);
  });
});

describe('Gewichteter Pipeline-Wert', () => {
  const p = (o: Partial<Parameters<typeof projektwert>[0]> = {}) => ({
    stage: 'beworben' as AcqStage, kind: 'projekt' as const, probability: null,
    rate_per_day: 900, hours_per_week: 40, duration_months: 6, ...o,
  });

  it('projektwert: Tagessatz × Monate × 20 × Auslastung', () => {
    expect(projektwert(p())).toBe(108000);
    expect(projektwert(p({ hours_per_week: 20 }))).toBe(54000);
    expect(projektwert(p({ rate_per_day: null }))).toBeNull();
    expect(projektwert(p({ kind: 'festanstellung' }))).toBeNull();
  });

  it('gewichtet mit Wahrscheinlichkeit (Default je Stage), nur offene Projekte', () => {
    const g = gewichteterWert([
      p(),                                              // 108.000 × 15 %
      p({ stage: 'angebot', probability: 50 }),         // 108.000 × 50 %
      p({ stage: 'verloren' }),                         // zählt nicht
      p({ duration_months: null }),                     // ohne Angaben
      p({ kind: 'festanstellung' }),                    // keine Projekt-Opportunity
    ]);
    expect(g.wert).toBe(16200 + 54000);
    expect(g.beruecksichtigt).toBe(2);
    expect(g.ohneAngaben).toBe(1);
  });
});

describe('Antwortquote und Durchlaufzeit', () => {
  const akt = (opportunity_id: string, kind: Parameters<typeof istReaktion>[0]['kind'], occurred_at: string, direction: 'aus' | 'ein' | null = null) =>
    ({ opportunity_id, kind, occurred_at, direction });

  it('istReaktion: Antwortarten oder eingehende Nachricht', () => {
    expect(istReaktion({ kind: 'antwort', direction: null })).toBe(true);
    expect(istReaktion({ kind: 'linkedin', direction: 'ein' })).toBe(true);
    expect(istReaktion({ kind: 'followup', direction: 'aus' })).toBe(false);
  });

  it('antwortquote je Zeitraum aus Aktivitäten', () => {
    const opps = [
      { id: 'a', applied_on: '2026-10-05' },
      { id: 'b', applied_on: '2026-10-10' },
      { id: 'c', applied_on: '2026-10-20' },
      { id: 'd', applied_on: '2026-09-01' }, // vor dem Zeitraum
      { id: 'e', applied_on: null },
    ];
    const acts = [
      akt('a', 'bewerbung', '2026-10-05T10:00:00Z'),
      akt('a', 'antwort', '2026-10-08T10:00:00Z'),
      akt('b', 'followup', '2026-10-17T10:00:00Z', 'aus'),
      akt('d', 'gespraech', '2026-09-10T10:00:00Z'),
    ];
    const q = antwortquote(opps, acts, '2026-10-01');
    expect(q).toEqual({ beworben: 3, beantwortet: 1, quote: 1 / 3 });
    expect(antwortquote([], acts, '2026-10-01').quote).toBeNull();
  });

  it('durchlaufzeit ab Bewerbung bis Antwort, Gespräch, Entscheidung', () => {
    const d = durchlaufzeit([
      akt('a', 'gespraech', '2026-10-15T09:00:00Z'),
      akt('a', 'bewerbung', '2026-10-01T09:00:00Z'),
      akt('a', 'antwort', '2026-10-06T09:00:00Z'),
      akt('a', 'absage', '2026-10-30T09:00:00Z'),
    ]);
    expect(d).toEqual({ bisAntwort: 5, bisGespraech: 14, bisEntscheidung: 29 });
    expect(durchlaufzeit([])).toEqual({ bisAntwort: null, bisGespraech: null, bisEntscheidung: null });
  });

  it('letzteAktivitaet je Opportunity', () => {
    const m = letzteAktivitaet([
      akt('a', 'bewerbung', '2026-10-01T09:00:00Z'),
      akt('a', 'antwort', '2026-10-06T09:00:00Z'),
      akt('b', 'bewerbung', '2026-10-02T09:00:00Z'),
    ]);
    expect(m.get('a')).toBe('2026-10-06T09:00:00Z');
    expect(m.size).toBe(2);
  });
});

describe('Dateinamen der Bewerbungsunterlagen', () => {
  it('camelZuText trennt Wörter und Abkürzungen', () => {
    expect(camelZuText('SeniorRequirementsEngineer')).toBe('Senior Requirements Engineer');
    expect(camelZuText('SeniorERPConsultant')).toBe('Senior ERP Consultant');
    expect(camelZuText('BA_CRM_Dynamics_Geneva')).toBe('BA CRM Dynamics Geneva');
  });

  it('parst Typ, Firma, Rolle, Referenz und Art', () => {
    expect(parseDateiname('Projektbewerbung_LaufwerkCloud_RE_Kredit_3059833_Voehringer.pdf')).toEqual({
      typ: 'Projektbewerbung', basis: 'LaufwerkCloud_RE_Kredit_3059833', firma: 'LaufwerkCloud',
      rolle: 'RE Kredit', ref: '3059833', ext: 'pdf', art: 'projekt',
    });
    const b = parseDateiname('Bewerbung_MichaelPage_SeniorERPConsultant_Voehringer.docx')!;
    expect([b.firma, b.rolle, b.art, b.ref]).toEqual(['MichaelPage', 'Senior ERP Consultant', 'festanstellung', null]);
    const o = parseDateiname('OnePager_MichaelPage_SeniorERPConsultant_Voehringer.pptx')!;
    expect(o.basis).toBe(b.basis);   // gehört zur selben Opportunity
    expect(o.art).toBeNull();
    const i = parseDateiname('Initiativbewerbung_scc_Voehringer.pdf')!;
    expect([i.firma, i.rolle, i.art]).toEqual(['scc', '', 'initiativ']);
  });

  it('dokumentAusPfad: Windows-Pfad, file://-URL, Anführungszeichen', () => {
    expect(dokumentAusPfad('"C:\\Claude outputs\\Projektbewerbung_STI_RequirementsEngineer_Voehringer.pdf"')).toEqual({
      path: 'C:\\Claude outputs\\Projektbewerbung_STI_RequirementsEngineer_Voehringer.pdf', type: 'pdf', label: 'Projektbewerbung',
    });
    expect(dokumentAusPfad('file:///C:/x/Notizen.docx')).toEqual({ path: 'C:/x/Notizen.docx', type: 'docx', label: 'Notizen.docx' });
  });

  it('überspringt Profil-Dateien und Fremdes', () => {
    expect(parseDateiname('2026 Voehringer_Profile_en.pdf')).toBeNull();
    expect(parseDateiname('2026 Vöhringer_Profil_dt_Claude.docx')).toBeNull();
    expect(parseDateiname('Vorlagen')).toBeNull();
    expect(parseDateiname('Notiz_Voehringer.pdf')).toBeNull();
  });
});
