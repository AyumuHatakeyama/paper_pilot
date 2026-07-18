/**
 * cron-notify — 週次ダイジェスト・締切リマインドのLINEプッシュ通知
 *
 * `notification_settings` の頻度・時刻設定に基づき、todosの状態を集計して通知する。
 * pg_cronは固定間隔実行が基本なので「毎時0分に起動し、その時点で送信対象の
 * ユーザーがいるかをDB側の設定と突き合わせて判定する」方式にしている
 * （ユーザーごとに異なるsend_timeを後から実現できるようにするため）。
 * 実処理（時刻計算・対象抽出・メッセージ生成）は./logic.tsに分離してあり、
 * このファイルはHTTPエントリポイント（認証・振り分け）のみを担う。
 *
 * Setup（Supabase SQL editorで、このFunctionをデプロイした後に実行）:
 *   SELECT cron.schedule(
 *     'hourly-notification-check',
 *     '0 * * * *',   -- 毎時0分
 *     $$
 *       SELECT net.http_post(
 *         url     := 'https://<project>.supabase.co/functions/v1/cron-notify',
 *         headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb
 *       );
 *     $$
 *   );
 *
 * 注意: send_timeは「時」単位でしか比較しない（Cronが毎時実行のため）。
 * 分単位の精度が必要になった場合はCron頻度を上げる（例: '*'/'15 * * * *'）。
 */
import { supabase } from "../_shared/supabase-client.ts"
import { getJSTParts, sendNotificationForUser } from "./logic.ts"
import type { NotificationSetting } from "./logic.ts"

Deno.serve(async (req) => {
  // pg_cronからのnet.http_postのみ許可（Authorizationヘッダにservice role keyを含める運用）
  const auth       = req.headers.get("authorization") ?? ""
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  if (!auth.includes(serviceKey)) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { hour, weekday, dateStr } = getJSTParts(new Date())

  const { data: settings, error } = await supabase.from("notification_settings").select("*")
  if (error) {
    console.error("[cron-notify] DB error", error)
    return new Response("DB error", { status: 500 })
  }

  // ここでは「時」だけで絞り込む。曜日指定（frequency='weekly'）はダイジェストの間隔にのみ
  // 効かせるものなので、締切リマインドを見落とさないよう曜日での絞り込みはsendNotificationForUser
  // 側（digest判定のみ）に任せる。
  const targets = ((settings ?? []) as NotificationSetting[]).filter((s) => {
    const settingHour = parseInt(s.send_time.slice(0, 2), 10)
    return settingHour === hour
  })

  const results = await Promise.all(
    targets.map((setting) => sendNotificationForUser(setting, dateStr, weekday)),
  )
  const notified = results.filter(Boolean).length

  return new Response(JSON.stringify({ checked: settings?.length ?? 0, matched: targets.length, notified }), {
    status:  200,
    headers: { "Content-Type": "application/json" },
  })
})
