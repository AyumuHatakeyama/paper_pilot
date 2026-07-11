-- ============================================================
-- print_books table
-- 複数プリントをまとめる「ブック」（例：夏休みの栞）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.print_books (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT        NOT NULL,
  archived_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE public.print_books ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.print_books
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Webアプリ（anon key）から読めるようにする（既存の prints / print_events と同じPoC方針）
CREATE POLICY "anon_select" ON public.print_books
  FOR SELECT TO anon USING (true);
