import { createClient } from '@supabase/supabase-js'
import type { Print, PrintBook, PrintEvent, PrintEventRow, Todo } from '@/types/print'
import type { NotificationSettings } from '@/types/notification'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

export async function getActivePrints(): Promise<Print[]> {
  const { data, error } = await supabase
    .from('prints')
    .select('*, print_books ( id, title )')
    .is('archived_at', null)
    .order('deadline', { ascending: true, nullsFirst: false })
  if (error) throw error
  return (data ?? []) as unknown as Print[]
}

/** カレンダー・一覧用: print_events + 親 prints + 所属ブック LEFT JOIN（アーカイブ済み除外） */
export async function getActiveEvents(): Promise<PrintEvent[]> {
  const { data, error } = await supabase
    .from('print_events')
    .select(`
      id, event_date, event_time, title, is_deadline, print_id, created_at, target_person, note,
      prints ( id, image_url, target_person, category, content, archived_at, book_id, print_books ( id, title ) )
    `)
    .order('event_date', { ascending: true })
    .order('event_time', { ascending: true, nullsFirst: false })
  if (error) throw error
  // print_id=NULLの手動イベントは常に含める。プリント由来はアーカイブ済みを除外。
  return ((data ?? []) as unknown as PrintEvent[]).filter(e => !e.prints || !e.prints.archived_at)
}

/** ブック一覧取得（アーカイブ済み除外） */
export async function getActiveBooks(): Promise<PrintBook[]> {
  const { data, error } = await supabase
    .from('print_books')
    .select('*')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/** ブック詳細取得 */
export async function getBookById(id: string): Promise<PrintBook | null> {
  const { data, error } = await supabase
    .from('print_books')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null
  return data
}

/** ブックに属するプリント一覧取得 */
export async function getPrintsByBookId(bookId: string): Promise<Print[]> {
  const { data, error } = await supabase
    .from('prints')
    .select('*')
    .eq('book_id', bookId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

/** プリント詳細画面用: 特定プリントの全イベント */
export async function getPrintEvents(printId: string): Promise<PrintEventRow[]> {
  const { data, error } = await supabase
    .from('print_events')
    .select('id, event_date, event_time, title, is_deadline, target_person, note')
    .eq('print_id', printId)
    .order('event_date', { ascending: true })
    .order('event_time', { ascending: true, nullsFirst: false })
  if (error) throw error
  return (data ?? []) as unknown as PrintEventRow[]
}

/** 手動登録イベント1件取得（編集画面用） */
export async function getEventById(id: string): Promise<PrintEvent | null> {
  const { data, error } = await supabase
    .from('print_events')
    .select('id, event_date, event_time, title, is_deadline, print_id, created_at, target_person, note')
    .eq('id', id)
    .is('print_id', null)
    .single()
  if (error) return null
  return { ...(data as unknown as PrintEvent), prints: null }
}

/** 手動イベント新規登録（print_id=NULL） */
export async function createManualEvent(event: {
  event_date: string
  event_time?: string | null
  title: string
  is_deadline: boolean
  target_person?: string | null
  note?: string | null
}): Promise<void> {
  const { error } = await supabase
    .from('print_events')
    .insert({ ...event, print_id: null })
  if (error) throw error
}

/** 手動イベント更新（print_id=NULL のもののみ） */
export async function updateManualEvent(id: string, event: {
  event_date: string
  event_time?: string | null
  title: string
  is_deadline: boolean
  target_person?: string | null
  note?: string | null
}): Promise<void> {
  const { error } = await supabase
    .from('print_events')
    .update(event)
    .eq('id', id)
    .is('print_id', null)
  if (error) throw error
}

/** 手動イベント削除（print_id=NULL のもののみ） */
export async function deleteManualEvent(id: string): Promise<void> {
  const { error } = await supabase
    .from('print_events')
    .delete()
    .eq('id', id)
    .is('print_id', null)
  if (error) throw error
}

export async function getPrintById(id: string): Promise<Print | null> {
  const { data, error } = await supabase
    .from('prints')
    .select('*, print_books ( id, title )')
    .eq('id', id)
    .single()
  if (error) return null
  return data as unknown as Print
}

export async function getArchivedPrints(): Promise<Print[]> {
  const { data, error } = await supabase
    .from('prints')
    .select('*, print_books ( id, title )')
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as Print[]
}

/** プリント詳細画面用: 指定したprint_event群に紐づくToDo一覧（todo_enabled=trueのみ） */
export async function getTodosByEventIds(eventIds: string[]): Promise<Todo[]> {
  if (eventIds.length === 0) return []
  const { data, error } = await supabase
    .from('todos')
    .select('*')
    .in('print_event_id', eventIds)
    .eq('todo_enabled', true)
    .order('due_date', { ascending: true, nullsFirst: false })
  if (error) throw error
  return (data ?? []) as unknown as Todo[]
}

/** カレンダー画面用: 有効かつ未完了のToDo一覧（期限強調表示のため） */
export async function getActiveTodos(): Promise<Todo[]> {
  const { data, error } = await supabase
    .from('todos')
    .select('*')
    .eq('todo_enabled', true)
    .eq('status', '未完了')
    .not('due_date', 'is', null)
    .order('due_date', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as Todo[]
}

/** ToDoの完了/未完了をトグル */
export async function updateTodoStatus(id: string, completed: boolean): Promise<void> {
  const { error } = await supabase
    .from('todos')
    .update({
      status:       completed ? '完了' : '未完了',
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq('id', id)
  if (error) throw error
}

/** 通知設定取得（未作成の場合はnull。webhook-line側で初回インタラクション時に自動作成される想定） */
export async function getNotificationSettings(lineUserId: string): Promise<NotificationSettings | null> {
  const { data, error } = await supabase
    .from('notification_settings')
    .select('*')
    .eq('line_user_id', lineUserId)
    .maybeSingle()
  if (error) throw error
  return data
}

/** 通知設定を作成/更新（未作成の場合はデフォルト値とマージしてINSERTされる） */
export async function upsertNotificationSettings(
  lineUserId: string,
  settings: Partial<Omit<NotificationSettings, 'id' | 'line_user_id' | 'updated_at'>>,
): Promise<void> {
  const { error } = await supabase
    .from('notification_settings')
    .upsert(
      { line_user_id: lineUserId, ...settings, updated_at: new Date().toISOString() },
      { onConflict: 'line_user_id' },
    )
  if (error) throw error
}

export async function archivePrint(id: string): Promise<void> {
  const { error } = await supabase
    .from('prints')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function unarchivePrint(id: string): Promise<void> {
  const { error } = await supabase
    .from('prints')
    .update({ archived_at: null })
    .eq('id', id)
  if (error) throw error
}
