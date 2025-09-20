CREATE EXTENSION IF NOT EXISTS "pgcrypto";
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
    ALTER TABLE users
      ALTER COLUMN id SET DATA TYPE uuid USING id::uuid,
      ALTER COLUMN id SET DEFAULT gen_random_uuid(),
      ALTER COLUMN id SET NOT NULL;
    BEGIN
      ALTER TABLE users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
    EXCEPTION WHEN duplicate_table THEN NULL;
    END;
  END IF;
END$$;
