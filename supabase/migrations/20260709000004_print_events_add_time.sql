-- print_events に時刻カラムを追加（任意・NULL許容）
ALTER TABLE public.print_events
  ADD COLUMN event_time TIME;
