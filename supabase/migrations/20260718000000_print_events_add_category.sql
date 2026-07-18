-- print_events にToDo化の判定材料となるcategoryカラムを追加
-- '要準備' / '提出のみ' / 'イベント参加' / null（Claude解析プロンプトが判定して設定する）
ALTER TABLE public.print_events
  ADD COLUMN category TEXT;
