/**
 * cron-reminder — LINE push notifications for upcoming deadlines (Phase 3)
 *
 * Triggered by Supabase pg_cron or a scheduled invocation.
 * Checks for prints with deadlines: tomorrow / 3 days away / 7 days away.
 *
 * 注意: このFunctionは`prints.deadline`を直接見る初期実装で、現状pg_cronにも
 * スケジュール登録されていない（未使用の可能性が高い）。ToDoベースの締切リマインドは
 * cron-notify（notification_settings連動、カテゴリ別の通知日数ルール付き）で
 * 別途実装済みのため、実質的にこちらはcron-notifyに置き換えられている。
 * 削除するか、あえて残すか（例えばprint_events由来ではない古いデータ向け）は要判断。
 *
 * Setup (run in Supabase SQL editor after deploying this function):
 *   SELECT cron.schedule(
 *     'reminder-push',
 *     '0 8 * * *',   -- every day at 8:00 JST (adjust UTC offset as needed)
 *     $$
 *       SELECT net.http_post(
 *         url := 'https://<project>.supabase.co/functions/v1/cron-reminder',
 *         headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb
 *       );
 *     $$
 *   );
 */
import { supabase } from "../_shared/supabase-client.ts"
import { pushLine } from "../_shared/line-client.ts"

function buildReminderText(
  print: { target_person: string | null; category: string | null; content: string | null; deadline: string | null },
  daysLeft: number,
): string {
  const label = daysLeft === 1 ? "明日" : `${daysLeft}日後`
  return [
    `⏰ 期限リマインダー（${label}）`,
    "",
    `👤 対象：${print.target_person ?? "不明"}`,
    `📌 種別：${print.category ?? "その他"}`,
    `⏰ 締切：${print.deadline?.replace(/-/g, "/") ?? "未定"}`,
    `📝 内容：\n${print.content ?? "（内容なし）"}`,
  ].join("\n")
}

Deno.serve(async (req) => {
  // Simple auth check — called by pg_cron with service role key
  const auth = req.headers.get("authorization") ?? ""
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  if (!auth.includes(serviceKey)) {
    return new Response("Unauthorized", { status: 401 })
  }

  const allowedIds = (Deno.env.get("ALLOWED_LINE_USER_IDS") ?? "").split(",").filter(Boolean)
  if (allowedIds.length === 0) {
    return new Response("No LINE user IDs configured", { status: 500 })
  }

  const today = new Date()
  const targets = [1, 3, 7]

  let notified = 0

  for (const daysLeft of targets) {
    const target = new Date(today)
    target.setDate(today.getDate() + daysLeft)
    const targetDate = target.toISOString().split("T")[0]

    const { data: prints, error } = await supabase
      .from("prints")
      .select("target_person, category, content, deadline")
      .eq("deadline", targetDate)
      .is("archived_at", null)

    if (error) {
      console.error("[cron-reminder] DB error", error)
      continue
    }
    if (!prints || prints.length === 0) continue

    for (const print of prints) {
      const text = buildReminderText(print, daysLeft)
      for (const userId of allowedIds) {
        await pushLine(userId, text)
        notified++
      }
    }
  }

  return new Response(JSON.stringify({ notified }), {
    status:  200,
    headers: { "Content-Type": "application/json" },
  })
})
