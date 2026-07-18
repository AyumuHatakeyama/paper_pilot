/**
 * 1枚のプリント（LINEで送られた画像1件、またはブックの1ページ）の解析結果。
 * `date`/`deadline`はこのプリントに複数の日程・締切がある場合でも「代表的な1件ずつ」しか
 * 持たない後方互換フィールドで、全件の一覧は`print_events`（PrintEvent）側にある。
 * 日程・締切の表示は基本的にprint_eventsを使い、Print.date/deadlineはprint_eventsが
 * 0件のとき（古いデータ等）のフォールバック用途と考えること。
 */
export interface Print {
  id: string
  image_url: string | null
  target_person: string | null
  category: '予定' | '持ち物' | '提出物' | 'その他' | null
  date: string | null      // YYYY-MM-DD（print_eventsのうちis_deadline=falseの最初の1件。フォールバック用）
  deadline: string | null  // YYYY-MM-DD（print_eventsのうちis_deadline=trueの最初の1件。フォールバック用）
  content: string | null
  raw_text: string | null  // Claudeが返した解析結果の生JSON文字列（デバッグ・再解析調査用。画面表示では未使用）
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

/**
 * プリントから抽出した予定・締切のToDo。print_events 1件につき通常1件だが
 * （DB上のUNIQUE制約ではなく、作成経路がそう作っているだけの運用上の前提）、
 * `todo_enabled=false`の行はLINEチャット一括登録・ブック登録経由の自動記録で、
 * 通知（cron-notify）の対象外・確認プロンプトの対象外として作られる。
 */
export interface Todo {
  id: string
  print_event_id: string | null
  title: string
  due_date: string | null // YYYY-MM-DD
  category: '要準備' | '提出のみ' | 'イベント参加' | null
  status: '未完了' | '完了'
  reminder_enabled: boolean // trueの場合のみcron-notifyの締切リマインド対象になる
  todo_enabled: boolean     // falseの場合はWebのToDo一覧・通知どちらにも出さない（記録のみ）
  completed_at: string | null
  created_at: string
}

/** カテゴリ別バッジ色（ToDoのcategory用）。null/未知の値の場合は呼び出し側でフォールバック色を使う */
export const TODO_CATEGORY_COLOR: Record<string, string> = {
  '要準備':       'bg-orange-100 text-orange-700',
  '提出のみ':     'bg-sky-100 text-sky-700',
  'イベント参加': 'bg-emerald-100 text-emerald-700',
}

/** カテゴリ別バッジ色（プリントのcategory用） */
export const CATEGORY_COLOR: Record<string, string> = {
  '予定':   'bg-blue-100 text-blue-700',
  '提出物': 'bg-red-100 text-red-700',
  '持ち物': 'bg-green-100 text-green-700',
  'その他': 'bg-gray-100 text-gray-600',
}
