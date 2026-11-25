-- Remove grants that expose public-schema tables to anonymous/PUBLIC roles.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, PUBLIC;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, PUBLIC;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM anon, PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon, PUBLIC;

DO $$
DECLARE
  public_table RECORD;
  auth_policy_name CONSTANT TEXT := 'require_authenticated_user';
BEGIN
  FOR public_table IN
    SELECT table_class.relname
    FROM pg_class AS table_class
    JOIN pg_namespace AS table_schema ON table_schema.oid = table_class.relnamespace
    WHERE table_schema.nspname = 'public'
      AND table_class.relkind IN ('r', 'p')
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
      public_table.relname
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      auth_policy_name,
      public_table.relname
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO PUBLIC USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL)',
      auth_policy_name,
      public_table.relname
    );
  END LOOP;
END
$$;
