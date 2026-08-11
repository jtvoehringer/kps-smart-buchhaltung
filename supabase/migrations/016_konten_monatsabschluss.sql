-- ============================================================
-- KPS Smart Buchhaltung – Migration 016
-- Konten (Kontokorrent/Kreditkarte/Kreditkonto), Monatsabschluss mit
-- Sperrlogik, Bankabstimmung (Privat/Firma-Lernregeln, Kontoabgleich)
-- Ausführen in: Supabase → SQL Editor → Run
-- ============================================================

-- ------------------------------------------------------------
-- 1) Konten (für Kontoabstimmung und um Bank-Importe zuzuordnen)
-- ------------------------------------------------------------
CREATE TABLE accounts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,                 -- z.B. "Firmenkonto Erste Bank"
  type         TEXT NOT NULL DEFAULT 'kontokorrent'
                 CHECK (type IN ('kontokorrent','kreditkarte','kreditkonto')),
  iban         TEXT,
  note         TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE accounts IS 'Konten je Mandant für Kontoabstimmung (Kontokorrent/Kreditkarte/Kreditkonto). Bank-Importe und Buchungen können optional einem Konto zugeordnet werden.';

CREATE INDEX idx_accounts_client ON accounts(client_id);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Klient sieht eigene Konten" ON accounts
  FOR SELECT USING (client_id = get_my_client_id());
CREATE POLICY "Klient kann Konten verwalten" ON accounts
  FOR ALL USING (client_id = get_my_client_id());
CREATE POLICY "Kanzlei sieht Konten aller Klienten" ON accounts
  FOR SELECT USING (
    get_my_role() IN ('admin','kanzlei')
    AND client_id IN (SELECT id FROM clients WHERE tenant_id = get_my_tenant_id())
  );
CREATE POLICY "Kanzlei kann Konten verwalten" ON accounts
  FOR ALL USING (
    get_my_role() IN ('admin','kanzlei')
    AND client_id IN (SELECT id FROM clients WHERE tenant_id = get_my_tenant_id())
  );
CREATE POLICY "Superadmin: alle Konten" ON accounts
  FOR ALL USING (is_superadmin());

CREATE TRIGGER trg_accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- 2) transactions: Konto-Zuordnung, Privatumsatz-Flag, Abstimm-Flag
-- ------------------------------------------------------------
ALTER TABLE transactions
  ADD COLUMN account_id    UUID REFERENCES accounts(id) ON DELETE SET NULL,
  ADD COLUMN is_private    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN is_reconciled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN transactions.is_private IS 'true = privater Umsatz (z.B. Privatentnahme/-einlage über ein Firmenkonto), wird bei Bedarf aus Auswertungen/Kontoabstimmung ausgeblendet.';
COMMENT ON COLUMN transactions.is_reconciled IS 'true = im Rahmen der Kontoabstimmung mit dem Kontoauszug abgeglichen.';

CREATE INDEX idx_transactions_account ON transactions(account_id);

ALTER TABLE bank_imports
  ADD COLUMN account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- 3) Lernregeln für die Bankabstimmung (Privat/Firma + Kategorie je
--    Gegenpartei, wird bei jeder bestätigten Zuordnung nachgezogen)
-- ------------------------------------------------------------
CREATE TABLE bank_learning_rules (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  counterpart_pattern TEXT NOT NULL,   -- normalisierter (lowercase, getrimmt) Gegenparteiname
  category_id         UUID REFERENCES categories(id),
  is_private          BOOLEAN NOT NULL DEFAULT false,
  hit_count           INT NOT NULL DEFAULT 1,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, counterpart_pattern)
);

COMMENT ON TABLE bank_learning_rules IS 'Je bestätigter Bankabstimmungs-Zeile gelernte Zuordnung (Kategorie/Privat) je Gegenpartei-Textmuster, wird bei künftigen Importen als Vorschlag herangezogen.';

CREATE INDEX idx_bank_learning_rules_client ON bank_learning_rules(client_id);

ALTER TABLE bank_learning_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Klient sieht eigene Lernregeln" ON bank_learning_rules
  FOR SELECT USING (client_id = get_my_client_id());
CREATE POLICY "Klient kann Lernregeln verwalten" ON bank_learning_rules
  FOR ALL USING (client_id = get_my_client_id());
CREATE POLICY "Kanzlei sieht Lernregeln aller Klienten" ON bank_learning_rules
  FOR SELECT USING (
    get_my_role() IN ('admin','kanzlei')
    AND client_id IN (SELECT id FROM clients WHERE tenant_id = get_my_tenant_id())
  );
CREATE POLICY "Kanzlei kann Lernregeln verwalten" ON bank_learning_rules
  FOR ALL USING (
    get_my_role() IN ('admin','kanzlei')
    AND client_id IN (SELECT id FROM clients WHERE tenant_id = get_my_tenant_id())
  );
CREATE POLICY "Superadmin: alle Lernregeln" ON bank_learning_rules
  FOR ALL USING (is_superadmin());

-- ------------------------------------------------------------
-- 4) Monatsabschluss: welche Perioden sind gesperrt
-- ------------------------------------------------------------
CREATE TABLE month_closures (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  period_year  INT NOT NULL,
  period_month INT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  closed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_by    UUID REFERENCES users(id),
  reopened_at  TIMESTAMPTZ,
  reopened_by  UUID REFERENCES users(id),
  UNIQUE (client_id, period_year, period_month)
);

COMMENT ON TABLE month_closures IS 'Abgeschlossene Buchungsmonate je Mandant. Ein Eintrag ohne reopened_at gilt als aktuell gesperrt (siehe Trigger check_month_not_closed).';

CREATE INDEX idx_month_closures_client ON month_closures(client_id, period_year, period_month);

ALTER TABLE month_closures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Klient sieht eigene Monatsabschlüsse" ON month_closures
  FOR SELECT USING (client_id = get_my_client_id());
CREATE POLICY "Kanzlei sieht Monatsabschlüsse aller Klienten" ON month_closures
  FOR SELECT USING (
    get_my_role() IN ('admin','kanzlei')
    AND client_id IN (SELECT id FROM clients WHERE tenant_id = get_my_tenant_id())
  );
CREATE POLICY "Superadmin: alle Monatsabschlüsse" ON month_closures
  FOR ALL USING (is_superadmin());

-- Anlegen (abschließen) dürfen Klient (eigener Betrieb) UND Kanzlei/Admin/Superadmin –
-- analog zur UVA-Übermittlung (Migration 013).
CREATE POLICY "Klient kann eigenen Monat abschließen" ON month_closures
  FOR INSERT WITH CHECK (client_id = get_my_client_id());
CREATE POLICY "Kanzlei kann Monat abschließen" ON month_closures
  FOR INSERT WITH CHECK (
    get_my_role() IN ('admin','kanzlei')
    AND client_id IN (SELECT id FROM clients WHERE tenant_id = get_my_tenant_id())
  );

-- Wiedereröffnen (Korrektur) nur Kanzlei/Admin/Superadmin
CREATE POLICY "Kanzlei kann Monat wieder öffnen" ON month_closures
  FOR UPDATE USING (
    get_my_role() IN ('admin','kanzlei')
    AND client_id IN (SELECT id FROM clients WHERE tenant_id = get_my_tenant_id())
  );
CREATE POLICY "Superadmin kann Monat wieder öffnen" ON month_closures
  FOR UPDATE USING (is_superadmin());

-- ------------------------------------------------------------
-- 5) RPC: Monat abschließen (sperrt alle Buchungen der Periode) bzw.
--    wieder öffnen (entsperrt sie). SECURITY DEFINER wie uva_uebermitteln.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION monat_abschliessen(p_client_id UUID, p_year INT, p_month INT)
RETURNS month_closures
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row month_closures;
  v_period_start DATE := make_date(p_year, p_month, 1);
  v_period_end   DATE := (make_date(p_year, p_month, 1) + INTERVAL '1 month' - INTERVAL '1 day')::date;
BEGIN
  IF NOT (
    get_my_client_id() = p_client_id
    OR (get_my_role() IN ('admin','kanzlei') AND p_client_id IN (SELECT id FROM clients WHERE tenant_id = get_my_tenant_id()))
    OR is_superadmin()
  ) THEN
    RAISE EXCEPTION 'Keine Berechtigung für diesen Mandanten.';
  END IF;

  INSERT INTO month_closures (client_id, period_year, period_month, closed_by)
  VALUES (p_client_id, p_year, p_month, auth.uid())
  ON CONFLICT (client_id, period_year, period_month)
  DO UPDATE SET closed_at = NOW(), closed_by = auth.uid(), reopened_at = NULL, reopened_by = NULL
  RETURNING * INTO v_row;

  UPDATE transactions
  SET is_locked = true
  WHERE client_id = p_client_id
    AND booking_date BETWEEN v_period_start AND v_period_end;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION monat_oeffnen(p_client_id UUID, p_year INT, p_month INT)
RETURNS month_closures
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row month_closures;
  v_period_start DATE := make_date(p_year, p_month, 1);
  v_period_end   DATE := (make_date(p_year, p_month, 1) + INTERVAL '1 month' - INTERVAL '1 day')::date;
BEGIN
  IF NOT (
    (get_my_role() IN ('admin','kanzlei') AND p_client_id IN (SELECT id FROM clients WHERE tenant_id = get_my_tenant_id()))
    OR is_superadmin()
  ) THEN
    RAISE EXCEPTION 'Nur die Kanzlei kann einen abgeschlossenen Monat wieder öffnen.';
  END IF;

  UPDATE month_closures
  SET reopened_at = NOW(), reopened_by = auth.uid()
  WHERE client_id = p_client_id AND period_year = p_year AND period_month = p_month
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Dieser Monat ist nicht abgeschlossen.';
  END IF;

  UPDATE transactions
  SET is_locked = false
  WHERE client_id = p_client_id
    AND booking_date BETWEEN v_period_start AND v_period_end;

  RETURN v_row;
END;
$$;

-- ------------------------------------------------------------
-- 6) Trigger: verhindert Buchungen (INSERT/UPDATE) in einem
--    abgeschlossenen Monat, unabhängig davon über welchen Weg
--    (manuelle Buchung, Beleg-OCR, Offene-Posten-Zahlung, Bank-Import,
--    Dauerauftrag-Automatik) die Zeile entsteht.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_month_not_closed()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_closed BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM month_closures
    WHERE client_id = NEW.client_id
      AND period_year  = EXTRACT(YEAR  FROM NEW.booking_date)::int
      AND period_month = EXTRACT(MONTH FROM NEW.booking_date)::int
      AND reopened_at IS NULL
  ) INTO v_closed;

  IF v_closed THEN
    RAISE EXCEPTION 'Der Monat %/%  ist bereits abgeschlossen und gesperrt. Bitte die Kanzlei kontaktieren, falls eine Korrektur nötig ist.',
      EXTRACT(MONTH FROM NEW.booking_date), EXTRACT(YEAR FROM NEW.booking_date);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_transactions_check_month_closed
  BEFORE INSERT OR UPDATE OF booking_date, amount_net, vat_rate, vat_amount, category_id, description
  ON transactions
  FOR EACH ROW EXECUTE FUNCTION check_month_not_closed();

-- ============================================================
-- FERTIG
-- ✅ accounts + RLS + Trigger
-- ✅ transactions.account_id / is_private / is_reconciled
-- ✅ bank_imports.account_id
-- ✅ bank_learning_rules + RLS
-- ✅ month_closures + RLS + RPCs monat_abschliessen()/monat_oeffnen()
-- ✅ Trigger check_month_not_closed() auf transactions (blockt Buchungen
--    in gesperrten Monaten unabhängig vom Eingabeweg)
-- ============================================================
