-- Webアプリ（anon key）からprintsを読み書きできるようにするポリシー
-- セキュリティはLIFF認証でアプリ層で担保する（PoC前提）

CREATE POLICY "anon_select" ON public.prints
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_archive" ON public.prints
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);
