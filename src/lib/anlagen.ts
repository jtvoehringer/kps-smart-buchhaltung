// ============================================================
// Anlagenverzeichnis – AfA-Rechenlogik (Welle 7)
//
// Regeln (Österreich, EStG):
// - Lineare AfA: Anschaffungskosten (abzüglich Restwert) gleichmäßig
//   über die Nutzungsdauer (§ 7 Abs. 1).
// - Halbjahresregel (§ 7 Abs. 2): Inbetriebnahme im 2. Halbjahr →
//   im ersten Jahr nur die halbe Jahres-AfA; die fehlende Hälfte
//   verlängert die Abschreibung um ein Jahr. Beim Abgang im 1. Halb-
//   jahr ebenfalls nur eine halbe Jahres-AfA.
// - Degressive AfA (§ 7 Abs. 1a): fester Prozentsatz (max. 30 %) vom
//   jeweiligen Restbuchwert; Wechsel zur linearen AfA erlaubt – hier
//   automatisch, sobald die lineare AfA über die Restlaufzeit höher
//   wäre (so wird das Gut in der Nutzungsdauer fertig abgeschrieben).
// - GWG (§ 13): Sofortabschreibung im Jahr der Anschaffung.
//
// Keine Datenbankzugriffe – reine Funktionen, siehe anlagen.test.ts.
// ============================================================

export type AfaMethode = 'linear' | 'degressiv' | 'gwg';

export type Anlage = {
  id: string;
  name: string;
  asset_group: string | null;
  konto_nr: string | null;
  acquired_on: string;          // YYYY-MM-DD
  cost_net: number;
  useful_life_years: number;
  method: AfaMethode;
  degressive_rate: number | null;
  residual_value: number;
  disposed_on: string | null;
  disposal_proceeds: number | null;
};

export type AfaZeile = {
  jahr: number;
  /** Buchwert am 1.1. (bzw. Anschaffungskosten im Zugangsjahr) */
  buchwertAnfang: number;
  afa: number;
  buchwertEnde: number;
  /** halbe Jahres-AfA (Halbjahresregel) */
  halb: boolean;
  /** Jahr des Abgangs – buchwertEnde ist dann der Restbuchwert beim Abgang */
  abgang: boolean;
};

const rund = (n: number) => Math.round(n * 100) / 100;
const jahrVon = (iso: string) => Number(iso.slice(0, 4));
const zweitesHalbjahr = (iso: string) => Number(iso.slice(5, 7)) >= 7;

/** Jahres-AfA-Satz in Prozent (linear), z. B. 33,33 bei 3 Jahren */
export function afaSatzProzent(a: Pick<Anlage, 'useful_life_years' | 'method' | 'degressive_rate'>): number {
  if (a.method === 'gwg') return 100;
  if (a.method === 'degressiv') return Number(a.degressive_rate ?? 30);
  return rund(100 / Math.max(1, a.useful_life_years));
}

/**
 * Vollständiger AfA-Plan vom Zugangsjahr bis zum letzten Jahr mit AfA
 * (oder bis zum Abgang). Endet, sobald der Restwert erreicht ist.
 */
export function afaPlan(a: Anlage): AfaZeile[] {
  const zeilen: AfaZeile[] = [];
  const kosten = Number(a.cost_net);
  const rest = Math.min(Number(a.residual_value ?? 0), kosten);
  const basis = rund(kosten - rest);                      // abschreibbarer Betrag
  if (basis <= 0) return zeilen;

  const start = jahrVon(a.acquired_on);
  const abgangJahr = a.disposed_on ? jahrVon(a.disposed_on) : null;
  const nd = Math.max(1, a.useful_life_years);
  const jahresAfa = rund(basis / nd);
  const halbErstesJahr = a.method !== 'gwg' && zweitesHalbjahr(a.acquired_on);

  let buchwert = kosten;
  // Sicherheitsgrenze: Nutzungsdauer + 1 (Halbjahresregel) + Puffer
  for (let jahr = start; jahr <= start + nd + 2; jahr++) {
    const verbleibend = rund(buchwert - rest);
    if (verbleibend <= 0) break;

    let afa: number;
    let halb = false;

    if (a.method === 'gwg') {
      afa = verbleibend;
    } else if (a.method === 'degressiv') {
      const satz = Number(a.degressive_rate ?? 30) / 100;
      const degressiv = rund(buchwert * satz);
      // Restlaufzeit ab diesem Jahr (Halbjahresregel verlängert um 1)
      const gelaufen = jahr - start;
      const restJahre = Math.max(1, nd + (halbErstesJahr ? 1 : 0) - gelaufen);
      const linearRest = rund(verbleibend / restJahre);
      afa = Math.max(degressiv, linearRest);           // Wechsel auf linear, sobald günstiger
      if (jahr === start && halbErstesJahr) { afa = rund(afa / 2); halb = true; }
    } else {
      afa = jahresAfa;
      if (jahr === start && halbErstesJahr) { afa = rund(jahresAfa / 2); halb = true; }
    }

    // Abgang: im 1. Halbjahr nur halbe AfA, danach Restbuchwert
    let abgang = false;
    if (abgangJahr !== null && jahr >= abgangJahr) {
      abgang = true;
      if (jahr === abgangJahr && a.disposed_on && !zweitesHalbjahr(a.disposed_on) && a.method !== 'gwg') {
        afa = rund(afa / 2); halb = true;
      }
    }

    afa = Math.min(afa, verbleibend);
    afa = rund(afa);
    zeilen.push({ jahr, buchwertAnfang: rund(buchwert), afa, buchwertEnde: rund(buchwert - afa), halb, abgang });
    buchwert = rund(buchwert - afa);
    if (abgang) break;
  }
  return zeilen;
}

/** AfA eines bestimmten Jahres (0, wenn außerhalb des Plans) */
export function afaImJahr(a: Anlage, jahr: number): number {
  return afaPlan(a).find(z => z.jahr === jahr)?.afa ?? 0;
}

/**
 * Buchwert zum Stichtag: Anschaffungskosten abzüglich aller AfA bis
 * einschließlich des Vorjahres – innerhalb des laufenden Jahres bleibt
 * der Buchwert bis zum Jahresende konstant (AfA wird jährlich gebucht).
 * Nach dem Abgang: 0.
 */
export function buchwertAm(a: Anlage, stichtag: string): number {
  if (a.disposed_on && a.disposed_on <= stichtag) return 0;
  if (a.acquired_on > stichtag) return 0;
  const jahr = jahrVon(stichtag);
  const bisVorjahr = afaPlan(a).filter(z => z.jahr < jahr);
  const letzte = bisVorjahr[bisVorjahr.length - 1];
  return letzte ? letzte.buchwertEnde : rund(Number(a.cost_net));
}

/** Buchwert am Ende eines Jahres (31.12.) */
export function buchwertEndeJahr(a: Anlage, jahr: number): number {
  if (a.disposed_on && jahrVon(a.disposed_on) <= jahr) return 0;
  if (jahrVon(a.acquired_on) > jahr) return 0;
  const bis = afaPlan(a).filter(z => z.jahr <= jahr);
  const letzte = bis[bis.length - 1];
  return letzte ? letzte.buchwertEnde : rund(Number(a.cost_net));
}

export type Anlagenspiegel = {
  jahr: number;
  anzahlAktiv: number;
  anschaffungskosten: number;   // aller am Jahresende vorhandenen Anlagen
  zugaenge: number;             // AK der im Jahr angeschafften
  abgaenge: number;             // AK der im Jahr abgegangenen
  afaJahr: number;
  kumulierteAfa: number;        // bis Jahresende, Bestand
  buchwertEnde: number;
  /** Buchwert der Abgänge zum Abgangszeitpunkt (Restbuchwert) */
  restbuchwertAbgaenge: number;
  veraeusserungserloese: number;
};

export function anlagenspiegel(anlagen: Anlage[], jahr: number): Anlagenspiegel {
  const s: Anlagenspiegel = {
    jahr, anzahlAktiv: 0, anschaffungskosten: 0, zugaenge: 0, abgaenge: 0, afaJahr: 0,
    kumulierteAfa: 0, buchwertEnde: 0, restbuchwertAbgaenge: 0, veraeusserungserloese: 0,
  };
  for (const a of anlagen) {
    const zugang = jahrVon(a.acquired_on);
    const abgang = a.disposed_on ? jahrVon(a.disposed_on) : null;
    if (zugang > jahr) continue;
    const kosten = Number(a.cost_net);
    s.afaJahr += afaImJahr(a, jahr);
    if (zugang === jahr) s.zugaenge += kosten;
    if (abgang === jahr) {
      s.abgaenge += kosten;
      const plan = afaPlan(a);
      s.restbuchwertAbgaenge += plan[plan.length - 1]?.buchwertEnde ?? 0;
      s.veraeusserungserloese += Number(a.disposal_proceeds ?? 0);
    }
    if (abgang === null || abgang > jahr) {
      s.anzahlAktiv += 1;
      s.anschaffungskosten += kosten;
      const bw = buchwertEndeJahr(a, jahr);
      s.buchwertEnde += bw;
      s.kumulierteAfa += kosten - bw;
    }
  }
  for (const k of Object.keys(s) as (keyof Anlagenspiegel)[]) {
    if (k !== 'jahr' && k !== 'anzahlAktiv') (s[k] as number) = rund(s[k] as number);
  }
  return s;
}

// ============================================================
// Welle 8: AfA-Buchung am Jahresende und Anlagenspiegel je Zeile
// ============================================================

export type AfaBuchungRoh = {
  id: string;
  asset_id: string | null;
  amount_net: number;
  booking_date: string;
  is_locked: boolean;
};

export type AfaBuchungsZeile = {
  anlage: Anlage;
  /** AfA laut Verzeichnis */
  soll: number;
  /** bereits gebuchter Betrag (0 = keine Buchung) */
  ist: number;
  buchungId: string | null;
  gesperrt: boolean;
  status: 'gebucht' | 'offen' | 'abweichend' | 'ueberfluessig';
};

export type AfaBuchungsStatus = {
  jahr: number;
  zeilen: AfaBuchungsZeile[];
  soll: number;
  ist: number;
  offen: number;          // Anzahl zu buchender Zeilen (offen + abweichend + überflüssig)
  gesperrt: number;       // Buchungen in gesperrten Monaten
  komplett: boolean;      // alles gebucht und stimmig
};

/**
 * Vergleicht die AfA laut Verzeichnis mit den gebuchten AfA-Buchungen
 * eines Jahres (transactions mit asset_id). Anlagen ohne AfA im Jahr
 * erscheinen nur, wenn trotzdem eine Buchung existiert (überflüssig).
 */
export function afaBuchungsStatus(anlagen: Anlage[], jahr: number, buchungen: AfaBuchungRoh[]): AfaBuchungsStatus {
  const gebucht = new Map<string, AfaBuchungRoh>();
  for (const b of buchungen) {
    if (b.asset_id && jahrVon(b.booking_date) === jahr) gebucht.set(b.asset_id, b);
  }
  const zeilen: AfaBuchungsZeile[] = [];
  for (const a of anlagen) {
    const soll = afaImJahr(a, jahr);
    const b = gebucht.get(a.id);
    const ist = b ? rund(Number(b.amount_net)) : 0;
    if (soll <= 0 && !b) continue;
    const status: AfaBuchungsZeile['status'] =
      !b ? 'offen' : soll <= 0 ? 'ueberfluessig' : Math.abs(ist - soll) < 0.005 ? 'gebucht' : 'abweichend';
    zeilen.push({ anlage: a, soll, ist, buchungId: b?.id ?? null, gesperrt: !!b?.is_locked, status });
  }
  zeilen.sort((x, y) => x.anlage.acquired_on.localeCompare(y.anlage.acquired_on) || x.anlage.name.localeCompare(y.anlage.name));
  const soll = rund(zeilen.reduce((s, z) => s + z.soll, 0));
  const ist = rund(zeilen.reduce((s, z) => s + z.ist, 0));
  const offen = zeilen.filter(z => z.status !== 'gebucht').length;
  const gesperrt = zeilen.filter(z => z.gesperrt).length;
  return { jahr, zeilen, soll, ist, offen, gesperrt, komplett: zeilen.length > 0 && offen === 0 };
}

export type SpiegelZeile = {
  anlage: Anlage;
  buchwertAnfang: number;   // 1.1. (0 bei Zugang im Jahr)
  zugang: number;           // AK bei Zugang im Jahr
  abgang: number;           // AK bei Abgang im Jahr
  afa: number;
  halb: boolean;
  kumulierteAfa: number;    // bis 31.12. bzw. bis zum Abgang
  buchwertEnde: number;     // 31.12. (0 nach Abgang)
  restbuchwertAbgang: number;
  erloes: number;
  abgegangen: boolean;
};

/** Anlagenspiegel je Anlage – Grundlage der Druckseite. Nur Anlagen, die im Jahr vorhanden waren. */
export function anlagenspiegelZeilen(anlagen: Anlage[], jahr: number): { zeilen: SpiegelZeile[]; summe: Anlagenspiegel } {
  const zeilen: SpiegelZeile[] = [];
  for (const a of anlagen) {
    const zugangJahr = jahrVon(a.acquired_on);
    const abgangJahr = a.disposed_on ? jahrVon(a.disposed_on) : null;
    if (zugangJahr > jahr) continue;
    if (abgangJahr !== null && abgangJahr < jahr) continue;
    const kosten = rund(Number(a.cost_net));
    const plan = afaPlan(a);
    const zeile = plan.find(z => z.jahr === jahr);
    const abgegangen = abgangJahr === jahr;
    const buchwertAnfang = zugangJahr === jahr ? 0 : buchwertEndeJahr(a, jahr - 1);
    const buchwertEnde = abgegangen ? 0 : buchwertEndeJahr(a, jahr);
    const restbuchwertAbgang = abgegangen ? (plan[plan.length - 1]?.buchwertEnde ?? kosten) : 0;
    zeilen.push({
      anlage: a,
      buchwertAnfang,
      zugang: zugangJahr === jahr ? kosten : 0,
      abgang: abgegangen ? kosten : 0,
      afa: zeile?.afa ?? 0,
      halb: zeile?.halb ?? false,
      kumulierteAfa: rund(kosten - (abgegangen ? restbuchwertAbgang : buchwertEnde)),
      buchwertEnde,
      restbuchwertAbgang,
      erloes: abgegangen ? rund(Number(a.disposal_proceeds ?? 0)) : 0,
      abgegangen,
    });
  }
  zeilen.sort((x, y) => (x.anlage.asset_group ?? '').localeCompare(y.anlage.asset_group ?? '') || x.anlage.acquired_on.localeCompare(y.anlage.acquired_on) || x.anlage.name.localeCompare(y.anlage.name));
  return { zeilen, summe: anlagenspiegel(anlagen, jahr) };
}
