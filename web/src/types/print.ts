export interface Print {
  id: string
  image_url: string | null
  target_person: string | null
  category: '予定' | '持ち物' | '提出物' | 'その他' | null
  date: string | null      // YYYY-MM-DD
  deadline: string | null  // YYYY-MM-DD
  content: string | null
  raw_text: string | null
  archived_at: string | null
  book_id: string | null   // 所属するブックのID（NULL = 単発プリント）
  print_books?: { id: string; title: string } | null
  created_at: string
}

export interface PrintBook {
  id: string
  title: string
  archived_at: string | null
  created_at: string
}

/** print_events の単体行（詳細画面・編集画面で使用） */
export interface PrintEventRow {
  id: string
  event_date: string        // YYYY-MM-DD
  event_time: string | null // HH:MM:SS (DBはTIME型、表示はHH:MMに切り詰め)
  title: string
  is_deadline: boolean
  target_person: string | null
  note: string | null
}

/** print_events + 親 prints JOIN（カレンダー・一覧で使用） */
export interface PrintEvent extends PrintEventRow {
  print_id: string | null  // NULL = プリント非依存の手動登録イベント
  created_at: string
  prints: {
    id: string
    image_url: string | null
    target_person: string | null
    category: '予定' | '持ち物' | '提出物' | 'その他' | null
    content: string | null
    archived_at: string | null
    book_id: string | null
    print_books: { id: string; title: string } | null
  } | null
}

export const CATEGORY_COLOR: Record<string, string> = {
  '予定':   'bg-blue-100 text-blue-700',
  '提出物': 'bg-red-100 text-red-700',
  '持ち物': 'bg-green-100 text-green-700',
  'その他': 'bg-gray-100 text-gray-600',
}

export const CATEGORY_DOT: Record<string, string> = {
  '予定':   'bg-blue-500',
  '提出物': 'bg-red-500',
  '持ち物': 'bg-green-500',
  'その他': 'bg-gray-400',
}
