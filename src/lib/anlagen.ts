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
