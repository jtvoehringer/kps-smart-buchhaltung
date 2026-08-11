> ## ⚠️ Status: NICHT UMGESETZT (Stand 11.08.2026)
>
> Dieses Dokument ist ein **Entwurf**, kein Bericht über den Ist-Zustand.
> Nichts davon existiert in der Anwendung:
>
> - Es gibt **keine** Tabelle `dauerauftraege`, keine Typen
>   `dauerauftrag_intervall` / `dauerauftrag_typ`.
> - Es gibt **kein** Modul `src/lib/dauerauftraege/`.
> - Rechnungen werden **nicht** automatisch erzeugt und **nicht**
>   automatisch versendet.
>
> **Was tatsächlich existiert**, ist etwas anderes und wird leicht
> damit verwechselt: `recurring_transactions` (Migration 001) legt
> wiederkehrende **Buchungen** an – nicht Rechnungen. Die Oberfläche
> dazu liegt unter `/dauerauftraege`, ausgelöst wird sie vom Cron-Job
> aus Migration 002 über `process_recurring_transactions()`.
>
> Wer diese Spec als Beschreibung des Bestands liest, sucht danach
> lange nach Code, den es nicht gibt. Der Entwurf selbst bleibt hier
> erhalten – als Plan, nicht als Dokumentation.

---

# Feature-Spec: Automatische Dauerauftragsrechnungen

**Stand:** Mai 2026 | **Autor:** IC&P Consultants e.U.  
**Projekte:** KPS Smart Buchhaltung · Software:112  
**Ziel:** Wiederkehrende Rechnungen (jährlich, monatlich, quartalsweise) vollautomatisch erstellen und versenden — ohne manuellen Eingriff.

---

## 1. Überblick

### Anwendungsfälle

| Anwendungsfall | Projekt | Intervall | Beschreibung |
|---|---|---|---|
| KPS → Klienten | KPS Smart Buchhaltung | jährlich | KPS stellt Klienten die Jahresnutzung in Rechnung |
| IC&P → KPS | KPS Smart Buchhaltung | monatlich | Jörgis Honorarrechnung an KPS |
| Software:112 | Software:112 | konfigurierbar | Beliebige Daueraufträge je Mandant |

### Kernprinzipien

- **Zero-Touch-Betrieb:** Nach Einrichtung läuft alles automatisch — kein manuelles Eingreifen
- **Volle Transparenz:** Jede erstellte Rechnung erscheint im normalen Rechnungsprotokoll
- **Fehlerresilienz:** Fehler werden geloggt und gemeldet, aber nicht still verschluckt
- **Shared Module:** Dauerauftrag-Logik ist ein gemeinsames Modul für beide Projekte (`src/lib/dauerauftraege/`)

---

## 2. Datenbankschema (Supabase)

### 2.1 Tabelle `dauerauftraege`

```sql
CREATE TYPE dauerauftrag_intervall AS ENUM (
  'monatlich',
  'quartalsweise',
  'halbjaehrlich',
  'jaehrlich'
);

CREATE TYPE dauerauftrag_typ AS ENUM (
  'klienten_nutzung',   -- KPS → Klient
  'icp_honorar',        -- IC&P → KPS (Eigenrechnung)
  'sonstige'
);

CREATE TABLE dauerauftraege (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id            UUID NOT NULL REFERENCES mandanten(id) ON DELETE CASCADE,
  typ                   dauerauftrag_typ NOT NULL DEFAULT 'klienten_nutzung',
  bezeichnung           TEXT NOT NULL,           -- z.B. "KPS Smart Buchhaltung – Jahresnutzung"
  betrag_netto          NUMERIC(10,2) NOT NULL,
  waehrung              CHAR(3) NOT NULL DEFAULT 'EUR',
  ust_prozent           NUMERIC(4,1) NOT NULL DEFAULT 20.0,
  intervall             dauerauftrag_intervall NOT NULL,
  faelligkeit_tag       SMALLINT NOT NULL CHECK (faelligkeit_tag BETWEEN 1 AND 31),
  faelligkeit_monat     SMALLINT CHECK (faelligkeit_monat BETWEEN 1 AND 12),
  -- NULL bei monatlich/quartalsweise; Pflicht bei jaehrlich/halbjaehrlich
  vorschuss             BOOLEAN NOT NULL DEFAULT TRUE,
  -- TRUE = Rechnung wird VOR Beginn der Periode ausgestellt
  -- FALSE = Rechnung wird NACH Ende der Periode ausgestellt
  versand_tage_offset   SMALLINT NOT NULL DEFAULT 0,
  -- Tage vor (positiv) oder nach (negativ) dem Fälligkeitstag senden
  rechnungsvorlage_id   UUID REFERENCES rechnungsvorlagen(id),
  leistungszeitraum_text TEXT,                   -- z.B. "Jänner–Dezember {JAHR}"
  notizen               TEXT,
  aktiv                 BOOLEAN NOT NULL DEFAULT TRUE,
  letzte_erstellung     DATE,                    -- Datum der letzten Rechnungserstellung
  naechste_erstellung   DATE NOT NULL,           -- Vorberechnet, für effiziente Cron-Abfrage
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index für den täglichen Cron-Check
CREATE INDEX idx_dauerauftraege_naechste 
  ON dauerauftraege(naechste_erstellung) 
  WHERE aktiv = TRUE;

-- RLS
ALTER TABLE dauerauftraege ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Nur eigene Kanzlei" ON dauerauftraege
  USING (
    mandant_id IN (
      SELECT id FROM mandanten WHERE kanzlei_id = auth.jwt() ->> 'kanzlei_id'
    )
  );
```

### 2.2 Tabelle `dauerauftrag_log`

```sql
CREATE TYPE dauerauftrag_log_status AS ENUM (
  'erstellt',
  'versendet',
  'fehler',
  'uebersprungen'   -- z.B. wenn Mandant inaktiv
);

CREATE TABLE dauerauftrag_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dauerauftrag_id     UUID NOT NULL REFERENCES dauerauftraege(id),
  rechnung_id         UUID REFERENCES rechnungen(id),  -- NULL bei Fehler
  periode_von         DATE NOT NULL,
  periode_bis         DATE NOT NULL,
  status              dauerauftrag_log_status NOT NULL,
  fehler_details      TEXT,
  versand_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dauerauftrag_log_dauerauftrag 
  ON dauerauftrag_log(dauerauftrag_id, created_at DESC);
```

### 2.3 Fälligkeitsberechnung (DB-Funktion)

```sql
CREATE OR REPLACE FUNCTION berechne_naechste_erstellung(
  p_intervall        dauerauftrag_intervall,
  p_faelligkeit_tag  SMALLINT,
  p_faelligkeit_monat SMALLINT,
  p_ab_datum         DATE DEFAULT CURRENT_DATE
) RETURNS DATE LANGUAGE plpgsql AS $$
DECLARE
  naechstes_datum DATE;
BEGIN
  CASE p_intervall
    WHEN 'monatlich' THEN
      -- Nächster p_faelligkeit_tag im laufenden oder nächsten Monat
      naechstes_datum := date_trunc('month', p_ab_datum) 
                         + (p_faelligkeit_tag - 1) * INTERVAL '1 day';
      IF naechstes_datum <= p_ab_datum THEN
        naechstes_datum := naechstes_datum + INTERVAL '1 month';
      END IF;

    WHEN 'quartalsweise' THEN
      -- Nächstes Quartal an p_faelligkeit_tag
      naechstes_datum := date_trunc('quarter', p_ab_datum) 
                         + (p_faelligkeit_tag - 1) * INTERVAL '1 day';
      IF naechstes_datum <= p_ab_datum THEN
        naechstes_datum := naechstes_datum + INTERVAL '3 months';
      END IF;

    WHEN 'jaehrlich' THEN
      -- p_faelligkeit_tag.p_faelligkeit_monat im laufenden oder nächsten Jahr
      naechstes_datum := make_date(
        EXTRACT(YEAR FROM p_ab_datum)::INT,
        p_faelligkeit_monat,
        LEAST(p_faelligkeit_tag,
          DATE_PART('days', 
            date_trunc('month', make_date(
              EXTRACT(YEAR FROM p_ab_datum)::INT, p_faelligkeit_monat, 1
            ) + INTERVAL '1 month' - INTERVAL '1 day'
          ))::INT)
      );
      IF naechstes_datum <= p_ab_datum THEN
        naechstes_datum := naechstes_datum + INTERVAL '1 year';
      END IF;
  END CASE;

  -- Monatsende-Korrektur (z.B. 31. Feb → letzter Februartag)
  RETURN LEAST(naechstes_datum,
    (date_trunc('month', naechstes_datum) + INTERVAL '1 month - 1 day')::DATE);
END;
$$;
```

---

## 3. Scheduler-Logik (Vercel Cron)

### 3.1 Cron-Konfiguration (`vercel.json`)

```json
{
  "crons": [
    {
      "path": "/api/cron/dauerauftraege",
      "schedule": "0 5 * * *"
    }
  ]
}
```

Läuft täglich um **05:00 UTC** (= 06:00 / 07:00 MEZ/MESZ) — bevor Nutzer den Arbeitstag beginnen.

### 3.2 Endpoint (`src/app/api/cron/dauerauftraege/route.ts`)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verarbeiteFaelligeDauerauftraege } from '@/lib/dauerauftraege/verarbeitung';

export const maxDuration = 300; // 5 Minuten Timeout

export async function POST(req: NextRequest) {
  // Absicherung: Nur Vercel Cron oder Admin darf aufrufen
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date().toISOString().split('T')[0];
  const supabase = createClient();

  // Alle fälligen aktiven Daueraufträge laden
  const { data: faellige, error } = await supabase
    .from('dauerauftraege')
    .select(`
      *,
      mandanten (
        id, name, email, uid_nummer, 
        adresse_strasse, adresse_plz, adresse_ort
      )
    `)
    .eq('aktiv', true)
    .lte('naechste_erstellung', today);

  if (error) {
    await benachrichtigeAdmin('Cron-Fehler: Daueraufträge laden', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ergebnisse = await verarbeiteFaelligeDauerauftraege(faellige ?? []);

  return NextResponse.json({
    datum: today,
    verarbeitet: ergebnisse.length,
    erfolgreich: ergebnisse.filter(e => e.status === 'versendet').length,
    fehler: ergebnisse.filter(e => e.status === 'fehler').length,
  });
}
```

### 3.3 Verarbeitungslogik (`src/lib/dauerauftraege/verarbeitung.ts`)

```typescript
export async function verarbeiteFaelligeDauerauftraege(
  dauerauftraege: DauerauftragMitMandant[]
): Promise<DauerauftragErgebnis[]> {
  const ergebnisse: DauerauftragErgebnis[] = [];

  for (const da of dauerauftraege) {
    try {
      // 1. Duplikatschutz: Bereits für diese Periode erstellt?
      const bereitsErstellt = await pruefeLetztePeriode(da);
      if (bereitsErstellt) {
        await logEintrag(da.id, null, 'uebersprungen', 'Für diese Periode bereits erstellt');
        continue;
      }

      // 2. Leistungszeitraum berechnen
      const { von, bis } = berechneLeistungszeitraum(da);

      // 3. Rechnung erstellen (nutzt bestehendes Rechnungsmodul)
      const rechnung = await erstelleRechnung({
        mandant_id: da.mandant_id,
        bezeichnung: da.bezeichnung.replace('{JAHR}', String(von.getFullYear())),
        betrag_netto: da.betrag_netto,
        ust_prozent: da.ust_prozent,
        leistungszeitraum_von: von,
        leistungszeitraum_bis: bis,
        dauerauftrag_id: da.id,
      });

      // 4. PDF generieren & per E-Mail versenden
      await versendeRechnung(rechnung, da.mandanten);

      // 5. Log + naechste_erstellung voraussetzen
      await aktualisiereNaechsteErstellung(da);
      await logEintrag(da.id, rechnung.id, 'versendet');

      ergebnisse.push({ dauerauftrag_id: da.id, status: 'versendet', rechnung_id: rechnung.id });

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logEintrag(da.id, null, 'fehler', msg);
      await benachrichtigeAdmin(`Dauerauftrag ${da.id} fehlgeschlagen`, msg);
      ergebnisse.push({ dauerauftrag_id: da.id, status: 'fehler', fehler: msg });
    }
  }

  return ergebnisse;
}
```

### 3.4 Fehlerbehandlung & Retry

| Situation | Verhalten |
|---|---|
| Rechnungserstellung schlägt fehl | Fehler in `dauerauftrag_log`, Admin-E-Mail, `naechste_erstellung` bleibt unverändert → Retry am Folgetag |
| E-Mail-Versand schlägt fehl | Rechnung ist erstellt, nur Versand fehlgeschlagen → separater Retry-Endpoint |
| Mandant inaktiv | Status `uebersprungen`, keine Benachrichtigung |
| Doppelter Aufruf (Cron-Overlap) | Duplikatschutz via `dauerauftrag_log` — selbe Periode wird nicht zweimal erstellt |
| Ungültiger Betrag (0,00 €) | Validierung vor Erstellung, Fehler-Log |

---

## 4. UI/UX-Spezifikation

### 4.1 Dauerauftrag-Konfiguration beim Mandanten

Im Mandanten-Formular (Anlage und Bearbeitung) gibt es eine eigene Sektion **„Automatische Rechnungsstellung"**:

```
┌─ Automatische Rechnungsstellung ──────────────────────────────┐
│                                                               │
│  [✓] Dauerauftrag aktiv                                       │
│                                                               │
│  Bezeichnung:  [KPS Smart Buchhaltung – Jahresnutzung      ]  │
│  Betrag (netto): [________] EUR    USt: [20 %  ▼]            │
│                                                               │
│  Intervall: ( ) monatlich  (•) jährlich  ( ) quartalsweise    │
│                                                               │
│  Fälligkeit:  Tag [  1]  Monat [Jänner ▼]  (bei jährlich)    │
│                                                               │
│  Rechnungsstellung: (•) vorschüssig  ( ) nachschüssig        │
│  Versand [  0] Tage vor/nach dem Fälligkeitstag              │
│                                                               │
│  Leistungszeitraum-Text:                                      │
│  [Jänner–Dezember {JAHR}                               ]      │
│                                                               │
│  ──────────────────────────────────────────────────────────   │
│  Vorschau: Nächste Rechnung wird erstellt am 01. Jänner 2027  │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

**Formularregeln:**
- `faelligkeit_monat` wird nur angezeigt bei Intervall `jährlich` oder `halbjährlich`
- Vorschau berechnet sich live aus den eingegebenen Werten
- Betrag > 0 ist Pflichtfeld wenn Dauerauftrag aktiv
- Änderungen am Betrag gelten ab der **nächsten** Rechnung, nie rückwirkend

### 4.2 Dauerauftrag-Übersicht (Admin-Ansicht)

Route: `/dauerauftraege` (KPS-interner Bereich)

```
┌─ Daueraufträge ──────────────────────────────────────────────────────────┐
│                                                                          │
│  [Alle] [Aktiv] [Mit Fehlern]          Suche: [_____________]           │
│                                                                          │
│  Mandant             Bezeichnung         Intervall  Nächste     Status   │
│  ─────────────────────────────────────────────────────────────────────  │
│  Muster GmbH         Jahresnutzung       jährlich   01.01.2027  ✓ aktiv │
│  Test KG             Jahresnutzung       jährlich   01.01.2027  ✓ aktiv │
│  Fehler OHG          Jahresnutzung       jährlich   23.05.2026  ✗ Fehler│
│                                                                          │
│  IC&P Consultants    Honorar Mai 2026    monatlich  01.06.2026  ✓ aktiv │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

- Klick auf Zeile → Detail mit Log-Einträgen (alle erstellten Rechnungen + Fehler)
- „Jetzt ausführen"-Button für manuelle Auslösung (mit Bestätigungsdialog)
- Fehler-Zeilen werden rot hervorgehoben

### 4.3 IC&P Eigenrechnung (Jörgen → KPS)

Sonderfall: IC&P ist selbst als **„interner Rechnungsempfänger"** angelegt — ein eigener Mandanten-Eintrag der KPS mit Typ `icp_honorar`. Dadurch gelten exakt dieselben Mechanismen:

- Monatlich, Tag 1
- Betrag = monatliche Plattformgebühr (in Mandanten-Einstellungen konfiguriert)
- Rechnung geht an KPS-E-Mail-Adresse
- Erscheint im normalen Rechnungsprotokoll der App

**Vorteil:** Keine Sonderlogik nötig — IC&P-Rechnung ist einfach ein Dauerauftrag wie jeder andere.

---

## 5. Rechnungsinhalt & Templates

### 5.1 Automatisch befüllte Felder

| Feld | Quelle |
|---|---|
| Rechnungsempfänger | Mandantenstammdaten |
| UID-Nummer Empfänger | Mandantenstammdaten (Reverse Charge wenn vorhanden) |
| Rechnungsnummer | Fortlaufend aus Rechnungsmodul |
| Rechnungsdatum | Datum der Cron-Ausführung |
| Leistungsdatum/-zeitraum | Berechnet aus Intervall + `{JAHR}`-Platzhalter |
| Betrag netto / brutto | Aus Dauerauftrag |
| Zahlungsziel | Kanzlei-Standard (z.B. 14 Tage) |

### 5.2 Platzhalter in Textfeldern

| Platzhalter | Ersetzt durch |
|---|---|
| `{JAHR}` | Leistungsjahr (z.B. `2027`) |
| `{MONAT}` | Leistungsmonat ausgeschrieben (z.B. `Juni`) |
| `{QUARTAL}` | Quartal (z.B. `Q2 2027`) |
| `{MANDANT}` | Firmenname des Mandanten |
| `{ZEITRAUM}` | Von–Bis-Datumsbereich |

---

## 6. Edge Cases

| Fall | Behandlung |
|---|---|
| 31. Feb / 30. Feb | Automatisch auf letzten Monatstag korrigiert (DB-Funktion) |
| Fälligkeitstag ist Samstag/Sonntag | Rechnung wird **am selben Tag** erstellt (keine Verschiebung — österr. Feiertage nicht implementiert in MVP) |
| Mandant hat keine E-Mail | Validierungsfehler beim Speichern des Dauerauftrags, Aktivierung gesperrt |
| Betrag ändert sich mid-year | Manuell im Dauerauftrag ändern → gilt ab nächster Rechnung |
| Mandant wird gelöscht | `ON DELETE CASCADE` löscht Dauerauftrag + Log |
| Cron läuft mehrfach (race condition) | Duplikatschutz: Prüfung in `dauerauftrag_log` ob Periode bereits erstellt |
| Vercel Timeout (>5 Min) | Maximal 300 Daueraufträge pro Lauf; bei >300 Mandanten: Batching implementieren |

---

## 7. Umgebungsvariablen

```env
# Cron-Absicherung
CRON_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx

# Admin-Benachrichtigung bei Fehlern
ADMIN_EMAIL=jv@icp-consultants.at

# (bereits vorhanden)
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

---

## 8. Phasenplan

| Schritt | Aufwand | Wann |
|---|---|---|
| DB-Migration (`dauerauftraege` + `dauerauftrag_log`) | 0,5 Tage | Phase 2, Beginn |
| Shared Library `src/lib/dauerauftraege/` | 1 Tag | Phase 2 |
| UI: Dauerauftrag-Sektion im Mandanten-Formular | 1 Tag | Phase 2 |
| Vercel Cron + API-Endpoint | 0,5 Tage | Phase 2 |
| Admin-Übersicht `/dauerauftraege` | 1 Tag | Phase 2 |
| IC&P Eigenrechnung (Sondermandant anlegen) | 0,5 Tage | Phase 2 |
| Integration Software:112 (shared lib einbinden) | 0,5 Tage | Software:112 Phase 1 |
| **Gesamt** | **~5 Tage** | |

---

## 9. Abgrenzung zu Chargebee

Das Dauerauftrag-Modul ersetzt Chargebee **für die Rechnungserstellung und den Versand**. Chargebee bleibt relevant sobald KPS auch den **automatischen Einzug per SEPA** benötigt:

| Funktion | Dauerauftrag-Modul | Chargebee |
|---|---|---|
| Rechnung automatisch erstellen | ✓ | ✓ |
| Rechnung per E-Mail versenden | ✓ | ✓ |
| SEPA-Mandat verwalten | ✗ | ✓ |
| Automatischer Bankeinzug | ✗ | ✓ |
| Dunning (Mahnwesen) | manuell | ✓ automatisch |
| MRR/ARR-Reporting | ✗ | ✓ |

**Empfehlung:** Dauerauftrag-Modul in Phase 2 → Chargebee optional in Phase 3+ wenn aktiver Einzug gewünscht.

---

*Dokument erstellt mit KPS Smart Buchhaltung – IC&P Consultants e.U.*
