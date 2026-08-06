# Chargebee-Vorbereitung – KPS Smart Buchhaltung

**Stand:** Mai 2026 | **Autor:** IC&P Consultants e.U.  
**Zweck:** Konfigurationsplan damit bei KPS-Rollout sofort gestartet werden kann – kein Account, keine Kosten bis zum Go.

---

## 1. Warum Chargebee?

Bei 500+ Klienten kann die manuelle Rechnungsstellung (Phase 1: Rechnungsmodul der App) nicht skalieren. Chargebee übernimmt:

- **Abo-Lifecycle:** Plan-Wechsel, Upgrades, Downgrades, Kündigungen automatisch
- **SEPA Lastschrift:** Mandate zentral verwaltet, automatischer Einzug, Retry-Logik (Dunning)
- **Compliance:** Österreichische USt (20 %) auf SaaS-Leistungen, konforme Rechnungen
- **Reporting:** MRR, Churn, ARR – für KPS-interne Auswertungen

---

## 2. Preismodell Chargebee

| Plan | Preis/Monat | MRR-Limit | Wann relevant |
|------|-------------|-----------|---------------|
| **Free** | € 0 | bis $250k MRR | Testbetrieb, Konfiguration |
| **Performance** | ca. € 179 | bis $1M MRR | Ab ~50 Klienten sinnvoll |
| **Enterprise** | auf Anfrage | unbegrenzt | ab ~500+ |

> **Free-Plan nutzen** bis KPS live geht – die gesamte Konfiguration (Produkte, Pläne, Webhooks) kann kostenfrei vorbereitet werden.

---

## 3. Produkte & Pläne (vorab konfigurieren)

### 3.1 Plattformpläne (KPS → Klienten)

| Plan-ID | Name | Preis | Klienten-Limit |
|---------|------|-------|----------------|
| `kps-starter` | KPS Starter | € 12–18 / Klient / Monat | 1 Klient/Seat |
| `kps-standard` | KPS Standard | € 12–18 / Klient / Monat | 1 Klient/Seat |
| `kps-professional` | KPS Professional | € 12–18 / Klient / Monat | 1 Klient/Seat |

> Hinweis: KPS legt den Endpreis an Klienten selbst fest. Chargebee bildet die Klienten-Abonnements ab, nicht die KPS-Plattformgebühr (die läuft direkt IC&P → KPS per Stripe oder Überweisung).

### 3.2 Add-ons (Optionale Module)

| Add-on-ID | Name | Preis |
|-----------|------|-------|
| `addon-invoicing` | Rechnungsmodul | € 99 einmalig (one-time charge) |
| `addon-ocr` | OCR-Scanning | € 49 einmalig + Metered (50 Scans/Monat inkl.) |

---

## 4. SEPA-Lastschrift-Setup

### 4.1 Gateway verbinden
Chargebee unterstützt SEPA via:
- **Stripe** (empfohlen – bereits in App integriert)
- GoCardless (Alternative für reines DD)

→ **Stripe als primäres Gateway** in Chargebee konfigurieren. Stripe übernimmt die Mandats-Infrastruktur, Chargebee das Abo-Management.

### 4.2 SEPA-Mandat-Flow (Klient-Onboarding)
```
Klient registriert sich in App
  → Chargebee Checkout-Widget (eingebettet oder hosted)
  → Klient gibt IBAN ein + unterschreibt SEPA-Mandat digital
  → Stripe speichert Mandat (SCA-konform)
  → Chargebee erstellt Subscription
  → Erster Einzug am nächsten Monatsanfang
```

### 4.3 Mandate für bestehende Klienten (Migration)
Wenn KPS bereits Klienten hat (Phase 1): SEPA-Mandat per E-Mail-Link einholen – Chargebee bietet dafür „Update Payment Method"-Links.

---

## 5. Webhook-Integration (App ↔ Chargebee)

Die Next.js-App muss folgende Chargebee-Events verarbeiten:

| Event | Aktion in App |
|-------|---------------|
| `subscription_activated` | Klient-Status → `active` in DB |
| `subscription_cancelled` | Klient-Status → `inactive`, Zugang sperren |
| `invoice_generated` | Rechnung in Buchungen der App eintragen |
| `payment_succeeded` | Buchung als bezahlt markieren |
| `payment_failed` | E-Mail-Benachrichtigung an KPS + Klient |

**Webhook-Endpoint** (in App anlegen): `POST /api/webhooks/chargebee`

→ Authentifizierung via Chargebee-Webhook-Secret (Header `chargebee-webhook-signature`).

---

## 6. Österreichische USt-Konfiguration

- USt-Satz: **20 %** auf alle SaaS-Leistungen
- Chargebee: Tax Profile für Österreich anlegen (Region: Austria, Rate: 20%)
- Rechnungen: automatisch mit UID-Nummer KPS, österr. Pflichtangaben
- Reverse Charge: falls Klient UID hat → in Chargebee Customer-Profil eintragen, Chargebee stellt ohne USt aus

---

## 7. Technische Integration (Code-Vorbereitung)

### 7.1 Chargebee SDK installieren (wenn ready)
```bash
npm install chargebee
```

### 7.2 Umgebungsvariablen (in .env.local / Vercel)
```env
CHARGEBEE_SITE=kps-buchhaltung        # Chargebee Site-Name
CHARGEBEE_API_KEY=live_xxx            # API Key (Server-side only!)
CHARGEBEE_WEBHOOK_SECRET=whsec_xxx    # Webhook Signature Secret
```

### 7.3 Client initialisieren (`src/lib/chargebee.ts`)
```typescript
import Chargebee from 'chargebee';

const chargebee = new Chargebee({
  site: process.env.CHARGEBEE_SITE!,
  apiKey: process.env.CHARGEBEE_API_KEY!,
});

export default chargebee;
```

### 7.4 Subscription anlegen (Beispiel)
```typescript
// Bei Klienten-Onboarding
const subscription = await chargebee.subscription.create({
  plan_id: 'kps-starter',
  customer: {
    email: klientEmail,
    company: klientFirma,
    vat_number: klientUID ?? undefined,
  },
  billing_address: {
    country: 'AT',
  },
});
```

---

## 8. Checkliste vor dem Go-live

- [ ] Chargebee Free-Account anlegen: https://www.chargebee.com/trial/
- [ ] Stripe als Payment Gateway verbinden
- [ ] Produkte & Pläne anlegen (Abschnitt 3)
- [ ] USt-Profil Österreich konfigurieren (Abschnitt 6)
- [ ] Webhook-Endpoint in App implementieren (Abschnitt 5)
- [ ] Test-Subscription mit SEPA-Testmandat durchlaufen
- [ ] E-Mail-Templates anpassen (Chargebee sendet Rechnungen automatisch)
- [ ] Upgrade auf Performance-Plan wenn erste echte Subscriptions aktiv

---

## 9. Zeitplan

| Meilenstein | Phase | Wann |
|-------------|-------|------|
| Chargebee Account + Free-Config | – | Sofort (kostenlos) |
| Stripe-Gateway verbinden | Phase 2 | ~Monat 5 |
| Webhook-Endpoint in App | Phase 2 | ~Monat 5–6 |
| Erster Live-Einzug | Phase 2 Ende | ~Monat 6–7 |
| Upgrade Performance Plan | KPS-Rollout | ab ~50 Klienten |

---

*Dokument erstellt mit KPS Smart Buchhaltung – IC&P Consultants e.U.*
