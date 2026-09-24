-- ============================================================
-- KPS Smart Buchhaltung – Migration 023
-- Kunden- und Lieferantenstammdaten: Bezeichnung + Kontaktperson
--
-- Bisher:
--   name          = Vorname Nachname   (Pflichtfeld)
--   company_name  = Firmenname         (optional)
--   Anzeige überall: company_name || name  – also Firma bevorzugt.
--
-- Neu:
--   name           = Bezeichnung       (Pflichtfeld, i.d.R. die Firma)
--   contact_person = Fr./Hrn. Vor-/Nachname (optional)
--   company_name   entfällt.
--
-- Damit ist das Pflichtfeld genau das, was auf der Rechnung als
-- Empfänger steht, und die Kontaktperson steht daneben statt sie
-- über den Firmennamen zu verdrängen.
--
-- Die Datenumschlüsselung unten ist korrekt, auch wenn bereits
-- Datensätze existieren: bei gesetztem company_name wandert der
-- bisherige Personenname in contact_person und der Firmenname wird
-- zur Bezeichnung.
--
-- Idempotent. Ausfuehren in: Supabase -> SQL Editor -> Run
-- ============================================================


-- ============================================================
-- TEIL A – Neue Spalte
-- ============================================================

ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_person TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_person TEXT;

COMMENT ON COLUMN customers.contact_person IS
  'Ansprechpartner, z.B. "Fr. Maria Muster". Rein informativ, erscheint nicht als Rechnungsempfänger.';
COMMENT ON COLUMN suppliers.contact_person IS
  'Ansprechpartner, z.B. "Hr. Josef Muster".';

COMMENT ON COLUMN customers.name IS
  'Bezeichnung des Kunden – Firmenwortlaut oder Vor- und Nachname. Erscheint als Rechnungsempfänger.';
COMMENT ON COLUMN suppliers.name IS
  'Bezeichnung des Lieferanten – Firmenwortlaut oder Vor- und Nachname.';


-- ============================================================
-- TEIL B – Bestandsdaten umschlüsseln
-- ============================================================
-- Nur dort, wo ein Firmenname gepflegt war: der bisherige
-- Personenname wird zur Kontaktperson, die Firma zur Bezeichnung.
-- Wird nur ausgeführt, solange company_name noch existiert.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='customers' AND column_name='company_name'
  ) THEN
    EXECUTE $sql$
      UPDATE customers
         SET contact_person = COALESCE(contact_person, NULLIF(name, '')),
             name           = company_name
       WHERE company_name IS NOT NULL
         AND btrim(company_name) <> ''
         AND company_name IS DISTINCT FROM name
    $sql$;
    RAISE NOTICE 'customers: Bestandsdaten umgeschluesselt.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='suppliers' AND column_name='company_name'
  ) THEN
    EXECUTE $sql$
      UPDATE suppliers
         SET contact_person = COALESCE(contact_person, NULLIF(name, '')),
             name           = company_name
       WHERE company_name IS NOT NULL
         AND btrim(company_name) <> ''
         AND company_name IS DISTINCT FROM name
    $sql$;
    RAISE NOTICE 'suppliers: Bestandsdaten umgeschluesselt.';
  END IF;
END $$;


-- ============================================================
-- TEIL C – company_name entfernen
-- ============================================================
-- Bewusst destruktiv und bewusst jetzt: die Tabellen sind leer, und
-- eine ungenutzte Spalte mit widersprüchlicher Bedeutung ist genau
-- die Art Altlast, die später zu falschen Anzeigen führt.
-- Alle Anzeigen im Code sind in derselben Änderung auf "name"
-- umgestellt.

ALTER TABLE customers DROP COLUMN IF EXISTS company_name;
ALTER TABLE suppliers DROP COLUMN IF EXISTS company_name;


-- ============================================================
-- TEIL D – Index für die Rechnungsauswertung je Stammsatz
-- ============================================================
-- Die Detailseiten listen künftig alle Rechnungen des Kunden bzw.
-- alle Eingangsrechnungen des Lieferanten.

CREATE INDEX IF NOT EXISTS idx_invoices_customer
  ON invoices(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_incoming_invoices_supplier
  ON incoming_invoices(supplier_id) WHERE supplier_id IS NOT NULL;


-- ============================================================
-- KONTROLLE
-- ============================================================
--
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name IN ('customers','suppliers')
--     AND column_name IN ('name','contact_person','company_name')
--   ORDER BY table_name, column_name;
--
-- Erwartet: je Tabelle "name" und "contact_person", kein "company_name".
--
-- ============================================================
