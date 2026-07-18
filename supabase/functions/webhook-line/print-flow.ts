/**
 * プリント画像の解析結果を prints / print_events に保存し、LINEへ返信するまでの一連の処理（P1）。
 *
 * analyzeAndSavePrint は3箇所から共通で呼ばれる：
 *   - handlePostbackの「指示なし」
 *   - handleTextでの「指示あり」後のテキスト回答
 *   - ブック登録（finalizeBook）の複数ページ解析
 * bookIdを渡すとprints.book_idにセットし、todo_enabled=falseで自動記録する
 * （ブック＝年間行事予定一括取り込み相当は件数が多く個別確認に向かないため）。
 */
import { supabase } from "./clients.ts"
import { analyzePrint } from "./claude-analyze.ts"
import { replyLine, textMessage } from "../_shared/line-client.ts"
import type { LineMessage } from "../_shared/line-client.ts"
import { getJSTDateString } from "../_shared/jst-date.ts"
import { INSTRUCTION_YES, INSTRUCTION_NO, TODO_CATEGORIES, WEB_APP_URL } from "./constants.ts"

// Storageに保存済みの公開URLから画像を再取得する。
// セッションにはURLしか保持していないため、「指示あり/なし」確定後の解析タイミングで使う。
async function fetchImageFromUrl(
  url: string,
): Promise<{ buffer: ArrayBuffer; contentType: string }> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`)
  return {
    buffer:      await res.arrayBuffer(),
    contentType: res.headers.get("content-type") ?? "image/jpeg",
  }
}

// action.typeは"postback"（"message"ではない）。displayTextも付けないことで、
// ボタン選択がユーザーの発言としてチャット履歴に残らないようにしている。
export async function replyWithInstructionChoice(replyToken: string): Promise<void> {
  await replyLine(replyToken, [
    {
      type: "text",
      text: "📸 プリントを受け取りました。\n読み取り時に追加の指示はありますか？",
      quickReply: {
        items: [
          {
            type:   "action",
            action: { type: "postback", label: "指示あり", data: INSTRUCTION_YES },
          },
          {
            type:   "action",
            action: { type: "postback", label: "指示なし", data: INSTRUCTION_NO },
          },
        ],
      },
    },
  ])
}

// Claude解析結果（analyzePrintの戻り値）をLINEの解析完了メッセージ本文に整形する
export function buildReplyText(parsed: Record<string, unknown>): string {
  const fmt = (d: unknown) => (d ? String(d).replace(/-/g, "/") : "未定")

  type ParsedEvent = { date: string; title: string; is_deadline: boolean }
  const events = (parsed.events as ParsedEvent[] | undefined) ?? []

  const eventLines = events.length > 0
    ? events.map((e) => {
        const icon = e.is_deadline ? "⏰" : "📅"
        return `${icon} ${fmt(e.date)} ${e.title}`
      }).join("\n")
    : "（日程なし）"

  return [
    "📋 プリント解析完了",
    "",
    `👤 対象：${parsed.target_person ?? "不明"}`,
    `📌 種別：${parsed.category ?? "その他"}`,
    `📝 内容：\n${parsed.content ?? "（内容なし）"}`,
    "",
    eventLines,
    "",
    `👉 カレンダーで確認\n${WEB_APP_URL}`,
  ].join("\n")
}

// print_eventsに紐づくtodosを一括作成する。ブック登録・予定一括登録（LINEチャット一括登録）は
// 件数が多く個別確認に向かないため、todo_enabled=falseで記録のみ行いプロンプトは出さない。
// print_event_idにUNIQUE制約があるため、ignoreDuplicatesで同じイベントへの重複作成を防ぐ。
export async function insertTodosForEvents(
  events: { id: string; event_date: string; title: string; category?: string | null }[],
  opts: { reminderEnabled: boolean; todoEnabled: boolean },
): Promise<void> {
  if (events.length === 0) return
  const rows = events.map((e) => ({
    print_event_id:   e.id,
    title:            e.title,
    due_date:         e.event_date,
    category:         e.category ?? null,
    reminder_enabled: opts.reminderEnabled,
    todo_enabled:     opts.todoEnabled,
  }))
  const { error } = await supabase.from("todos").upsert(rows, { onConflict: "print_event_id", ignoreDuplicates: true })
  if (error) console.error("[insertTodosForEvents] insert error", error)
}

export type SavedPrintEvent = {
  id:          string
  event_date:  string
  title:       string
  is_deadline: boolean
  category:    string | null
}

export async function analyzeAndSavePrint(
  imageUrl: string,
  instruction?: string,
  bookId?: string,
): Promise<{ parsed: Record<string, unknown>; printId: string; savedEvents: SavedPrintEvent[] }> {
  const { buffer, contentType } = await fetchImageFromUrl(imageUrl)
  const parsed = await analyzePrint(buffer, contentType, instruction)

  // Derive date/deadline from events array for backward compat
  type ParsedEvent = {
    date: string
    time?: string | null
    title: string
    is_deadline: boolean
    category?: string | null
  }
  const events = (parsed.events as ParsedEvent[] | undefined) ?? []
  const firstDate     = events.find((e) => !e.is_deadline)?.date ?? null
  const firstDeadline = events.find((e) =>  e.is_deadline)?.date ?? null

  // Save structured data to DB
  const { data: printRow, error: dbError } = await supabase.from("prints").insert({
    image_url:     imageUrl,
    target_person: parsed.target_person ?? null,
    category:      ["予定", "持ち物", "提出物", "その他"].includes(parsed.category as string)
                     ? parsed.category
                     : "その他",
    date:          firstDate,
    deadline:      firstDeadline,
    content:       parsed.content ?? null,
    raw_text:      JSON.stringify(parsed),
    book_id:       bookId ?? null,
  }).select("id").single()
  if (dbError) throw dbError

  const printId = printRow.id as string
  let savedEvents: SavedPrintEvent[] = []

  // Insert each event into print_events
  if (events.length > 0) {
    const eventRows = events
      .filter((e) => e.date && e.title)
      .map((e) => ({
        print_id:    printId,
        event_date:  e.date,
        event_time:  e.time ?? null,
        title:       e.title,
        is_deadline: e.is_deadline ?? false,
        category:    TODO_CATEGORIES.includes(e.category as typeof TODO_CATEGORIES[number]) ? e.category : null,
      }))
    if (eventRows.length > 0) {
      const { data: insertedEvents, error: eventsError } = await supabase
        .from("print_events")
        .insert(eventRows)
        .select("id, event_date, title, is_deadline, category")
      if (eventsError) {
        console.error("[analyzeAndSavePrint] print_events insert error:", eventsError)
      } else {
        savedEvents = (insertedEvents ?? []) as SavedPrintEvent[]
      }
    }
  }

  // ブック登録（年間行事予定一括取り込み相当）経由は個別確認に向かないため、
  // todo_enabled=falseで記録だけ行い、ToDo確認プロンプトは出さない
  if (bookId) {
    await insertTodosForEvents(savedEvents, { reminderEnabled: false, todoEnabled: false })
  }

  return { parsed, printId, savedEvents }
}

// トリガー条件：is_deadline: true または event_date が今日以降のイベントが1件以上ある場合のみ
// ToDo追加のQuick Reply確認を出す。0件ならnullを返しスキップ（従来通りの解析結果のみ返信）。
export function buildTodoPromptMessage(printId: string, events: SavedPrintEvent[]): LineMessage | null {
  if (events.length === 0) return null

  const today = getJSTDateString()
  const qualifies = events.some((e) => e.is_deadline || e.event_date >= today)
  if (!qualifies) return null

  const [first, ...rest] = events
  const label = rest.length > 0 ? `「${first.title}」ほか${rest.length}件` : `「${first.title}」`

  return {
    type: "text",
    text: `📋 このプリントをToDoに追加しますか？\n\n（対象：${label}）`,
    quickReply: {
      items: [
        {
          type:   "action",
          action: {
            type:  "postback",
            label: "ToDoに追加＋リマインドON",
            data:  `action=todo_add&print_id=${printId}&reminder=true`,
          },
        },
        {
          type:   "action",
          action: {
            type:  "postback",
            label: "ToDoに追加（リマインドなし）",
            data:  `action=todo_add&print_id=${printId}&reminder=false`,
          },
        },
        {
          type:   "action",
          action: { type: "postback", label: "ToDo不要（記録のみ）", data: `action=todo_skip&print_id=${printId}` },
        },
      ],
    },
  }
}

export async function analyzeAndReply(
  replyToken: string,
  imageUrl: string,
  instruction?: string,
): Promise<void> {
  try {
    const { parsed, printId, savedEvents } = await analyzeAndSavePrint(imageUrl, instruction)

    const messages = [textMessage(buildReplyText(parsed))]
    const todoPrompt = buildTodoPromptMessage(printId, savedEvents)
    if (todoPrompt) messages.push(todoPrompt)

    await replyLine(replyToken, messages)
  } catch (err) {
    console.error("[analyzeAndReply]", err)
    await replyLine(
      replyToken,
      [textMessage("プリントの解析中にエラーが発生しました。\nもう一度送ってみてください。")],
    )
  }
}
