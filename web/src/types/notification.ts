/**
 * 週次ダイジェスト・締切リマインド（cron-notify）の送信可否・頻度・時刻設定。
 * line_user_id単位（1:1想定）で1行。cron-notifyは毎時0分に全行を読み、
 * send_timeの「時」とfrequency/weekly_dayが現在時刻（JST）と一致する行にだけ送信する
 * （分単位までは見ない。詳細はsupabase/functions/cron-notify/index.tsのコメント参照）。
 */
export interface NotificationSettings {
  id: string
  line_user_id: string
  frequency: 'daily' | 'weekly'
  weekly_day: number | null // 0=日,1=月...6=土（frequency='weekly'の場合のみ使用。'daily'の場合は無視される）
  send_time: string // "HH:MM:SS"（DBはTIME型。cron側は先頭2文字＝時のみで比較する）
  digest_enabled: boolean   // 週次ダイジェストを送るか
  reminder_enabled: boolean // 締切リマインドを送るか
  send_when_empty: boolean  // 対象0件でも送信するか（テスト期間はtrue想定。本番運用では false への切り替えを検討）
  updated_at: string
}

/** 曜日選択UI用ラベル。インデックスがDBのweekly_day（0=日）と対応する */
export const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']
