// ============================================================
// Unternehmensbericht – reine Rechenlogik (Welle 6)
//
// Alles, was der Bericht zeigt, wird hier aus den Rohdaten
// abgeleitet: Kontostände, Forderungen/Verbindlichkeiten,
// Erfolgsrechnung nach Kategorie, Anlagenzugänge, offene USt.
// Keine Datenbankzugriffe – damit die Zahlen testbar bleiben.
//
// Wichtig: Die E&A Suite führt eine Einnahmen-Ausgaben-Rechnung,
// keine doppelte Buchführung. Die "Vermögensübersicht" ist deshalb
// eine vereinfachte Sicht (Kontostände + offene Posten + Anschaffungs-
// werte), keine Bilanz nach UGB.
// ============================================================

export type KontoRoh = {
  id: string;
  name: string;
  type: string;
  iban: string | null;
  opening_balance: number | null;
  opening_date: string | null;
  is_active: boolean;
};

export type KontoBewegung = {
  account_id: string | null;
  type: 'income' | 'expense';
  amount_gross: number;
  booking_date: string;
  is_reconciled: boolean;
};

export type Umbuchung = {
  from_account_id: string;
  to_account_id: string;
  amount: number;
  transfer_date: string;
  is_reconciled_from: boolean;
  is_reconciled_to: boolean;
};

export type KontoStand = {
  id: string;
  name: string;
  type: string;
  iban: string | null;
  eroeffnung: number;
  eroeffnungAm: string | null;
  saldo: number;
  bewegungen: number;
  nichtAbgestimmt: number;
  letzteBewegung: string | null;
};

/** Saldo je Konto: Eröffnungssaldo + Einnahmen − Ausgaben ± Umbuchungen (nach dem Eröffnungsdatum). */
export function kontoStaende(
  konten: KontoRoh[],
  bewegungen: KontoBewegung[],
  umbuchungen: Umbuchung[],
): KontoStand[] {
  return konten.map(k => {
    const ab = k.opening_date ?? '';
    let saldo = Number(k.opening_balance ?? 0);
    let n = 0, offen = 0;
    let letzte: string | null = null;

    for (const b of bewegungen) {
      if (b.account_id !== k.id) continue;
      if (ab && b.booking_date <= ab) continue;
      saldo += b.type === 'income' ? Number(b.amount_gross) : -Number(b.amount_gross);
      n += 1;
      if (!b.is_reconciled) offen += 1;
      if (!letzte || b.booking_date > letzte) letzte = b.booking_date;
    }
    for (const u of umbuchungen) {
      const quelle = u.from_account_id === k.id;
      const ziel   = u.to_account_id === k.id;
      if (!quelle && !ziel) continue;
      if (ab && u.transfer_date <= ab) continue;
      saldo += quelle ? -Number(u.amount) : Number(u.amount);
      n += 1;
      if (quelle ? !u.is_reconciled_from : !u.is_reconciled_to) offen += 1;
      if (!letzte || u.transfer_date > letzte) letzte = u.transfer_date;
    }

    return {
      id: k.id, name: k.name, type: k.type, iban: k.iban,
      eroeffnung: Number(k.opening_balance ?? 0), eroeffnungAm: k.opening_date,
      saldo: rund(saldo), bewegungen: n, nichtAbgestimmt: offen, letzteBewegung: letzte,
    };
  });
}

export type OffenerPosten = {
  id: string;
  label: string;
  nummer: string | null;
  faelligAm: string;
  betrag: number;
};

export type PostenSumme = {
  anzahl: number;
  summe: number;
  ueberfaelligAnzahl: number;
  ueberfaelligSumme: number;
  /** nach Fälligkeit aufsteigend, überfällige zuerst */
  posten: (OffenerPosten & { tageUeberfaellig: number })[];
};

export function offenePosten(posten: OffenerPosten[], heute: string): PostenSumme {
  const mitTagen = posten
    .map(p => ({ ...p, tageUeberfaellig: tageZwischen(p.faelligAm, heute) }))
    .sort((a, b) => a.faelligAm.localeCompare(b.faelligAm));
  const ueberf = mitTagen.filter(p => p.tageUeberfaellig > 0);
  return {
    anzahl: mitTagen.length,
    summe: rund(mitTagen.reduce((s, p) => s + Number(p.betrag), 0)),
    ueberfaelligAnzahl: ueberf.length,
    ueberfaelligSumme: rund(ueberf.reduce((s, p) => s + Number(p.betrag), 0)),
    posten: mitTagen,
  };
}

export type BuchungRoh = {
  type: 'income' | 'expense';
  amount_net: number;
  amount_gross: number;
  booking_date: string;
  is_private: boolean;
  kategorie: string;
  konto_nr: string | null;
};

export type KategorieSumme = { kategorie: string; konto_nr: string | null; netto: number; brutto: number; anzahl: number };

/** Summen je Kategorie für ein Jahr – ohne private Buchungen, absteigend nach Netto. */
export function nachKategorie(buchungen: BuchungRoh[], jahr: number, typ: 'income' | 'expense'): KategorieSumme[] {
  const map = new Map<string, KategorieSumme>();
  for (const b of buchungen) {
    if (b.type !== typ || b.is_private) continue;
    if (!b.booking_date.startsWith(String(jahr))) continue;
    const key = b.kategorie;
    const e = map.get(key) ?? { kategorie: key, konto_nr: b.konto_nr, netto: 0, brutto: 0, anzahl: 0 };
    e.netto += Number(b.amount_net); e.brutto += Number(b.amount_gross); e.anzahl += 1;
    map.set(key, e);
  }
  return [...map.values()]
    .map(e => ({ ...e, netto: rund(e.netto), brutto: rund(e.brutto) }))
    .sort((a, b) => b.netto - a.netto);
}

export type Jahressumme = { einnahmen: number; ausgaben: number; ueberschuss: number; ust: number; vst: number };

/** Jahressumme aus den DB-Monatssummen (monatssummen()-RPC). */
export function jahresSumme(
  monatssummen: { jahr: number; monat: number; einnahmen: number; ausgaben: number; ust: number; vst: number }[],
  jahr: number,
  bisMonat = 12,
): Jahressumme {
  const z = monatssummen.filter(m => Number(m.jahr) === jahr && Number(m.monat) <= bisMonat);
  const einnahmen = rund(z.reduce((s, m) => s + Number(m.einnahmen), 0));
  const ausgaben  = rund(z.reduce((s, m) => s + Number(m.ausgaben), 0));
  const ust = rund(z.reduce((s, m) => s + Number(m.ust), 0));
  const vst = rund(z.reduce((s, m) => s + Number(m.vst), 0));
  return { einnahmen, ausgaben, ueberschuss: rund(einnahmen - ausgaben), ust, vst };
}

/**
 * Gebuchte AfA (Welle 8): Buchungen mit asset_id sind nicht zahlungswirksam.
 * Die Erfolgsrechnung zeigt die Ausgaben ohne sie und rechnet die AfA
 * getrennt (aus dem Anlagenverzeichnis) – sonst zählte sie doppelt.
 */
export function afaGebuchtImJahr(
  afaBuchungen: { amount_net: number; booking_date: string }[],
  jahr: number,
  bisMonat = 12,
): number {
  return rund(afaBuchungen
    .filter(b => Number(b.booking_date.slice(0, 4)) === jahr && Number(b.booking_date.slice(5, 7)) <= bisMonat)
    .reduce((s, b) => s + Number(b.amount_net), 0));
}

/** Jahressumme ohne die gebuchte AfA (zahlungswirksame Sicht). */
export function ohneAfaBuchungen(summe: Jahressumme, afaGebucht: number): Jahressumme {
  if (!afaGebucht) return summe;
  const ausgaben = rund(summe.ausgaben - afaGebucht);
  return { ...summe, ausgaben, ueberschuss: rund(summe.einnahmen - ausgaben) };
}

/**
 * Anlagenzugänge: Ausgaben in Kategorien der Kontenklasse 0 (EKR:
 * Anlagevermögen, Kontonummer beginnt mit 0). Anschaffungswerte netto,
 * ohne Abschreibung – solange es kein Anlagenverzeichnis gibt.
 */
export function anlagenZugaenge(buchungen: BuchungRoh[]) {
  const anlagen = buchungen.filter(b => b.type === 'expense' && !b.is_private && (b.konto_nr ?? '').startsWith('0'));
  const gesamt = rund(anlagen.reduce((s, b) => s + Number(b.amount_net), 0));
  const jeJahr = new Map<number, number>();
  for (const b of anlagen) {
    const j = Number(b.booking_date.slice(0, 4));
    jeJahr.set(j, rund((jeJahr.get(j) ?? 0) + Number(b.amount_net)));
  }
  return { gesamt, anzahl: anlagen.length, jeJahr: [...jeJahr.entries()].sort((a, b) => b[0] - a[0]) };
}

/**
 * Noch nicht gemeldete USt: Zahllast (USt − VSt) aller Monate des Jahres,
 * für die keine eingereichte UVA vorliegt. Positiv = Schuld ans Finanzamt.
 */
export function ustOffen(
  monatssummen: { jahr: number; monat: number; ust: number; vst: number }[],
  eingereicht: { period_year: number; period_month: number; status: string }[],
  jahr: number,
  vatPeriod: 'monthly' | 'quarterly',
): { betrag: number; monate: number[] } {
  const gemeldet = new Set<number>();
  for (const t of eingereicht) {
    if (t.status !== 'submitted' || Number(t.period_year) !== jahr) continue;
    const m = Number(t.period_month);
    if (vatPeriod === 'quarterly') { for (let i = m - 2; i <= m; i++) gemeldet.add(i); }
    else gemeldet.add(m);
  }
  const monate: number[] = [];
  let betrag = 0;
  for (const z of monatssummen) {
    if (Number(z.jahr) !== jahr || gemeldet.has(Number(z.monat))) continue;
    const saldo = Number(z.ust) - Number(z.vst);
    if (saldo === 0 && Number(z.ust) === 0) continue;
    monate.push(Number(z.monat));
    betrag += saldo;
  }
  return { betrag: rund(betrag), monate: monate.sort((a, b) => a - b) };
}

export function tageZwischen(von: string, bis: string): number {
  const a = new Date(von + 'T00:00:00Z').getTime();
  const b = new Date(bis + 'T00:00:00Z').getTime();
  return Math.round((b - a) / 86400000);
}

export function rund(n: number): number {
  return Math.round(n * 100) / 100;
}
