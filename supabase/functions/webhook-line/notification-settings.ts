/**
 * ユーザーの初回インタラクション時に、通知設定（テスト期間デフォルト：毎日22時・全ON）を
 * 自動作成する。ignoreDuplicatesでON CONFLICT DO NOTHING相当にし、Web設定画面（/settings）で
 * 変更済みの設定は上書きしない。
 */
import { supabase } from "./clients.ts"

export async function ensureNotificationSettings(userId: string): Promise<void> {
  const { error } = await supabase
    .from("notification_settings")
    .upsert(
      {
        line_user_id:     userId,
        frequency:        "daily",
        send_time:        "22:00",
        digest_enabled:   true,
        reminder_enabled: true,
        send_when_empty:  true,
      },
      { onConflict: "line_user_id", ignoreDuplicates: true },
    )
  if (error) console.error("[ensureNotificationSettings]", error)
}
