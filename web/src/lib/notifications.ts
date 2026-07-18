import { supabase } from './supabase-client'
import type { NotificationSettings } from '@/types/notification'

/**
 * `notification_settings`は現行テーブルの中で唯一`line_user_id`単位でスコープされている
 * （週次ダイジェスト・締切リマインドの送信可否をユーザーごとに切り替えるため）。
 * 行は通常webhook-line側の初回インタラクションで自動作成されるが、LINEでまだ一度も
 * 話しかけていないユーザーが先に設定画面を開いた場合に備え、upsertNotificationSettingsは
 * 行が無ければ作成、あれば更新の両対応にしている。
 */

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
