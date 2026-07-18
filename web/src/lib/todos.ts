import { supabase } from './supabase-client'
import type { Todo } from '@/types/print'

/**
 * `todos`は`print_events`から派生する「対応が必要な予定」で、webhook-line側でしか
 * 作成されない（LINEのToDo確認Quick Reply、またはブック登録・LINEチャット一括登録経由の
 * 自動記録）。Web側は参照と完了/未完了トグルのみを担当する。
 * `todo_enabled=false`の行（一括登録・ブック登録経由）は通知・確認プロンプトの対象外なので、
 * 一覧取得系の関数はすべて`todo_enabled=true`でフィルタしている。
 */

/** プリント詳細画面用: 指定したprint_event群に紐づくToDo一覧（完了/未完了とも表示する） */
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

/** カレンダー画面用: 期限のある未完了ToDoのみ取得する（完了済みは強調表示の対象外なので除く） */
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

/** ToDoの完了/未完了をトグルする。完了にする場合はcompleted_atを記録し、戻す場合はNULLに戻す */
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
