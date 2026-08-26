# KPS Smart Buchhaltung – Durchklick-Testliste Rel. 1.0.0

Stand: 12.08.2026 · Reihenfolge ist so gewählt, dass die Tests aufeinander
aufbauen (erst Stammdaten, dann Belege, dann Auswertungen).
Legende: ⭐ = kritisch (heute geändert), ○ = Routinekontrolle.

---

## 0 · Basis

- [ ] ○ **Login** mit E-Mail/Passwort → landet am Dashboard
- [ ] ⭐ **Browser-Tab**: Favicon zeigt das neue Punkte-Zeichen (nach Strg+F5)
- [ ] ⭐ **Sidebar**: 5 Gruppen (Überblick / Einnahmen & Ausgaben / Fakturierung /
      Bank & Konten / Abschluss & Meldungen), jeder Punkt mit Icon,
      „Monatsübersicht" als normaler Menüpunkt
- [ ] ⭐ **Sidebar-Fußzeile**: `© ICP Solutions · Rel. 1.0.0 – <7 Zeichen Commit>`
      und rundes neues Zeichen daneben

## 1 · Dashboard (heute umgebaut)

- [ ] ⭐ Kennzahlen zeigen **August 2026** mit Vormonat-Zeile darunter
- [ ] ⭐ **Aufgabenliste** vorhanden; erwartet je nach Datenlage:
      überfällige Rechnungen, „UVA Q2 2026 einreichen (war am 15.8. fällig)",
      Rechnungsentwürfe – jede Zeile mit funktionierendem Knopf
- [ ] ⭐ Knöpfe oben: „Rechnung schreiben" und „+ Buchung erfassen" führen richtig
- [ ] ○ Kacheln „Offene Ausgangs-/Eingangsrechnungen" stimmen mit Offene Posten überein

## 2 · Fakturierung (Rechnung komplett durchspielen)

- [ ] ○ Rechnung anlegen (Kunde mit Kontakt „Hrn./Fr. …", 2 Positionen,
      eine mit Dezimalmenge z. B. 1,5 Std.)
- [ ] ⭐ **Detailansicht**: neues Logo linksbündig, exakt so hoch wie der Block
      RECHNUNG…UID; Menge mit Komma; Spalten Menge/Preis/Betrag fluchten;
      Fußzeile: Mitte ab „Tel:" linksbündig, rechts ab „IBAN:" linksbündig
- [ ] ⭐ **PDF / Drucken**: neuer Tab öffnet die Druckansicht (kein leerer Tab!),
      Druckdialog erscheint automatisch, keine Browser-Kopfzeile (Datum/URL),
      Layout wie Detailansicht
- [ ] ⭐ **Per E-Mail senden** mit einem Zusatzanhang (z. B. Zeitnachweis-PDF):
      Mail kommt an, Anrede „Sehr geehrter Herr …" bzw. „Sehr geehrte Frau …",
      Rechnungs-PDF + Anhang dabei, Logo im PDF linksbündig auf Kopfhöhe
- [ ] ⭐ **Als bezahlt buchen**: Kategorie + Konto wählen → Buchung erscheint in
      der Buchungsliste UND in der Kontoabstimmung des gewählten Kontos
- [ ] ○ Rechnungsnummern in Fakturierung + Offene Posten sind klickbar

## 3 · Eingangsrechnung / Offene Posten

- [ ] ○ Eingangsrechnung erfassen mit Beleg-PDF → in Offene Posten sichtbar,
      Klick auf die Nummer öffnet den Beleg
- [ ] ⭐ „Bezahlt über"-Konto wählen beim Bezahlen → Buchung landet in der
      Abstimmung dieses Kontos

## 4 · Belege (OCR)

- [ ] ○ Beleg-Foto hochladen → Status läuft durch (Erkannt), Status-Abzeichen
      in gedeckten Farben (kein Grün/Gelb-Ampelmix), Spinner statt ⏳
- [ ] ○ Erkannten Beleg verbuchen → Status „Verbucht"

## 5 · Buchungen

- [ ] ⭐ **Desktop**: Aktionen „Bearbeiten"/„Löschen" als Textknöpfe, nichts
      abgeschnitten; USt % steht als Unterzeile beim Netto
- [ ] ⭐ **Am Handy** (oder Fenster schmal ziehen): Kartenliste statt Tabelle,
      Knöpfe gut tippbar
- [ ] ○ CSV-Export öffnet sich in Excel mit Umlauten korrekt

## 6 · Konten & Umbuchung (heute neu)

- [ ] ⭐ Eröffnungsdatum beider Konten = Datum des letzten Kontoauszugs (31.7.)
- [ ] ⭐ **Umbuchung erfassen** (Giro → Kreditkarte): erscheint am Girokonto als
      Minus „⇆ an Kreditkarte", auf der Kreditkarte als Plus „⇆ von Girokonto"
- [ ] ⭐ Saldenlauf rechnet die Umbuchung mit; Abhaken auf einer Seite lässt die
      andere Seite unberührt; „Löschen" entfernt sie aus beiden
- [ ] ⭐ Umbuchung taucht NICHT auf in: Monatsübersicht, UVA, BMD-Export, Dashboard
- [ ] ⭐ Hinweis „x Bewegungen … stecken im Eröffnungssaldo" erscheint, wenn
      Bewegungen am/vor dem Stichtag liegen

## 7 · Auswertungen & Meldungen

- [ ] ○ **Monatsübersicht**: Jahreswähler ‹ › funktioniert, Summenzeile stimmt
- [ ] ⭐ **UVA**: Berechnung für Q2, **UVA-Druckansicht** öffnet (gleicher Fix wie
      Rechnung — bitte einmal prüfen!), nach „Übermittelt" verschwindet die
      Aufgabe vom Dashboard
- [ ] ○ **BMD-Export**: Zeitraum wählen, Vorschau zeigt Zeilen, CSV lädt herunter,
      Beleg-Nummern in voller Form (2026/00001), Umlaute in BMD korrekt
- [ ] ○ **Monatsabschluss**: Monat abschließen → Buchungen des Monats gesperrt
      (Schloss in der Buchungsliste)

## 8 · Handy-App (PWA)

- [ ] ⭐ App vom Home-Bildschirm entfernen und neu installieren → neues
      Punkte-Icon mit 23 %-Rundung, Startfarbe Navy
- [ ] ○ Beleg-Scan vom Handy: Foto → hochladen → erkannt

---

**Wenn etwas hakt:** Seite, Klickweg und was stattdessen passiert kurz notieren
(Screenshot hilft) – ich behebe es dann gezielt.
