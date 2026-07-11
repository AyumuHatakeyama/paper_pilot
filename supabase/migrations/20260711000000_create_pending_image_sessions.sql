-- ============================================================
-- pending_image_sessions table
-- LINE画像送信時に「読み取り指示を追加するか」を確認するための
-- 一時セッション。ユーザーごとに最新1件のみ保持する（UNIQUE upsert）。
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pending_image_sessions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id TEXT        NOT NULL UNIQUE,
  image_url    TEXT        NOT NULL,
  status       TEXT        NOT NULL CHECK (status IN ('awaiting_choice', 'awaiting_instruction')),
  created_at   TIMESTAMPTZ DEFAULT now(),
  expires_at   TIMESTAMPTZ DEFAULT now() + interval '5 minutes'
);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE public.pending_image_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.pending_image_sessions
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- pg_cron: 期限切れセッションの掃除
-- ============================================================
SELECT cron.schedule(
  'cleanup-pending-image-sessions',
  '*/10 * * * *',
  $$
    DELETE FROM public.pending_image_sessions
    WHERE expires_at < now();
  $$
);
