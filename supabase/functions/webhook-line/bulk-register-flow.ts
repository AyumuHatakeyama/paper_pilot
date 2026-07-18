/**
 * 予定一括登録（リッチメニュー → 自由記述テキスト → Claudeパース → 確認 → print_events登録）。
 *
 * pending_registrations.status の状態遷移:
 *   awaiting_input        -- リッチメニュー「予定登録」押下直後。次のテキストを一次パース
 *   clarifying            -- Claudeが情報不足と判断し逆質問中。次のテキストは質問への回答
 *   awaiting_confirmation -- パース完了、Quick Reply「はい/いいえ」の回答待ち
 * いずれの状態も、無関係な操作（新規画像送信・別の予定登録の開始）で無条件に上書きされる。
 *
 * このフロー経由の登録は件数が多く個別のToDo確認に向かないため、確認プロンプトは出さず
 * todo_enabled=falseで自動的にtodosへ記録する。
 */
import { supabase, anthropic } from "./clients.ts"
import { replyLine, textMessage } from "../_shared/line-client.ts"
import { getJSTDateString } from "../_shared/jst-date.ts"
import { SESSION_TTL_MS, BULK_REGISTER_CONFIRM_YES, BULK_REGISTER_CONFIRM_NO } from "./constants.ts"
import { insertTodosForEvents } from "./print-flow.ts"

export type DraftEvent = {
  event_date:  string
  event_time:  string | null
  title:       string
  is_deadline: boolean
}

type ParseResult = {
  status:   "ready" | "needs_clarification"
  question: string | null
  events:   DraftEvent[]
}

export type PendingRegistration = {
  id:                     string
  status:                 "awaiting_input" | "clarifying" | "awaiting_confirmation"
  draft_events:           DraftEvent[] | null
  clarification_context:  string | null
}

// context省略: awaiting_inputからの初回パース。context指定: clarifyingでの逆質問への回答を
// 直前のdraft_events／質問文とあわせて渡し、Claudeに会話全体を都度再解釈させる一問一答方式。
async function parseRegistrationText(
  text: string,
  context?: { draftEvents: DraftEvent[]; clarificationContext: string },
): Promise<ParseResult> {
  const today = getJSTDateString()

  const userContent = context
    ? `【これまでに解析済みのイベント】
${JSON.stringify(context.draftEvents)}

【ユーザーへの質問】
${context.clarificationContext}

【ユーザーの回答】
${text}`
    : text

  const response = await anthropic.messages.create({
    model:      "claude-sonnet-4-6",
    max_tokens: 4096,
    system: `あなたは子供の学校・保育園の予定をカレンダーに一括登録するための解析アシスタントです。
ユーザーが入力した自由形式のテキストを、以下のJSON形式に構造化してください。

{
  "status": "ready" または "needs_clarification",
  "question": "確認が必要な場合の逆質問（不要な場合はnull）",
  "events": [
    { "event_date": "YYYY-MM-DD", "event_time": "HH:MM または null", "title": "予定名", "is_deadline": false }
  ]
}

・today: ${today}（年の記載を省略している場合はこの日付を基準に補完してください）
・日付範囲（例：8/12-14、8/12〜8/14）は日数分に展開し、1日1件のイベントとしてeventsに含めてください。
・提出締切・申込締切などはis_deadline: trueにしてください。
・対象者（誰の予定か）や日付など、登録に必要な情報が読み取れず解釈に迷う場合は、
  無理に推測せずstatusを"needs_clarification"にし、questionに質問を一つだけ書いてください。
  その際、既に読み取れている情報があればeventsに含めたまま返してください（わからない部分だけ聞く）。
・十分な情報が揃っている場合はstatusを"ready"にし、questionはnullにしてください。
・JSON以外は出力しないでください。`,
    messages: [{ role: "user", content: userContent }],
  })

  // Claudeが```json ... ```のコードフェンスで囲んで返すことがあるため、パース前に取り除く
  const raw     = response.content[0].type === "text" ? response.content[0].text : "{}"
  const cleaned = raw.replace(/^```(?:json)?\n?|\n?```$/g, "").trim()
  return JSON.parse(cleaned)
}

export function buildEventListText(events: DraftEvent[]): string {
  return events.map((e) => {
    const icon = e.is_deadline ? "⏰" : "📅"
    const time = e.event_time ? ` ${e.event_time}` : ""
    return `${icon} ${e.event_date.replace(/-/g, "/")}${time} ${e.title}`
  }).join("\n")
}

export function buildConfirmationText(events: DraftEvent[]): string {
  return ["以下の内容で登録します。よろしいですか？", "", buildEventListText(events)].join("\n")
}

async function replyWithConfirmation(replyToken: string, events: DraftEvent[]): Promise<void> {
  await replyLine(replyToken, [
    {
      type: "text",
      text: buildConfirmationText(events),
      quickReply: {
        items: [
          {
            type:   "action",
            action: { type: "postback", label: "はい", data: BULK_REGISTER_CONFIRM_YES },
          },
          {
            type:   "action",
            action: { type: "postback", label: "いいえ", data: BULK_REGISTER_CONFIRM_NO },
          },
        ],
      },
    },
  ])
}

// リッチメニュー「予定登録」postback受信時のエントリポイント。
// 既存セッション（どの状態でも）は無条件で上書きし、awaiting_inputから再スタートする。
export async function handleBulkRegisterStart(replyToken: string, userId: string): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  const { error } = await supabase
    .from("pending_registrations")
    .upsert(
      {
        line_user_id:          userId,
        status:                "awaiting_input",
        draft_events:          null,
        clarification_context: null,
        expires_at:            expiresAt,
      },
      { onConflict: "line_user_id" },
    )

  if (error) {
    console.error("[handleBulkRegisterStart]", error)
    await replyLine(replyToken, [textMessage("エラーが発生しました。もう一度試してください。")])
    return
  }

  await replyLine(
    replyToken,
    [textMessage("登録したい予定を入力してください（複数行OK。例：8/12-14 学童お弁当持参）")],
  )
}

// pending_registrationsがawaiting_input／clarifyingのときのテキスト受信を処理する。
// どちらの状態でもparseRegistrationTextの戻り値(status)に応じて次の状態へ遷移するだけなので、
// awaiting_input→clarifying→…→awaiting_confirmation という遷移をここ一箇所で完結できる。
export async function handleBulkRegisterText(
  replyToken: string,
  text: string,
  session: PendingRegistration,
): Promise<void> {
  // 確認待ち中にテキストが来た場合はボタン操作を促すだけ（パースし直さない）
  if (session.status === "awaiting_confirmation") {
    await replyLine(replyToken, [textMessage("「はい」または「いいえ」のボタンでお答えください。")])
    return
  }

  try {
    const result = session.status === "clarifying"
      ? await parseRegistrationText(text, {
          draftEvents:          session.draft_events ?? [],
          clarificationContext: session.clarification_context ?? "",
        })
      : await parseRegistrationText(text)

    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()

    if (result.status === "needs_clarification") {
      await supabase.from("pending_registrations").update({
        status:                "clarifying",
        draft_events:           result.events,
        clarification_context: result.question,
        expires_at:             expiresAt,
      }).eq("id", session.id)
      await replyLine(replyToken, [textMessage(result.question ?? "詳細を教えてください。")])
      return
    }

    await supabase.from("pending_registrations").update({
      status:                "awaiting_confirmation",
      draft_events:           result.events,
      clarification_context:  null,
      expires_at:             expiresAt,
    }).eq("id", session.id)
    await replyWithConfirmation(replyToken, result.events)
  } catch (err) {
    console.error("[handleBulkRegisterText]", err)
    await supabase.from("pending_registrations").delete().eq("id", session.id)
    await replyLine(
      replyToken,
      [textMessage("予定の解析中にエラーが発生しました。もう一度「予定登録」からやり直してください。")],
    )
  }
}

// 確認Quick Reply「はい/いいえ」postback受信時の処理。
// セッションは処理前に削除する（二重postback対策。P3のinstruction_noと同じ方針）。
export async function handleBulkRegisterConfirm(
  replyToken: string,
  userId: string,
  data: string,
): Promise<void> {
  const { data: session, error } = await supabase
    .from("pending_registrations")
    .select("id, draft_events")
    .eq("line_user_id", userId)
    .eq("status", "awaiting_confirmation")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle()

  if (error) {
    console.error("[handleBulkRegisterConfirm] DB error", error)
    await replyLine(replyToken, [textMessage("エラーが発生しました。もう一度試してください。")])
    return
  }

  if (!session) {
    await replyLine(
      replyToken,
      [textMessage("登録内容の有効期限が切れました。もう一度「予定登録」からやり直してください。")],
    )
    return
  }

  await supabase.from("pending_registrations").delete().eq("id", session.id)

  if (data === BULK_REGISTER_CONFIRM_NO) {
    await replyLine(replyToken, [textMessage("登録をキャンセルしました。")])
    return
  }

  const events    = (session.draft_events as DraftEvent[] | null) ?? []
  const eventRows = events
    .filter((e) => e.event_date && e.title)
    .map((e) => ({
      print_id:    null,
      event_date:  e.event_date,
      event_time:  e.event_time ?? null,
      title:       e.title,
      is_deadline: e.is_deadline ?? false,
    }))

  if (eventRows.length === 0) {
    await replyLine(replyToken, [textMessage("登録できる予定がありませんでした。")])
    return
  }

  const { data: insertedRows, error: insertError } = await supabase
    .from("print_events")
    .insert(eventRows)
    .select("id, event_date, title")
  if (insertError) {
    console.error("[handleBulkRegisterConfirm] insert error", insertError)
    await replyLine(replyToken, [textMessage("登録中にエラーが発生しました。もう一度試してください。")])
    return
  }

  // LINEチャット一括登録は件数が多く個別確認に向かないため、
  // todo_enabled=falseで記録だけ行い、ToDo確認プロンプトは出さない
  await insertTodosForEvents(
    (insertedRows ?? []).map((r) => ({ id: r.id, event_date: r.event_date, title: r.title, category: null })),
    { reminderEnabled: false, todoEnabled: false },
  )

  await replyLine(
    replyToken,
    [textMessage(["✅ 登録しました。", "", buildEventListText(events)].join("\n"))],
  )
}
