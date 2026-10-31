-- Akquise-Pipeline (Welle 9a): Firmen/Vermittler, Ansprechpersonen,
-- Opportunities und Aktivitäten. Stages und Rechenlogik: src/lib/akquise.ts.
-- Spaltennamen sind mit dem Cowork-Skill „bewerbung-icp“ abgestimmt (Anleitung Abschnitt 7).

-- ---------- acq_companies ----------------------------------------------
CREATE TABLE IF NOT EXISTS acq_companies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'endkunde',
  website       TEXT,
  linkedin_url  TEXT,
  city          TEXT,
  country       TEXT NOT NULL DEFAULT 'AT',
  industry      TEXT,
  icp_fit       INTEGER,
  rating        INTEGER,
  tags          TEXT[] NOT NULL DEFAULT '{}',
  notes         TEXT,
  customer_id   UUID REFERENCES customers(id) ON DELETE SET NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT acq_companies_kind    CHECK (kind IN ('vermittler', 'endkunde', 'plattform', 'wunschkunde', 'multiplikator')),
  CONSTRAINT acq_companies_icp_fit CHECK (icp_fit IS NULL OR icp_fit BETWEEN 1 AND 5),
  CONSTRAINT acq_companies_rating  CHECK (rating IS NULL OR rating BETWEEN 1 AND 5)
);
COMMENT ON TABLE acq_companies IS 'Akquise: Firmen, Vermittler, Plattformen (Welle 9).';
CREATE INDEX IF NOT EXISTS idx_acq_companies_client ON acq_companies (client_id, name);

-- ---------- acq_people -------------------------------------------------
CREATE TABLE IF NOT EXISTS acq_people (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  company_id    UUID NOT NULL REFERENCES acq_companies(id) ON DELETE CASCADE,
  first_name    TEXT,
  last_name     TEXT,
  role          TEXT,
  email         TEXT,
  phone         TEXT,
  linkedin_url  TEXT,
  notes         TEXT,
  is_primary    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE acq_people IS 'Akquise: Ansprechpersonen, je genau einer Firma zugeordnet.';
CREATE INDEX IF NOT EXISTS idx_acq_people_company ON acq_people (company_id);

-- ---------- acq_opportunities ------------------------------------------
CREATE TABLE IF NOT EXISTS acq_opportunities (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                  UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title                      TEXT NOT NULL,
  company_id                 UUID REFERENCES acq_companies(id) ON DELETE SET NULL,
  end_company_id             UUID REFERENCES acq_companies(id) ON DELETE SET NULL,
  end_customer_confidential  BOOLEAN NOT NULL DEFAULT FALSE,
  contact_id                 UUID REFERENCES acq_people(id) ON DELETE SET NULL,
  kind                       TEXT NOT NULL DEFAULT 'projekt',
  source                     TEXT NOT NULL DEFAULT 'vermittler',
  reference                  TEXT,
  stage                      TEXT NOT NULL DEFAULT 'beworben',
  probability                INTEGER,
  rate_per_day               NUMERIC(10,2),
  salary_year                NUMERIC(12,2),
  hours_per_week             INTEGER,
  start_on                   DATE,
  duration_months            INTEGER,
  location                   TEXT,
  remote_share               INTEGER,
  applied_on                 DATE,
  next_action                TEXT,
  next_action_on             DATE,
  lost_reason                TEXT,
  closed_on                  DATE,
  customer_id                UUID REFERENCES customers(id) ON DELETE SET NULL,
  notes                      TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT acq_opp_kind    CHECK (kind IN ('projekt', 'festanstellung', 'initiativ', 'produkt')),
  CONSTRAINT acq_opp_source  CHECK (source IN ('vermittler', 'freelancermap', 'linkedin', 'empfehlung', 'ausschreibung', 'initiativ', 'sonstige')),
  CONSTRAINT acq_opp_stage   CHECK (stage IN ('recherche', 'beworben', 'rueckmeldung', 'gespraech', 'endkunde', 'angebot', 'gewonnen', 'verloren', 'pausiert')),
  CONSTRAINT acq_opp_prob    CHECK (probability IS NULL OR probability BETWEEN 0 AND 100),
  CONSTRAINT acq_opp_remote  CHECK (remote_share IS NULL OR remote_share BETWEEN 0 AND 100),
  CONSTRAINT acq_opp_hours   CHECK (hours_per_week IS NULL OR hours_per_week BETWEEN 1 AND 80),
  CONSTRAINT acq_opp_dauer   CHECK (duration_months IS NULL OR duration_months >= 0),
  CONSTRAINT acq_opp_verguetung CHECK (rate_per_day IS NULL OR salary_year IS NULL),
  -- Jede offene Opportunity (und jede pausierte: Wiedervorlage) hat ein Datum für die nächste Aktion
  CONSTRAINT acq_opp_naechste_aktion CHECK (stage IN ('gewonnen', 'verloren') OR next_action_on IS NOT NULL),
  CONSTRAINT acq_opp_verlustgrund    CHECK (stage <> 'verloren' OR NULLIF(btrim(lost_reason), '') IS NOT NULL)
);
COMMENT ON TABLE acq_opportunities IS 'Akquise-Pipeline: Bewerbungen/Projekte mit Stage und nächster Aktion (Welle 9).';
CREATE INDEX IF NOT EXISTS idx_acq_opp_stage   ON acq_opportunities (client_id, stage, next_action_on);
CREATE INDEX IF NOT EXISTS idx_acq_opp_company ON acq_opportunities (company_id);

-- ---------- acq_activities ---------------------------------------------
CREATE TABLE IF NOT EXISTS acq_activities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  opportunity_id  UUID NOT NULL REFERENCES acq_opportunities(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  direction       TEXT,
  summary         TEXT,
  body            TEXT,
  temperature     TEXT,
  objections      TEXT[],
  budget_note     TEXT,
  next_step       TEXT,
  quality         INTEGER,
  documents       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT acq_act_kind      CHECK (kind IN ('bewerbung', 'followup', 'antwort', 'gespraech', 'interview', 'angebot', 'absage', 'zusage', 'notiz', 'linkedin')),
  CONSTRAINT acq_act_direction CHECK (direction IS NULL OR direction IN ('aus', 'ein')),
  CONSTRAINT acq_act_temp      CHECK (temperature IS NULL OR temperature IN ('heiss', 'warm', 'kalt')),
  CONSTRAINT acq_act_quality   CHECK (quality IS NULL OR quality BETWEEN 1 AND 10),
  CONSTRAINT acq_act_documents CHECK (jsonb_typeof(documents) = 'array')
);
COMMENT ON TABLE acq_activities IS 'Akquise: Touchpoints und Gespräche je Opportunity. Dokumente = lokale Pfade in „Claude outputs“, keine Uploads.';
CREATE INDEX IF NOT EXISTS idx_acq_act_opp    ON acq_activities (opportunity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_acq_act_client ON acq_activities (client_id, occurred_at DESC);

-- ---------- updated_at -------------------------------------------------
CREATE OR REPLACE FUNCTION acq_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DO $t$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['acq_companies', 'acq_people', 'acq_opportunities', 'acq_activities'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON %1$I', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON %1$I FOR EACH ROW EXECUTE FUNCTION acq_set_updated_at()', t);
  END LOOP;
END $t$;

-- ---------- Stage folgt den Aktivitäten --------------------------------
-- Eine Antwort, ein Gespräch, Interview, Angebot, Zusage oder Absage hebt
-- die Stage an, wenn sie bisher niedriger war. Gewonnene/verlorene
-- Opportunities bleiben unverändert; pausierte werden wieder aufgenommen.
-- Spiegelt stageNachAktivitaet()/STAGES in src/lib/akquise.ts.
CREATE OR REPLACE FUNCTION acq_stage_rang(p_stage text) RETURNS int AS $$
  SELECT CASE p_stage
    WHEN 'pausiert' THEN 0 WHEN 'recherche' THEN 1 WHEN 'beworben' THEN 2 WHEN 'rueckmeldung' THEN 3
    WHEN 'gespraech' THEN 4 WHEN 'endkunde' THEN 5 WHEN 'angebot' THEN 6 WHEN 'gewonnen' THEN 7 WHEN 'verloren' THEN 7
  END;
$$ LANGUAGE sql IMMUTABLE SET search_path = public;

CREATE OR REPLACE FUNCTION acq_stage_nach_aktivitaet() RETURNS TRIGGER AS $$
DECLARE
  ziel text;
  opp  acq_opportunities%ROWTYPE;
BEGIN
  ziel := CASE NEW.kind
    WHEN 'antwort'   THEN 'rueckmeldung'
    WHEN 'gespraech' THEN 'gespraech'
    WHEN 'interview' THEN 'endkunde'
    WHEN 'angebot'   THEN 'angebot'
    WHEN 'zusage'    THEN 'gewonnen'
    WHEN 'absage'    THEN 'verloren'
  END;
  IF ziel IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO opp FROM acq_opportunities WHERE id = NEW.opportunity_id;
  IF NOT FOUND OR opp.stage IN ('gewonnen', 'verloren') THEN RETURN NEW; END IF;
  IF acq_stage_rang(ziel) <= acq_stage_rang(opp.stage) THEN RETURN NEW; END IF;

  UPDATE acq_opportunities SET
    stage          = ziel,
    probability    = CASE ziel WHEN 'rueckmeldung' THEN 30 WHEN 'gespraech' THEN 45 WHEN 'endkunde' THEN 65
                                WHEN 'angebot' THEN 80 WHEN 'gewonnen' THEN 100 WHEN 'verloren' THEN 0 END,
    next_action_on = CASE WHEN ziel IN ('gewonnen', 'verloren') THEN next_action_on
                          ELSE COALESCE(next_action_on, (NEW.occurred_at AT TIME ZONE 'Europe/Vienna')::date) END,
    lost_reason    = CASE WHEN ziel = 'verloren' THEN COALESCE(NULLIF(btrim(lost_reason), ''), NULLIF(btrim(NEW.summary), ''), 'Absage') ELSE lost_reason END,
    closed_on      = CASE WHEN ziel IN ('gewonnen', 'verloren') THEN (NEW.occurred_at AT TIME ZONE 'Europe/Vienna')::date ELSE closed_on END
  WHERE id = opp.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_acq_activities_stage ON acq_activities;
CREATE TRIGGER trg_acq_activities_stage
  AFTER INSERT ON acq_activities
  FOR EACH ROW EXECUTE FUNCTION acq_stage_nach_aktivitaet();

-- ---------- RLS ----------------------------------------------------------
ALTER TABLE acq_companies     ENABLE ROW LEVEL SECURITY;
ALTER TABLE acq_people        ENABLE ROW LEVEL SECURITY;
ALTER TABLE acq_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE acq_activities    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Klient verwaltet eigene Akquise-Firmen" ON acq_companies;
CREATE POLICY "Klient verwaltet eigene Akquise-Firmen" ON acq_companies
  FOR ALL
  USING (client_id IN (SELECT get_my_client_ids()))
  WITH CHECK (
    client_id IN (SELECT get_my_client_ids())
    AND (customer_id IS NULL OR customer_id IN (SELECT id FROM customers c WHERE c.client_id = acq_companies.client_id))
  );

DROP POLICY IF EXISTS "Klient verwaltet eigene Ansprechpersonen" ON acq_people;
CREATE POLICY "Klient verwaltet eigene Ansprechpersonen" ON acq_people
  FOR ALL
  USING (client_id IN (SELECT get_my_client_ids()))
  WITH CHECK (
    client_id IN (SELECT get_my_client_ids())
    AND company_id IN (SELECT id FROM acq_companies f WHERE f.client_id = acq_people.client_id)
  );

DROP POLICY IF EXISTS "Klient verwaltet eigene Opportunities" ON acq_opportunities;
CREATE POLICY "Klient verwaltet eigene Opportunities" ON acq_opportunities
  FOR ALL
  USING (client_id IN (SELECT get_my_client_ids()))
  WITH CHECK (
    client_id IN (SELECT get_my_client_ids())
    AND (company_id IS NULL     OR company_id     IN (SELECT id FROM acq_companies f WHERE f.client_id = acq_opportunities.client_id))
    AND (end_company_id IS NULL OR end_company_id IN (SELECT id FROM acq_companies f WHERE f.client_id = acq_opportunities.client_id))
    AND (contact_id IS NULL     OR contact_id     IN (SELECT id FROM acq_people p WHERE p.client_id = acq_opportunities.client_id))
    AND (customer_id IS NULL    OR customer_id    IN (SELECT id FROM customers c WHERE c.client_id = acq_opportunities.client_id))
  );

DROP POLICY IF EXISTS "Klient verwaltet eigene Akquise-Aktivitäten" ON acq_activities;
CREATE POLICY "Klient verwaltet eigene Akquise-Aktivitäten" ON acq_activities
  FOR ALL
  USING (client_id IN (SELECT get_my_client_ids()))
  WITH CHECK (
    client_id IN (SELECT get_my_client_ids())
    AND opportunity_id IN (SELECT id FROM acq_opportunities o WHERE o.client_id = acq_activities.client_id)
  );

DROP POLICY IF EXISTS "Superadmin: alle Akquise-Firmen" ON acq_companies;
CREATE POLICY "Superadmin: alle Akquise-Firmen" ON acq_companies FOR ALL USING (is_superadmin());
DROP POLICY IF EXISTS "Superadmin: alle Ansprechpersonen" ON acq_people;
CREATE POLICY "Superadmin: alle Ansprechpersonen" ON acq_people FOR ALL USING (is_superadmin());
DROP POLICY IF EXISTS "Superadmin: alle Opportunities" ON acq_opportunities;
CREATE POLICY "Superadmin: alle Opportunities" ON acq_opportunities FOR ALL USING (is_superadmin());
DROP POLICY IF EXISTS "Superadmin: alle Akquise-Aktivitäten" ON acq_activities;
CREATE POLICY "Superadmin: alle Akquise-Aktivitäten" ON acq_activities FOR ALL USING (is_superadmin());

-- ---------- Data-API-Grants (Supabase-Regel ab 30.10.2026) ---------------
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.acq_companies     TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.acq_people        TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.acq_opportunities TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.acq_activities    TO anon, authenticated, service_role;
