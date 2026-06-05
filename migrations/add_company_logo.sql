-- Company branding fields + logo storage
-- Run in Supabase SQL Editor

ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS primary_color text DEFAULT '#2563EB';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS tagline text;

-- ────────────────────────────────────────────────────────────────────────────
-- STORAGE BUCKET (do this in the Supabase Dashboard, or via SQL below)
--
-- Dashboard: Storage → New bucket
--   name: company-logos
--   public: YES
--   allowed MIME: image/png, image/jpeg, image/webp, image/svg+xml
--   max file size: 2MB
--
-- SQL alternative:
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-logos', 'company-logos', true, 2097152,
  ARRAY['image/png','image/jpeg','image/webp','image/svg+xml']
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 2097152,
      allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp','image/svg+xml'];

-- Storage RLS: public read, authenticated write/delete
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND policyname='Public read company logos') THEN
    CREATE POLICY "Public read company logos" ON storage.objects FOR SELECT
      USING (bucket_id = 'company-logos');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND policyname='Auth upload company logos') THEN
    CREATE POLICY "Auth upload company logos" ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'company-logos' AND auth.role() = 'authenticated');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND policyname='Auth update company logos') THEN
    CREATE POLICY "Auth update company logos" ON storage.objects FOR UPDATE
      USING (bucket_id = 'company-logos' AND auth.role() = 'authenticated');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND policyname='Auth delete company logos') THEN
    CREATE POLICY "Auth delete company logos" ON storage.objects FOR DELETE
      USING (bucket_id = 'company-logos' AND auth.role() = 'authenticated');
  END IF;
END $$;
