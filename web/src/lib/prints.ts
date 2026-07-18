import { supabase } from './supabase-client'
import type { Print } from '@/types/print'

/**
 * `prints`テーブルへのCRUDに近いアクセス関数群。
 * すべてのクエリで`print_books ( id, title )`をLEFT JOINしているのは、一覧・詳細画面が
 * 「このプリントはどのブックに属しているか」を常に表示できるようにするため
 * （`book_id`がNULLの単発プリントでも`print_books`はNULLになるだけで問題なく動く）。
 */

/** カレンダー・一覧画面用: アーカイブされていないプリントを締切の近い順に取得する */
export async function getActivePrints(): Promise<Print[]> {
  const { data, error } = await supabase
    .from('prints')
    .select('*, print_books ( id, title )')
    .is('archived_at', null)
    .order('deadline', { ascending: true, nullsFirst: false })
  if (error) throw error
  return (data ?? []) as unknown as Print[]
}

/** プリント詳細画面用: 1件取得。存在しない/エラー時はnullを返す（呼び出し側で「見つかりません」表示に使う） */
export async function getPrintById(id: string): Promise<Print | null> {
  const { data, error } = await supabase
    .from('prints')
    .select('*, print_books ( id, title )')
    .eq('id', id)
    .single()
  if (error) return null
  return data as unknown as Print
}

/** アーカイブ画面用: アーカイブ済みプリントをアーカイブ日時の新しい順に取得する */
export async function getArchivedPrints(): Promise<Print[]> {
  const { data, error } = await supabase
    .from('prints')
    .select('*, print_books ( id, title )')
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as Print[]
}

/** プリントをアーカイブする（論理削除。行自体は残るため元に戻せる） */
export async function archivePrint(id: string): Promise<void> {
  const { error } = await supabase
    .from('prints')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/** アーカイブを解除し、カレンダー・一覧に復帰させる */
export async function unarchivePrint(id: string): Promise<void> {
  const { error } = await supabase
    .from('prints')
    .update({ archived_at: null })
    .eq('id', id)
  if (error) throw error
}
