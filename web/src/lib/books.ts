import { supabase } from './supabase-client'
import type { Print, PrintBook } from '@/types/print'

/**
 * `print_books`（P5: 複数プリントをまとめて登録する「ブック」機能）へのアクセス関数群。
 * ブックはLINEのリッチメニュー「ブックで登録」経由でのみ作成され（webhook-line側）、
 * Web側では参照専用（作成・編集UIは無い）。
 */

/** ブック一覧取得（アーカイブ済み除外、作成日の新しい順） */
export async function getActiveBooks(): Promise<PrintBook[]> {
  const { data, error } = await supabase
    .from('print_books')
    .select('*')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/** ブック詳細画面用: 1件取得。存在しない/エラー時はnullを返す */
export async function getBookById(id: string): Promise<PrintBook | null> {
  const { data, error } = await supabase
    .from('print_books')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null
  return data
}

/** ブック詳細画面用: そのブックに属するプリントを登録順（古い順）に取得する */
export async function getPrintsByBookId(bookId: string): Promise<Print[]> {
  const { data, error } = await supabase
    .from('prints')
    .select('*')
    .eq('book_id', bookId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}
