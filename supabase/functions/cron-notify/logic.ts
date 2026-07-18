/**
 * cron-notifyの中身（JST時刻計算・対象抽出・メッセージ生成・送信判定）。
 * Deno.serveの外に出してあるのは、DBに触れない純粋な関数（getJSTParts等）をユニットテスト
 * できるようにするため。テストはlogic_test.tsを参照。
 */
import { supabase } from "../_shared/supabase-client.ts"
import { pushLine } from "../_shared/line-client.ts"

// ---------------------------------------------------------------------------
// JST time helpers（サーバーはUTCで動く前提。+9時間して壁時計のJST値をUTCのgetterで読む）
// ---------------------------------------------------------------------------
export function getJSTParts(date: Date): { hour: number; weekday: number; dateStr: string } {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000)
  return {
    hour:    jst.getUTCHours(),
    weekday: jst.getUTCDay(),
    dateStr: jst.toISOString().split("T")[0],
  }
}

export function diffInDays(dateStr: string, fromStr: string): number {
  const a = new Date(`${dateStr}T00:00:00Z`).getTime()
  const b = new Date(`${fromStr}T00:00:00Z`).getTime()
  return Math.round((a - b) / 86400000)
}

export function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().split("T")[0]
}

export function fmtDate(dateStr: string): string {
  return dateStr.replace(/-/g, "/")
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
export type NotificationSetting = {
  line_user_id:     string
  frequency:        "daily" | "weekly"
  weekly_day:        number | null
  send_time:         string // "HH:MM:SS"
  digest_enabled:    boolean
  reminder_enabled:  boolean
  send_when_empty:   boolean
}

export type TodoRow = { id: string; title: string; due_date: string; category: string | null }

// todos/print_events は現時点でユーザー単位のスコープを持たない（送信先が1:1のため）。
// 将来グループ対応する際は、この関数にfamily_idでの絞り込みを追加する。
export async function getReminderTargets(todayStr: string): Promise<TodoRow[]> {
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

export async function getDigestData(
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
export function buildReminderBody(todos: TodoRow[]): string {
  if (todos.length === 0) return "本日・近日の締切はありません"
  return todos.map((t) => {
    const suffix = t.category === "要準備" ? "\n準備が必要です" : ""
    return `・${t.title}（${fmtDate(t.due_date)}まで）${suffix}`
  }).join("\n")
}

export function buildDigestBody(
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
    "📅 今週のOTAYORI NAVIまとめ",
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
// weekdayは「今日（JST）が何曜日か」（0=日〜6=土）。締切リマインドは締切日基準で
// 毎時判定する時限通知なので、frequency='weekly'でも曜日に関わらず送る対象になりうる。
// 曜日指定の対象は週次ダイジェストのみ（「今週の頻度設定」はダイジェストの間隔を指す）。
export function isDigestDueToday(setting: Pick<NotificationSetting, "frequency" | "weekly_day">, weekday: number): boolean {
  return setting.frequency === "daily" || setting.weekly_day === weekday
}

export async function sendNotificationForUser(
  setting: NotificationSetting,
  todayStr: string,
  weekday: number,
): Promise<boolean> {
  const digestEnabledToday = setting.digest_enabled && isDigestDueToday(setting, weekday)

  const reminderTodos = setting.reminder_enabled ? await getReminderTargets(todayStr) : []
  const digest        = digestEnabledToday ? await getDigestData(todayStr) : null

  const reminderIsEmpty = reminderTodos.length === 0
  const digestIsEmpty   = !digest || (digest.upcoming.length === 0 && digest.completed.length === 0)

  const shouldSendReminder = setting.reminder_enabled && (setting.send_when_empty || !reminderIsEmpty)
  const shouldSendDigest   = digestEnabledToday && (setting.send_when_empty || !digestIsEmpty)

  if (!shouldSendReminder && !shouldSendDigest) return false

  let text: string
  if (shouldSendReminder && shouldSendDigest && digest) {
    // 同日に両方発生する場合は1通に統合する。リマインド対象がダイジェストの
    // 「未処理のToDo」にも全件含まれる場合は、既に案内済みとみなし「再送」を付記する
    // （titleではなくidで突き合わせる。同名のToDoが複数あっても誤判定しないように）。
    const digestIds = new Set(digest.upcoming.map((t) => t.id))
    const isResend = reminderTodos.length > 0 && reminderTodos.every((t) => digestIds.has(t.id))
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
