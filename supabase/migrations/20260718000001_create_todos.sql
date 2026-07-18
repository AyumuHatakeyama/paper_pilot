-- ============================================================
-- todos table
-- プリントから抽出した予定・締切をToDoとして管理する。
-- 通知機能（週次ダイジェスト・締切リマインド）の生成元データ。
-- ============================================================
CREATE TABLE IF NOT EXISTS public.todos (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  print_event_id    UUID        REFERENCES public.print_events(id) ON DELETE CASCADE,
  title             TEXT        NOT NULL,
  due_date          DATE,
  category          TEXT, -- '要準備' / '提出のみ' / 'イベント参加' / null
  status            TEXT        NOT NULL DEFAULT '未完了', -- '未完了' / '完了'
  reminder_enabled  BOOLEAN     NOT NULL DEFAULT false,
  todo_enabled      BOOLEAN     NOT NULL DEFAULT true,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_todos_due_date ON public.todos(due_date) WHERE status = '未完了';
CREATE INDEX idx_todos_print_event_id ON public.todos(print_event_id);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;

-- webhook-line（service role）からの全操作を許可
CREATE POLICY "service_role_all" ON public.todos
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Webアプリ（anon key）は参照と完了/未完了トグルのみ許可（PoC前提、prints/print_eventsと同方針）
CREATE POLICY "anon_select" ON public.todos
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_update" ON public.todos
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);
