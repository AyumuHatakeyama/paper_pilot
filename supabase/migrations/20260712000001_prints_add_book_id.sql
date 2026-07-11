-- prints にブック参照カラムを追加（NULL = ブックに属さない単発プリント）
ALTER TABLE public.prints
  ADD COLUMN book_id UUID REFERENCES public.print_books(id) ON DELETE SET NULL;

CREATE INDEX idx_prints_book_id ON public.prints (book_id);
