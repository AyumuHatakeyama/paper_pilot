-- ============================================================
-- pending_registrations table
-- リッチメニュー起点の予定一括登録フロー用の一時セッション。
-- ユーザーごとに最新1件のみ保持する（UNIQUE upsert、P3と同じ思想）。
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pending_registrations (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id          TEXT        NOT NULL UNIQUE,
  status                TEXT        NOT NULL CHECK (status IN ('awaiting_input', 'clarifying', 'awaiting_confirmation')),
  draft_events          JSONB,
  clarification_context TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  expires_at            TIMESTAMPTZ DEFAULT now() + interval '5 minutes'
);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE public.pending_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.pending_registrations
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- pg_cron: 期限切れセッションの掃除
-- ============================================================
SELECT cron.schedule(
  'cleanup-pending-registrations',
  '*/10 * * * *',
  $$
    DELETE FROM public.pending_registrations
    WHERE expires_at < now();
  $$
);
