-- print_event_id ごとにtodosは高々1件という運用上の前提を、DB制約として実際に強制する。
-- これにより、LINEのQuick Reply二重タップやwebhook再送でhandleTodoActionが2回走っても、
-- upsert(..., { onConflict: 'print_event_id', ignoreDuplicates: true })で重複作成を防げる。
-- NULLは複数行許容される（UNIQUE制約の標準動作）ため、将来print_event_idを持たない
-- todoが増えても問題ない。
-- 既存のidx_todos_print_event_idは同じ列に対するUNIQUE制約のインデックスと重複するため削除する。
DROP INDEX IF EXISTS public.idx_todos_print_event_id;

-- 制約追加前に、動作確認中の二重タップ等で既に重複行が入っている可能性があるため、
-- print_event_idごとに最も古い1件だけ残して他を削除しておく（重複が無ければ何も削除されない）。
DELETE FROM public.todos t
USING public.todos t2
WHERE t.print_event_id IS NOT NULL
  AND t.print_event_id = t2.print_event_id
  AND (t.created_at, t.id) > (t2.created_at, t2.id);

ALTER TABLE public.todos
  ADD CONSTRAINT todos_print_event_id_key UNIQUE (print_event_id);
