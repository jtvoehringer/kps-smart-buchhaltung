-- Welle 9a, Nachtrag 09.11.2026: Stage „verloren“ heißt in der
-- Oberfläche jetzt „Absage“. Festgehalten wird, wer abgesagt hat –
-- der Kunde/Vermittler oder Jörgen selbst. Alte Einträge bleiben leer.
ALTER TABLE acq_opportunities
  ADD COLUMN IF NOT EXISTS lost_by TEXT;

ALTER TABLE acq_opportunities DROP CONSTRAINT IF EXISTS acq_opp_absage_von;
ALTER TABLE acq_opportunities
  ADD CONSTRAINT acq_opp_absage_von CHECK (lost_by IS NULL OR lost_by IN ('kunde', 'eigene'));

COMMENT ON COLUMN acq_opportunities.lost_by IS 'Bei Absage: kunde = vom Kunden/Vermittler, eigene = selbst abgesagt';

-- Trigger: eine Absage-Aktivität setzt auch lost_by – ausgehend (aus)
-- heißt eigene Absage, sonst kam sie vom Kunden.
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
    lost_by        = CASE WHEN ziel = 'verloren' THEN COALESCE(lost_by, CASE WHEN NEW.direction = 'aus' THEN 'eigene' ELSE 'kunde' END) ELSE lost_by END,
    closed_on      = CASE WHEN ziel IN ('gewonnen', 'verloren') THEN (NEW.occurred_at AT TIME ZONE 'Europe/Vienna')::date ELSE closed_on END
  WHERE id = opp.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
