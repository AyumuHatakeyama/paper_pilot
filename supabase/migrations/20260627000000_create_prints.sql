-- pg_cron extension (pre-installed on Supabase hosted platform)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================================
-- prints table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.prints (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url     TEXT,
  target_person TEXT,
  category      TEXT        CHECK (category IN ('予定', '持ち物', '提出物', 'その他')),
  date          DATE,
  deadline      DATE,
  content       TEXT,
  raw_text      TEXT,
  archived_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_prints_deadline ON public.prints (deadline);
CREATE INDEX idx_prints_active   ON public.prints (archived_at, deadline)
  WHERE archived_at IS NULL;

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE public.prints ENABLE ROW LEVEL SECURITY;

-- Edge Functions use service_role key → bypasses RLS automatically
-- This policy covers future direct DB access if needed
CREATE POLICY "service_role_all" ON public.prints
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- Storage bucket for print images
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'prints',
  'prints',
  true,
  10485760,  -- 10 MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
CREATE POLICY "prints_public_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'prints');

CREATE POLICY "prints_service_role_write" ON storage.objects
  FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'prints');

CREATE POLICY "prints_service_role_delete" ON storage.objects
  FOR DELETE
  TO service_role
  USING (bucket_id = 'prints');

-- ============================================================
-- pg_cron: auto-archive prints 30+ days past their deadline
-- ============================================================
SELECT cron.schedule(
  'auto-archive-prints',
  '0 3 * * *',
  $$
    UPDATE public.prints
    SET archived_at = now()
    WHERE deadline < (now() - INTERVAL '30 days')
      AND archived_at IS NULL;
  $$
);
