-- print_events に手動登録向けのカラムを追加
ALTER TABLE public.print_events
  ADD COLUMN target_person TEXT,
  ADD COLUMN note          TEXT;
