# KPS Smart Buchhaltung – Entwicklungspfad

**IC&P Consultants e.U. × KPS Partner GmbH**
Stand: Mai 2026 · Internes Dokument

---

## Überblick

KPS Smart Buchhaltung ist eine maßgeschneiderte Web-Applikation für die digitale Einnahmen-Ausgaben-Rechnung (EAR) österreichischer KPS-Klienten. Die Anwendung ergänzt die bestehende KPS-Infrastruktur (BMD, mykps-online) und ist vollständig DSGVO-konform in der EU (Frankfurt) gehostet.

Das System ist als **iterativer Entwicklungspfad** in vier Phasen aufgebaut. Jede Phase erweitert den Funktionsumfang auf Basis von Klientenfeedback und Kanzleibedarf.

---

## Phase 1 – Fundament ✅ abgeschlossen

**Zeitraum:** März – Mai 2026
**Status:** Produktionsbereit

### Was gebaut wurde

**Infrastruktur & Authentifizierung**
- Next.js 14 App Router mit TypeScript
- Supabase (PostgreSQL + Auth + RLS) – EU-Hosting Frankfurt
- Vercel Deployment mit CI/CD
- Row Level Security – jeder Klient sieht nur seine eigenen Daten
- Passwort-Reset via E-Mail

**Klientenbereich**
- Dashboard mit Jahresübersicht (Einnahmen / Ausgaben / USt-Saldo monatlich)
- Buchungsliste mit Filter, Suche und Pagination
- Buchung erfassen (Einnahme & Ausgabe, Brutto- und Nettomodus)
- Buchung bearbeiten und löschen
- Einstellungen (Firmendaten, Buchungsmodus)
- Jahreswechsel im Dashboard
- Responsive Darstellung (Desktop + Mobile)

**Kanzleibereich**
- Kanzlei-Dashboard mit Mandantenübersicht und Auswertungen
- Mandanten anlegen + Benutzer per E-Mail einladen
- Rollenkonzept: klient / kanzlei / admin

**Technische Qualität**
- KPS Corporate Design (Farben, Logo, Typografie)
- Sidebar-Navigation mit aktiven Zustandsanzeigen
- Autocomplete-Attribute (Bitdefender-kompatibel)

---

## Phase 2 – Steuerliche Kernfunktionen 🔜 nächste Priorität

**Ziel:** Vollständige EAR-Unterstützung inkl. UVA und Belege

### 2.1 UVA (Umsatzsteuervoranmeldung)

Automatische Berechnung der Umsatzsteuervoranmeldung auf Basis der erfassten Buchungen.

- Quartalsbericht (Jänner–März, April–Juni, Juli–September, Oktober–Dezember)
- Anzeige UVA-Zahllast / Überschuss
- Exportfunktion als PDF für Kanzlei-Übergabe
- Vorbelegung nach Steuersätzen (0%, 10%, 13%, 20%)
- Abgabefrist-Anzeige (15. des zweitfolgenden Monats)

**Aufwand:** ~3–4 Tage Entwicklung

### 2.2 Daueraufträge / Wiederkehrende Buchungen

Verwaltung von regelmäßigen Ausgaben und Einnahmen (Miete, Abos, Leasingrate etc.).

- Anlegen mit Rhythmus: monatlich / quartalsweise / jährlich
- Automatische Erzeugung der Buchung am Fälligkeitstag (via Supabase Cron)
- Übersicht und Deaktivierung
- Warnung bei fehlenden Buchungen

**Aufwand:** ~2–3 Tage Entwicklung

### 2.3 Belegverwaltung (Dokumenten-Upload)

Fotos und PDFs direkt zu Buchungen hinterlegen – als digitaler Beleg.

- Upload von Foto/PDF pro Buchung (Supabase Storage)
- Anzeige im Bearbeitungsformular
- Thumbnails in der Buchungsliste
- Automatisches Löschen bei Buchungslöschung
- Max. 10 MB pro Datei, DSGVO-konformes Hosting

**Aufwand:** ~2 Tage Entwicklung

### 2.4 CSV/Excel-Export

- Buchungsliste als CSV exportieren (kompatibel mit Excel, BMD-Import)
- Gefilterte Exporte (Zeitraum, Typ, Steuersatz)
- Jahresabschluss-Export für Steuerberater

**Aufwand:** ~1 Tag Entwicklung

---

## Phase 3 – Digitale Integration 📅 Q3/Q4 2026

**Ziel:** Verbindung mit bestehenden KPS-Systemen und österreichischen Behördenportalen

### 3.1 Bankkonto-Import (CAMT.053 / CSV)

- Import von Kontoauszügen (CAMT.053 XML oder CSV-Export der Bank)
- Automatischer Abgleich mit offenen Buchungen
- Halbautomatische Kategorisierung (KI-gestützt)
- Unterstützte Banken: Erste Bank, Raiffeisen, Bank Austria, BAWAG

**Aufwand:** ~4–5 Tage Entwicklung + Testphase

### 3.2 E-Rechnung (EN 16931 / Peppol)

Ab 2025 ist in Österreich die strukturierte E-Rechnung für B2G verpflichtend; B2B folgt.

- Eingangsrechnungen einlesen (XML, PDF mit ZUGFeRD)
- Direktes Erfassen als Buchung aus E-Rechnung
- Ausgangsrechnungen als einfache Belege erstellen (PDF-Export)
- Vorbereitung für Peppol-Anbindung

**Aufwand:** ~5–6 Tage Entwicklung

### 3.3 BMD-Schnittstelle (KPS intern)

Direkter Datenaustausch mit dem BMD-System der Kanzlei.

- Export als BMD-NTCS-kompatibles Format
- Automatische Übertragung fertiggestellter Perioden
- Status-Anzeige in der Kanzlei-Oberfläche ("übergeben" / "in Bearbeitung")

**Aufwand:** ~4–5 Tage Entwicklung (abhängig von BMD API-Zugang)

### 3.4 OCR – Automatische Belegverarbeitung

Belege einscannen oder fotografieren → automatische Datenerkennung.

- Erkennung: Betrag, Datum, Lieferant, Steuersatz
- Vorausfüllung des Buchungsformulars
- Manuelle Korrektur vor Speicherung
- Integration: Google Document AI oder AWS Textract

**Aufwand:** ~3–4 Tage Entwicklung + KI-Kosten (~€0,01/Dokument)

---

## Phase 4 – Skalierung & Vollautomatisierung 📅 2027

**Ziel:** KPS Smart Buchhaltung als vollständige EAR-Plattform für alle KPS-Klienten

### 4.1 Multi-Mandanten-Skalierung

Das System ist bereits mandantenfähig. Diese Phase optimiert Kanzlei-Workflows:

- Masseneinladung von Klienten (CSV-Import)
- Kanzlei-Kalender: offene Übergaben, UVA-Fristen, Jahresabschlüsse
- Kanzlei-Notizen pro Mandant
- Rollenbasierte Benachrichtigungen (Fälligkeit, Übergabe-Erinnerung)
- Kanzlei-Branding je Mandant (Custom Domain optional)

### 4.2 Mobile App (Progressive Web App)

Vollständige Mobile-Nutzung ohne App Store:

- Installierbar auf iOS und Android (PWA)
- Foto-Upload direkt aus Kamera (Belege sofort erfassen)
- Offline-Fähigkeit für Grundfunktionen (Buchungen erfassen, auch ohne Internet)
- Push-Benachrichtigungen (Fälligkeiten, Kanzlei-Nachrichten)

### 4.3 KI-gestützte Auswertungen

- Automatische Kategorieerkennung bei neuen Buchungen (lernend)
- Liquiditätsprognose: Vorschau der nächsten 3 Monate
- Anomalie-Erkennung: ungewöhnliche Buchungen werden markiert
- Vergleich Vorjahr / Vorquartal mit Kommentar

### 4.4 Finanzamt-Direktanbindung (FinanzOnline)

- Direktübermittlung der UVA via FinanzOnline-API (Webservice)
- Bestätigungsprotokoll als PDF
- Fehlerbehandlung und automatische Wiederholung
- Voraussetzung: FinanzOnline Webservice-Registrierung der Kanzlei

### 4.5 Erweiterung auf Doppelte Buchführung (optional)

Für wachsende Klienten, die von EAR auf Bilanzierung wechseln:

- Kontenplan (SKR 07 / österreichischer Standard)
- Debitoren- und Kreditorenverwaltung
- Jahresabschluss-Assistent
- Übergabe an KPS Kanzleisystem

---

## Technische Roadmap

| Bereich | Jetzt | Phase 2 | Phase 3 | Phase 4 |
|---|---|---|---|---|
| **Hosting** | Vercel + Supabase (EU) | = | = | ggf. dedizierte Instanz |
| **Datenbank** | PostgreSQL (Supabase) | + Supabase Storage | + CAMT-Import | + Analyse-Layer |
| **Auth** | E-Mail / Passwort | + Magic Link | + SSO (optional) | + 2FA |
| **Export** | – | CSV, PDF | BMD-Format | FinanzOnline |
| **Mobile** | Responsive Web | PWA-Vorbereitung | = | PWA + Push |
| **KI** | – | – | OCR | Kategorisierung, Prognose |

---

## Kosten- und Zeitschätzung

### Phase 2 (Empfehlung: sofort starten)

| Feature | Entwicklungstage | Priorität |
|---|---|---|
| UVA-Bericht | 3–4 Tage | Sehr hoch |
| Daueraufträge | 2–3 Tage | Hoch |
| Belegverwaltung | 2 Tage | Hoch |
| CSV-Export | 1 Tag | Mittel |
| **Gesamt Phase 2** | **~10 Tage** | |

### Laufende Betriebskosten (Phase 1, monatlich)

| Dienst | Plan | Kosten |
|---|---|---|
| Vercel | Hobby / Pro | € 0 – 20/Monat |
| Supabase | Free / Pro | € 0 – 25/Monat |
| **Gesamt** | | **€ 0 – 45/Monat** |

Bis ca. 40 aktive Klienten: Free-Tier ausreichend.
Ab ~40 Klienten: Supabase Pro (€25/Monat) empfohlen.

---

## Nächste empfohlene Schritte

1. **Sofort:** UVA-Funktion bauen (höchster steuerlicher Nutzen für Klienten)
2. **Parallel:** Belegverwaltung (Upload) – sehr häufige Klientenanfrage
3. **In 4–6 Wochen:** Daueraufträge – reduziert manuelle Buchungsarbeit
4. **Q3 2026:** Bankkonto-Import planen und testen
5. **Laufend:** Klientenfeedback sammeln und in Priorisierung einbeziehen

---

*Entwickelt von IC&P Consultants e.U. in Zusammenarbeit mit KPS Partner GmbH*
*Technologie: Next.js 14, TypeScript, Supabase (PostgreSQL), Tailwind CSS, Vercel*
