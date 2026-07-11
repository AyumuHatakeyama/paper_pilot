-- ============================================================
-- pending_book_sessions table
-- リッチメニュー起点のブック登録フロー用の一時セッション。
-- ユーザーごとに最新1件のみ保持（UNIQUE upsert、既存の pending_* と同じ思想）。
-- 画像受信のたびにTTLをリセットする点が pending_image_sessions と異なる。
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pending_book_sessions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id TEXT        NOT NULL UNIQUE,
  image_urls   TEXT[]      NOT NULL DEFAULT '{}',
  status       TEXT        NOT NULL CHECK (status IN ('collecting', 'awaiting_title')),
  created_at   TIMESTAMPTZ DEFAULT now(),
  expires_at   TIMESTAMPTZ DEFAULT now() + interval '10 minutes'
);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE public.pending_book_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.pending_book_sessions
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- pg_cron: 期限切れセッションの掃除（既存の pending_* 系と同じ10分おき）
-- ============================================================
SELECT cron.schedule(
  'cleanup-pending-book-sessions',
  '*/10 * * * *',
  $$
    DELETE FROM public.pending_book_sessions
    WHERE expires_at < now();
  $$
);
