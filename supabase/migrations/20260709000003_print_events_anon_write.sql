-- Webアプリ（anon key）から print_id=NULL の手動イベントのみ INSERT/UPDATE/DELETE を許可
-- print_id が NULL でない行（プリント由来）への書き込みは禁止

CREATE POLICY "anon_insert_manual" ON public.print_events
  FOR INSERT TO anon
  WITH CHECK (print_id IS NULL);

CREATE POLICY "anon_update_manual" ON public.print_events
  FOR UPDATE TO anon
  USING (print_id IS NULL)
  WITH CHECK (print_id IS NULL);

CREATE POLICY "anon_delete_manual" ON public.print_events
  FOR DELETE TO anon
  USING (print_id IS NULL);
