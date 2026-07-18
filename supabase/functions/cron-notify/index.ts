/**
 * cron-notify — 週次ダイジェスト・締切リマインドのLINEプッシュ通知
 *
 * `notification_settings` の頻度・時刻設定に基づき、todosの状態を集計して通知する。
 * pg_cronは固定間隔実行が基本なので「毎時0分に起動し、その時点で送信対象の
 * ユーザーがいるかをDB側の設定と突き合わせて判定する」方式にしている
 * （ユーザーごとに異なるsend_timeを後から実現できるようにするため）。
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
import { createClient } from "npm:@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
)

const LINE_BOT_API = "https://api.line.me/v2/bot/message"

async function pushLine(userId: string, text: string): Promise<void> {
  const token = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!
  const res   = await fetch(`${LINE_BOT_API}/push`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body:    JSON.stringify({ to: userId, messages: [{ type: "text", text }] }),
  })
  if (!res.ok) console.error("[pushLine]", await res.text())
}

// ---------------------------------------------------------------------------
// JST time helpers（サーバーはUTCで動く前提。+9時間して壁時計のJST値をUTCのgetterで読む）
// ---------------------------------------------------------------------------
function getJSTParts(date: Date): { hour: number; weekday: number; dateStr: string } {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000)
  return {
    hour:    jst.getUTCHours(),
    weekday: jst.getUTCDay(),
    dateStr: jst.toISOString().split("T")[0],
  }
}

function diffInDays(dateStr: string, fromStr: string): number {
  const a = new Date(`${dateStr}T00:00:00Z`).getTime()
  const b = new Date(`${fromStr}T00:00:00Z`).getTime()
  return Math.round((a - b) / 86400000)
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().split("T")[0]
}

function fmtDate(dateStr: string): string {
  return dateStr.replace(/-/g, "/")
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
type NotificationSetting = {
  line_user_id:     string
  frequency:        "daily" | "weekly"
  weekly_day:        number | null
  send_time:         string // "HH:MM:SS"
  digest_enabled:    boolean
  reminder_enabled:  boolean
  send_when_empty:   boolean
}

type TodoRow = { id: string; title: string; due_date: string; category: string | null }

// todos/print_events は現時点でユーザー単位のスコープを持たない（送信先が1:1のため）。
// 将来グループ対応する際は、この関数にfamily_idでの絞り込みを追加する。
async function getReminderTargets(todayStr: string): Promise<TodoRow[]> {
  const { data, error } = await supabase
    .from("todos")
    .select("id, title, due_date, category")
    .eq("status", "未完了")
    .eq("reminder_enabled", true)
    .not("due_date", "is", null)

  if (error) {
    console.error("[getReminderTargets] DB error", error)
    return []
  }

  return ((data ?? []) as TodoRow[]).filter((todo) => {
    const days = diffInDays(todo.due_date, todayStr)
    if (todo.category === "要準備")   return days === 3 || days === 0
    if (todo.category === "提出のみ") return days === 1 || days === 0
    return days === 0 // カテゴリ未設定・イベント参加は当日のみ
  })
}

async function getDigestData(
  todayStr: string,
): Promise<{ upcoming: TodoRow[]; completed: { id: string; title: string }[] }> {
  const weekLater = addDays(todayStr, 7)
  const weekAgo   = addDays(todayStr, -7)

  const { data: upcoming, error: upcomingError } = await supabase
    .from("todos")
    .select("id, title, due_date, category")
    .eq("status", "未完了")
    .lte("due_date", weekLater)
    .order("due_date", { ascending: true })
  if (upcomingError) console.error("[getDigestData] upcoming DB error", upcomingError)

  const { data: completed, error: completedError } = await supabase
    .from("todos")
    .select("id, title")
    .eq("status", "完了")
    .gte("completed_at", weekAgo)
  if (completedError) console.error("[getDigestData] completed DB error", completedError)

  return { upcoming: (upcoming ?? []) as TodoRow[], completed: completed ?? [] }
}

// ---------------------------------------------------------------------------
// Message building
// ---------------------------------------------------------------------------
function buildReminderBody(todos: TodoRow[]): string {
  if (todos.length === 0) return "本日・近日の締切はありません"
  return todos.map((t) => {
    const suffix = t.category === "要準備" ? "\n準備が必要です" : ""
    return `・${t.title}（${fmtDate(t.due_date)}まで）${suffix}`
  }).join("\n")
}

function buildDigestBody(
  upcoming: TodoRow[],
  completed: { id: string; title: string }[],
  todayStr: string,
): string {
  const weekLater = addDays(todayStr, 7)
  // 「来週の締切」は未処理のToDo全件のうち、今日より後〜1週間以内のもの
  // （当日締切分は締切リマインド側で個別に案内済みのため除く）
  const nextWeek = upcoming.filter((t) => t.due_date > todayStr && t.due_date <= weekLater)

  const unresolvedLines = upcoming.length > 0
    ? upcoming.map((t) => `・${t.title}（${fmtDate(t.due_date)}まで）`).join("\n")
    : "未処理のToDoはありません"

  const nextWeekLines = nextWeek.length > 0
    ? nextWeek.map((t) => `・${fmtDate(t.due_date)} ${t.title}`).join("\n")
    : "来週の締切はありません"

  return [
    "📅 今週のPaperPilotまとめ",
    "",
    `■ 未処理のToDo（${upcoming.length}件）`,
    unresolvedLines,
    "",
    "■ 来週の締切",
    nextWeekLines,
    "",
    "■ 今週の実績",
    `✅ ${completed.length}件処理済み`,
  ].join("\n")
}

// ---------------------------------------------------------------------------
// Per-user send
// ---------------------------------------------------------------------------
async function sendNotificationForUser(setting: NotificationSetting, todayStr: string): Promise<boolean> {
  const reminderTodos = setting.reminder_enabled ? await getReminderTargets(todayStr) : []
  const digest        = setting.digest_enabled ? await getDigestData(todayStr) : null

  const reminderIsEmpty = reminderTodos.length === 0
  const digestIsEmpty   = !digest || (digest.upcoming.length === 0 && digest.completed.length === 0)

  const shouldSendReminder = setting.reminder_enabled && (setting.send_when_empty || !reminderIsEmpty)
  const shouldSendDigest   = setting.digest_enabled && (setting.send_when_empty || !digestIsEmpty)

  if (!shouldSendReminder && !shouldSendDigest) return false

  let text: string
  if (shouldSendReminder && shouldSendDigest && digest) {
    // 同日に両方発生する場合は1通に統合する。リマインド対象がダイジェストの
    // 「未処理のToDo」にも全件含まれる場合は、既に案内済みとみなし「再送」を付記する。
    const digestTitles = new Set(digest.upcoming.map((t) => t.title))
    const isResend = reminderTodos.length > 0 && reminderTodos.every((t) => digestTitles.has(t.title))
    const reminderHeader = `📋 本日締切のご案内${isResend ? "（再送）" : ""}`
    text = [
      reminderHeader,
      "",
      buildReminderBody(reminderTodos),
      "",
      buildDigestBody(digest.upcoming, digest.completed, todayStr),
    ].join("\n")
  } else if (shouldSendReminder) {
    text = ["⏰ 締切のお知らせ", "", buildReminderBody(reminderTodos)].join("\n")
  } else {
    text = buildDigestBody(digest!.upcoming, digest!.completed, todayStr)
  }

  await pushLine(setting.line_user_id, text)
  return true
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
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

  const targets = ((settings ?? []) as NotificationSetting[]).filter((s) => {
    const settingHour = parseInt(s.send_time.slice(0, 2), 10)
    if (settingHour !== hour) return false
    if (s.frequency === "weekly") return s.weekly_day === weekday
    return true
  })

  let notified = 0
  for (const setting of targets) {
    const sent = await sendNotificationForUser(setting, dateStr)
    if (sent) notified++
  }

  return new Response(JSON.stringify({ checked: settings?.length ?? 0, matched: targets.length, notified }), {
    status:  200,
    headers: { "Content-Type": "application/json" },
  })
})
