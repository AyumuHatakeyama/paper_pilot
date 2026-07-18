-- ============================================================
-- notification_settings table
-- 通知（週次ダイジェスト・締切リマインド）の頻度・時刻・ON/OFFをユーザーごとに保持する。
-- 現時点では送信先は1:1（line_user_id単位）。グループ通知対応時はfamily_id単位への
-- 拡張を検討する。
--
-- 初期レコードはこのマイグレーションでは作成しない（実在のline_user_idが
-- マイグレーション作成時点ではわからないため）。webhook-line側で、ユーザーの
-- 初回インタラクション時にテスト期間デフォルト値（daily / 22:00 / 全ON）で
-- 自動作成する（ON CONFLICT DO NOTHINGで既存設定は上書きしない）。
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notification_settings (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id      TEXT        NOT NULL UNIQUE,
  frequency         TEXT        NOT NULL DEFAULT 'daily', -- 'daily' | 'weekly'
  weekly_day        INT, -- 0=日,1=月...6=土（frequency='weekly'の場合のみ使用。それ以外はnull）
  send_time         TIME        NOT NULL DEFAULT '22:00',
  digest_enabled    BOOLEAN     NOT NULL DEFAULT true,   -- 週次ダイジェスト
  reminder_enabled  BOOLEAN     NOT NULL DEFAULT true,   -- 締切リマインド
  send_when_empty   BOOLEAN     NOT NULL DEFAULT true,   -- 対象0件でも送信するか（テスト期間はtrue）
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

-- webhook-line / cron-notify（service role）からの全操作を許可
CREATE POLICY "service_role_all" ON public.notification_settings
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Webアプリ（anon key）の設定画面から参照・作成・更新を許可（PoC前提、他テーブルと同方針）
CREATE POLICY "anon_select" ON public.notification_settings
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert" ON public.notification_settings
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "anon_update" ON public.notification_settings
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);
