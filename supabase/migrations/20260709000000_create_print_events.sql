-- ============================================================
-- print_events table
-- 1プリントに複数の日程・締切を持たせるための中間テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS public.print_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  print_id    UUID        REFERENCES public.prints(id) ON DELETE CASCADE,
  event_date  DATE        NOT NULL,
  title       TEXT        NOT NULL,
  is_deadline BOOLEAN     DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_print_events_print_id   ON public.print_events (print_id);
CREATE INDEX idx_print_events_event_date ON public.print_events (event_date);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE public.print_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.print_events
  TO service_role
  USING (true)
  WITH CHECK (true);
