// ============================================================
// UVA-Kennzahlen nach dem amtlichen Formular U30
//
// Bisher kannte die Anwendung nur den Steuersatz. Jeder Umsatz mit
// 0 % landete pauschal unter "Steuerfreie Umsätze mit Vorsteuerabzug
// (Kz 011)" – also der Kennzahl für Ausfuhrlieferungen. Damit wurden
// Kleinunternehmerumsätze, innergemeinschaftliche Lieferungen und
// Reverse-Charge-Leistungen alle in dieselbe, falsche Zeile geworfen.
// Innergemeinschaftliche Erwerbe fehlten vollständig.
//
// Das Umsatzsteuer-Kennzeichen beschreibt, WAS für ein Umsatz es ist;
// der Steuersatz sagt nur, WIE VIEL Steuer anfällt. Beides zusammen
// bestimmt die Kennzahl.
// ============================================================

export type UstKennzeichen =
  // ── Ausgangsseite ──────────────────────────────────────────
  | 'normal'                 // steuerpflichtiger Inlandsumsatz
  | 'ausfuhr'                // Ausfuhrlieferung Drittland
  | 'ig_lieferung'           // innergemeinschaftliche Lieferung
  | 'reverse_charge_ausgang' // Steuerschuld geht auf den Empfänger über
  | 'kleinunternehmer'       // § 6 Abs. 1 Z 27 UStG
  | 'unecht_befreit'         // z.B. Arzt, Versicherungsvertreter
  // ── Eingangsseite ──────────────────────────────────────────
  | 'ig_erwerb'              // innergemeinschaftlicher Erwerb
  | 'reverse_charge_eingang';// Steuerschuld nach § 19 UStG

export type Buchungsart = 'income' | 'expense';

export type KennzeichenInfo = {
  wert: UstKennzeichen;
  /** Kurzbezeichnung für Auswahlfelder */
  label: string;
  /** Erklärung, wann man das wählt */
  hilfe: string;
  /** Für welche Buchungsart wählbar */
  fuer: Buchungsart;
  /** Erzwingt diese Art einen bestimmten Steuersatz? */
  satzErzwungen?: 0;
};

export const KENNZEICHEN: KennzeichenInfo[] = [
  {
    wert: 'normal', label: 'Inland – steuerpflichtig', fuer: 'income',
    hilfe: 'Der Normalfall: Leistung an einen österreichischen Kunden mit ausgewiesener Umsatzsteuer.',
  },
  {
    wert: 'reverse_charge_ausgang', label: 'Reverse Charge (EU-Unternehmer)', fuer: 'income', satzErzwungen: 0,
    hilfe: 'Sonstige Leistung an einen Unternehmer im EU-Ausland. Die Steuerschuld geht auf den Empfänger über – zusätzlich ist eine Zusammenfassende Meldung abzugeben.',
  },
  {
    wert: 'ig_lieferung', label: 'Innergemeinschaftliche Lieferung', fuer: 'income', satzErzwungen: 0,
    hilfe: 'Warenlieferung an einen Unternehmer im EU-Ausland mit gültiger UID. Ebenfalls in der Zusammenfassenden Meldung anzugeben.',
  },
  {
    wert: 'ausfuhr', label: 'Ausfuhrlieferung (Drittland)', fuer: 'income', satzErzwungen: 0,
    hilfe: 'Lieferung in ein Land außerhalb der EU. Steuerfrei mit Vorsteuerabzug.',
  },
  {
    wert: 'kleinunternehmer', label: 'Kleinunternehmer (§ 6 Abs. 1 Z 27)', fuer: 'income', satzErzwungen: 0,
    hilfe: 'Umsatz eines Kleinunternehmers. Steuerfrei ohne Vorsteuerabzug.',
  },
  {
    wert: 'unecht_befreit', label: 'Unecht befreit', fuer: 'income', satzErzwungen: 0,
    hilfe: 'Steuerfrei ohne Vorsteuerabzug – z.B. Ärzte, Versicherungsvertreter, Vermietung zu Wohnzwecken an bestimmte Gruppen.',
  },
  {
    wert: 'normal', label: 'Inland – mit Vorsteuer', fuer: 'expense',
    hilfe: 'Der Normalfall: österreichische Eingangsrechnung mit ausgewiesener Umsatzsteuer.',
  },
  {
    wert: 'ig_erwerb', label: 'Innergemeinschaftlicher Erwerb', fuer: 'expense',
    hilfe: 'Wareneinkauf bei einem Unternehmer im EU-Ausland ohne ausgewiesene Steuer. Es entsteht Erwerbsteuer, die zugleich als Vorsteuer abziehbar ist – die Zahllast bleibt dadurch unverändert.',
  },
  {
    wert: 'reverse_charge_eingang', label: 'Reverse Charge (Leistungsempfänger)', fuer: 'expense',
    hilfe: 'Sonstige Leistung eines ausländischen Unternehmers. Die Steuerschuld trifft Sie, ist aber gleichzeitig als Vorsteuer abziehbar.',
  },
];

export function kennzeichenFuer(art: Buchungsart): KennzeichenInfo[] {
  return KENNZEICHEN.filter(k => k.fuer === art);
}

export function kennzeichenInfo(wert: UstKennzeichen, art: Buchungsart): KennzeichenInfo | undefined {
  return KENNZEICHEN.find(k => k.wert === wert && k.fuer === art);
}

// ============================================================
// Zuordnung zu den amtlichen Kennzahlen
// ============================================================

export type KzZeile = {
  /** Amtliche Kennzahl, z.B. "022" */
  kz: string;
  label: string;
  bemessungsgrundlage: number;
  steuer: number;
  /** In welchem Block des Formulars die Zeile steht */
  block: 'umsatz' | 'erwerb' | 'vorsteuer';
};

export type Summenzeile = {
  typ: Buchungsart;
  ust_kennzeichen: UstKennzeichen;
  vat_rate: number;
  bemessungsgrundlage: number;
  steuer: number;
};

/** Kennzahl für einen steuerpflichtigen Inlandsumsatz je Steuersatz. */
function kzFuerSatz(satz: number): { kz: string; label: string } {
  switch (satz) {
    case 20: return { kz: '022', label: '20 % Normalsteuersatz' };
    case 10: return { kz: '029', label: '10 % ermäßigter Steuersatz' };
    case 13: return { kz: '006', label: '13 % ermäßigter Steuersatz' };
    default: return { kz: '000', label: `Steuerpflichtig ${satz} %` };
  }
}

const KZ_UMSATZ: Record<Exclude<UstKennzeichen, 'normal' | 'ig_erwerb' | 'reverse_charge_eingang'>, { kz: string; label: string }> = {
  ausfuhr:                { kz: '011', label: 'Ausfuhrlieferungen' },
  ig_lieferung:           { kz: '017', label: 'Innergemeinschaftliche Lieferungen' },
  reverse_charge_ausgang: { kz: '021', label: 'Steuerschuld geht auf den Leistungsempfänger über' },
  kleinunternehmer:       { kz: '016', label: 'Kleinunternehmer (§ 6 Abs. 1 Z 27)' },
  unecht_befreit:         { kz: '020', label: 'Steuerfrei ohne Vorsteuerabzug' },
};

/**
 * Amtliche Kennzahl einer einzelnen Buchung – für Exporte, in denen
 * jede Zeile ihre Kennzahl mitführen soll (z.B. BMD).
 *
 * Auf der Eingangsseite gibt es je Buchung zwei Kennzahlen (Steuerschuld
 * und Vorsteuer); zurückgegeben wird die des Umsatz- bzw. Erwerbsblocks,
 * weil sie den Umsatz beschreibt.
 */
export function uvaKennzahlFuer(
  typ: Buchungsart,
  kennzeichen: UstKennzeichen | null | undefined,
  satz: number,
): string {
  const kzn = kennzeichen ?? 'normal';

  if (typ === 'income') {
    if (kzn === 'normal') return kzFuerSatz(Number(satz) || 0).kz;
    if (kzn in KZ_UMSATZ) return KZ_UMSATZ[kzn as keyof typeof KZ_UMSATZ].kz;
    return '000';
  }

  if (kzn === 'ig_erwerb')              return Number(satz) === 10 ? '073' : '072';
  if (kzn === 'reverse_charge_eingang') return '057';
  return '060';
}

export type UvaAufstellung = {
  /** Block 1: Lieferungen und sonstige Leistungen */
  umsatz: KzZeile[];
  /** Block 2: Innergemeinschaftliche Erwerbe und Steuerschuld nach § 19 */
  erwerb: KzZeile[];
  /** Block 3: Abziehbare Vorsteuer */
  vorsteuer: KzZeile[];
  /** Kz 000 – Summe der Bemessungsgrundlagen */
  gesamtBemessungsgrundlage: number;
  /** Summe der geschuldeten Umsatzsteuer inkl. Erwerbsteuer */
  gesamtUst: number;
  /** Kz 060 – Summe der abziehbaren Vorsteuer */
  gesamtVorsteuer: number;
  /** Kz 095 – Zahllast (positiv) oder Gutschrift (negativ) */
  zahllast: number;
};

/**
 * Rechnet die je Buchungsart, Kennzeichen und Steuersatz vorsummierten
 * Zeilen in die amtlichen Kennzahlen um.
 *
 * Beim innergemeinschaftlichen Erwerb und beim Reverse Charge auf der
 * Eingangsseite entsteht eine Steuerschuld, die im selben Zeitraum als
 * Vorsteuer abziehbar ist. Beide Beträge werden deshalb gesetzt – sie
 * heben einander in der Zahllast auf, müssen aber getrennt gemeldet
 * werden.
 */
export function baueUvaAufstellung(zeilen: Summenzeile[]): UvaAufstellung {
  const umsatz    = new Map<string, KzZeile>();
  const erwerb    = new Map<string, KzZeile>();
  const vorsteuer = new Map<string, KzZeile>();

  const addiere = (
    ziel: Map<string, KzZeile>, kz: string, label: string,
    block: KzZeile['block'], bgl: number, steuer: number,
  ) => {
    const vorhanden = ziel.get(kz);
    if (vorhanden) {
      vorhanden.bemessungsgrundlage += bgl;
      vorhanden.steuer += steuer;
    } else {
      ziel.set(kz, { kz, label, block, bemessungsgrundlage: bgl, steuer });
    }
  };

  for (const z of zeilen) {
    const bgl    = Number(z.bemessungsgrundlage) || 0;
    const steuer = Number(z.steuer) || 0;
    const satz   = Number(z.vat_rate) || 0;
    const kzn    = z.ust_kennzeichen ?? 'normal';

    if (z.typ === 'income') {
      if (kzn === 'normal') {
        const { kz, label } = kzFuerSatz(satz);
        addiere(umsatz, kz, label, 'umsatz', bgl, steuer);
      } else if (kzn in KZ_UMSATZ) {
        const { kz, label } = KZ_UMSATZ[kzn as keyof typeof KZ_UMSATZ];
        // Diese Umsätze sind steuerfrei bzw. die Steuer schuldet ein
        // anderer – die Bemessungsgrundlage zählt, die Steuer nicht.
        addiere(umsatz, kz, label, 'umsatz', bgl, 0);
      }
      continue;
    }

    // ── Eingangsseite ──────────────────────────────────────────
    if (kzn === 'ig_erwerb') {
      addiere(erwerb, '070', 'Innergemeinschaftliche Erwerbe', 'erwerb', bgl, 0);
      const erwerbsteuer = steuer || Math.round(bgl * satz) / 100;
      const kzSteuer = satz === 10 ? '073' : '072';
      const labelSteuer = satz === 10
        ? 'Erwerbe zum ermäßigten Satz 10 %'
        : 'Erwerbe zum Normalsteuersatz 20 %';
      addiere(erwerb, kzSteuer, labelSteuer, 'erwerb', bgl, erwerbsteuer);
      addiere(vorsteuer, '065', 'Vorsteuer aus innergemeinschaftlichem Erwerb', 'vorsteuer', bgl, erwerbsteuer);
      continue;
    }

    if (kzn === 'reverse_charge_eingang') {
      const rcSteuer = steuer || Math.round(bgl * satz) / 100;
      addiere(erwerb, '057', 'Steuerschuld gemäß § 19 (Leistungsempfänger)', 'erwerb', bgl, rcSteuer);
      addiere(vorsteuer, '066', 'Vorsteuer betreffend die Steuerschuld gemäß § 19', 'vorsteuer', bgl, rcSteuer);
      continue;
    }

    // normal
    addiere(vorsteuer, '060', 'Abziehbare Vorsteuer (Inland)', 'vorsteuer', bgl, steuer);
  }

  const reihen = (m: Map<string, KzZeile>) =>
    Array.from(m.values()).sort((a, b) => a.kz.localeCompare(b.kz));

  const umsatzZeilen    = reihen(umsatz);
  const erwerbZeilen    = reihen(erwerb);
  const vorsteuerZeilen = reihen(vorsteuer);

  const gesamtBemessungsgrundlage = umsatzZeilen.reduce((s, z) => s + z.bemessungsgrundlage, 0);
  // Erwerbe zählen bei KZ 070 und der Steuerzeile mit derselben
  // Bemessungsgrundlage – für Kz 000 zählt nur die Umsatzseite.
  const gesamtUst = umsatzZeilen.reduce((s, z) => s + z.steuer, 0)
                  + erwerbZeilen.reduce((s, z) => s + z.steuer, 0);
  const gesamtVorsteuer = vorsteuerZeilen.reduce((s, z) => s + z.steuer, 0);

  return {
    umsatz: umsatzZeilen,
    erwerb: erwerbZeilen,
    vorsteuer: vorsteuerZeilen,
    gesamtBemessungsgrundlage: Math.round(gesamtBemessungsgrundlage * 100) / 100,
    gesamtUst: Math.round(gesamtUst * 100) / 100,
    gesamtVorsteuer: Math.round(gesamtVorsteuer * 100) / 100,
    zahllast: Math.round((gesamtUst - gesamtVorsteuer) * 100) / 100,
  };
}
