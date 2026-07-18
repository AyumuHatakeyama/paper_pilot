import { supabase } from './supabase-client'
import type { PrintEvent, PrintEventRow } from '@/types/print'

/**
 * `print_events`は「プリントから抽出された予定」と「Web画面から手動追加した予定」を
 * 同じテーブルで扱う。`print_id`がNULLかどうかで区別する：
 *   - print_id あり: LINEでのプリント登録（画像解析・ブック登録・LINEチャット一括登録）由来
 *   - print_id = NULL: Web画面「＋」ボタンからの手動登録
 * 手動イベント系の関数（createManualEvent等）は書き込み時に`.is('print_id', null)`を
 * 条件へ含めることで、誤ってプリント由来の行を書き換えないようにしている
 * （Supabase側のRLSでも同様にprint_id IS NULLの行のみanon書き込みを許可している）。
 */

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

type ManualEventInput = {
  event_date: string
  event_time?: string | null
  title: string
  is_deadline: boolean
  target_person?: string | null
  note?: string | null
}

/** 手動イベント新規登録（print_id=NULL） */
export async function createManualEvent(event: ManualEventInput): Promise<void> {
  const { error } = await supabase
    .from('print_events')
    .insert({ ...event, print_id: null })
  if (error) throw error
}

/** 手動イベント更新（print_id=NULL のもののみ） */
export async function updateManualEvent(id: string, event: ManualEventInput): Promise<void> {
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
