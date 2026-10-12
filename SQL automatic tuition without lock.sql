BEGIN;
-- Keep the deployed snapshot's arrears, discounts and identity rules intact.
DO $migration$
DECLARE definition text;
BEGIN
  definition := pg_get_functiondef('public.automatic_tuition_snapshot(uuid,date)'::regprocedure);
  IF definition !~* 'tuition_payments' THEN
    RAISE EXCEPTION 'Unexpected automatic tuition snapshot';
  END IF;
  definition := regexp_replace(definition, '\s+AND t\.locked_at IS NOT NULL', '', 'gi');
  EXECUTE definition;
END;
$migration$;
COMMIT;
