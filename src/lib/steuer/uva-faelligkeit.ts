// Welche UVA-Perioden sind abgeschlossen, aber noch nicht eingereicht?
// Grundlage für die Aufgabenliste am Dashboard (Design-Review Welle 3:
// "Dashboard auf Monat + Aufgaben" – jede Karte hat eine nächste Aktion).
//
// Fälligkeit nach BAO: die UVA ist am 15. des zweitfolgenden Monats nach
// Periodenende fällig (Monat Juli -> 15. September; Q1 -> 15. Mai).
// tax_returns speichert Quartale als Endmonat (Q2 -> period_month 6),
// eingereicht ist eine Periode mit status 'submitted'.

const MONATE = [
  'Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

export type EingereichtePeriode = {
  period_year: number;
  period_month: number;
  status: string;
};

export type OffeneUva = {
  jahr: number;
  /** Endmonat der Periode – identisch zu tax_returns.period_month */
  periodMonth: number;
  /** "Juli 2026" bzw. "Q2 2026" */
  label: string;
  faelligAm: Date;
  /** Kalendertage bis zur Fälligkeit; negativ = bereits überfällig */
  tageBisFaellig: number;
};

function faelligkeit(jahr: number, endMonat: number): Date {
  // 15. des zweitfolgenden Monats; Date normalisiert Monatsüberlauf selbst
  // (Monat ist 0-basiert: endMonat+1 = Folgemonat-Index +1 = übernächster).
  return new Date(jahr, endMonat + 1, 15);
}

function tageBis(von: Date, bis: Date): number {
  const a = new Date(von.getFullYear(), von.getMonth(), von.getDate());
  return Math.round((bis.getTime() - a.getTime()) / 86400000);
}

/**
 * Liefert die abgeschlossenen, noch nicht eingereichten UVA-Perioden,
 * älteste zuerst. Betrachtet werden die letzten `anzahlPerioden`
 * abgeschlossenen Perioden (Standard: 3 Monate bzw. 2 Quartale).
 */
export function offeneUvaPerioden(
  heute: Date,
  periodizitaet: 'monthly' | 'quarterly',
  eingereicht: EingereichtePeriode[],
  anzahlPerioden?: number,
  /** Migration 044: Perioden, die vollständig vor dem Betriebsbeginn enden, zählen nicht */
  betriebsbeginn?: string | null,
): OffeneUva[] {
  const beginn = betriebsbeginn ? new Date(betriebsbeginn) : null;
  const monatlich = periodizitaet === 'monthly';
  const anzahl = anzahlPerioden ?? (monatlich ? 3 : 2);
  const schritt = monatlich ? 1 : 3;

  // Endmonat der letzten abgeschlossenen Periode
  let jahr = heute.getFullYear();
  let endMonat: number; // 1-basiert
  if (monatlich) {
    endMonat = heute.getMonth(); // Vormonat (getMonth ist 0-basiert)
    if (endMonat === 0) { endMonat = 12; jahr -= 1; }
  } else {
    const quartal = Math.floor(heute.getMonth() / 3); // 0..3 = laufendes Quartal
    if (quartal === 0) { endMonat = 12; jahr -= 1; }
    else { endMonat = quartal * 3; }
  }

  const offene: OffeneUva[] = [];
  for (let i = 0; i < anzahl; i++) {
    const istEingereicht = eingereicht.some(
      e => e.period_year === jahr && e.period_month === endMonat && e.status === 'submitted',
    );
    // Periodenende (letzter Tag des Endmonats) vor dem Betriebsbeginn?
    const vorBeginn = beginn !== null && new Date(jahr, endMonat, 0) < beginn;
    if (!istEingereicht && !vorBeginn) {
      const due = faelligkeit(jahr, endMonat);
      offene.push({
        jahr,
        periodMonth: endMonat,
        label: monatlich
          ? `${MONATE[endMonat - 1]} ${jahr}`
          : `Q${endMonat / 3} ${jahr}`,
        faelligAm: due,
        tageBisFaellig: tageBis(heute, due),
      });
    }
    endMonat -= schritt;
    if (endMonat <= 0) { endMonat += 12; jahr -= 1; }
  }

  // Älteste (dringendste) zuerst
  return offene.reverse();
}
