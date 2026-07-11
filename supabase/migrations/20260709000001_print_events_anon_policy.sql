-- Webアプリ（anon key）からprint_eventsを読めるようにするポリシー
-- printsと同じPoC前提（セキュリティはLIFF認証でアプリ層で担保）

CREATE POLICY "anon_select" ON public.print_events
  FOR SELECT TO anon USING (true);
