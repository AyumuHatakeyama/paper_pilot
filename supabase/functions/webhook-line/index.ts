/**
 * webhook-line — LINE Messaging API webhook（画像解析 / チャット / 予定一括登録）
 *
 * このEdge Functionは3つのユーザーフローを1つのwebhookで受け持つ：
 *   1. 画像解析（P1）        : プリント画像を送るとClaudeが構造化して prints/print_events に保存
 *   2. 画像指示確認（P3）     : 画像受信後すぐ解析せず「指示あり/なし」を確認してから解析する
 *   3. 予定一括登録           : リッチメニュー起点でテキストから複数予定をパースし print_events に登録
 *
 * 2と3はどちらも複数回のLINEメッセージ往復が必要なため、DBの一時セッションテーブル
 * （pending_image_sessions / pending_registrations）でユーザーごとの会話状態を保持する。
 * セッションはユーザーごとに最新1件のみ（line_user_idにUNIQUE制約＋upsert）、
 * 5分TTL（expires_at）を過ぎたセッションは黙って無効化され、通常フローに自然に戻る。
 */
import { createClient } from "npm:@supabase/supabase-js@2"
import Anthropic from "npm:@anthropic-ai/sdk"

// ---------------------------------------------------------------------------
// Clients (initialized once per cold start)
// ---------------------------------------------------------------------------
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
)

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! })

const LINE_BOT_API  = "https://api.line.me/v2/bot/message"
const LINE_DATA_API = "https://api-data.line.me/v2/bot/message"
const WEB_APP_URL   = Deno.env.get("WEB_APP_URL") ?? "https://your-app.vercel.app"

const SESSION_TTL_MS = 5 * 60 * 1000 // 各セッションテーブル共通のTTL（放置5分で自動失効）

// postback dataは全フロー共通の1つの文字列空間なので、フローごとに接頭辞で衝突を避ける
// Postback data namespace (P3: 画像指示確認)
const INSTRUCTION_YES = "instruction_yes"
const INSTRUCTION_NO  = "instruction_no"

// Postback data namespace (予定一括登録)
const BULK_REGISTER_START        = "bulk_register_start"
const BULK_REGISTER_CONFIRM_YES  = "bulk_register_confirm_yes"
const BULK_REGISTER_CONFIRM_NO   = "bulk_register_confirm_no"

// ---------------------------------------------------------------------------
// LINE utilities
// ---------------------------------------------------------------------------
// LINEからのWebhookであることをHMAC-SHA256署名で検証する（なりすまし防止）
async function verifySignature(body: string, signature: string): Promise<boolean> {
  const secret = Deno.env.get("LINE_CHANNEL_SECRET")!
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signed   = await crypto.subtle.sign("HMAC", key, enc.encode(body))
  const expected = btoa(String.fromCharCode(...new Uint8Array(signed)))
  return signature === expected
}

// LINEのメッセージID経由で画像バイナリを取得する（画像受信直後のみ使える一時コンテンツ）
async function fetchLineImage(
  messageId: string,
): Promise<{ buffer: ArrayBuffer; contentType: string }> {
  const token = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!
  const res = await fetch(`${LINE_DATA_API}/${messageId}/content`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`LINE image fetch failed: ${res.status}`)
  return {
    buffer:      await res.arrayBuffer(),
    contentType: res.headers.get("content-type") ?? "image/jpeg",
  }
}

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

// LINEメッセージオブジェクトの型。quickReply付きのオブジェクトも入るため厳密な型は付けずRecordで保持
// deno-lint-ignore no-explicit-any
type LineMessage = Record<string, any>

function textMessage(text: string): LineMessage {
  return { type: "text", text }
}

// LINE Reply APIへの送信はどのフローも最終的にここを通る（reply tokenは1回・短時間のみ有効）
async function replyLine(replyToken: string, messages: LineMessage[]): Promise<void> {
  const token = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!
  await fetch(`${LINE_BOT_API}/reply`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body:    JSON.stringify({ replyToken, messages }),
  })
}

// action.typeは"postback"（"message"ではない）。displayTextも付けないことで、
// ボタン選択がユーザーの発言としてチャット履歴に残らないようにしている。
async function replyWithInstructionChoice(replyToken: string): Promise<void> {
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

// ---------------------------------------------------------------------------
// Claude API — analyze print image
// ---------------------------------------------------------------------------
async function analyzePrint(
  buffer: ArrayBuffer,
  contentType: string,
  instruction?: string,
): Promise<Record<string, unknown>> {
  // Convert buffer to base64
  const bytes  = new Uint8Array(buffer)
  let binary   = ""
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  const base64 = btoa(binary)

  const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const
  type MediaType = typeof allowedTypes[number]
  const mediaType: MediaType = (allowedTypes as readonly string[]).includes(contentType)
    ? (contentType as MediaType)
    : "image/jpeg"

  const content = [
    {
      type:   "image" as const,
      source: { type: "base64" as const, media_type: mediaType, data: base64 },
    },
    ...(instruction ? [{ type: "text" as const, text: `【追加指示】${instruction}` }] : []),
  ]

  const response = await anthropic.messages.create({
    model:      "claude-sonnet-4-6",
    max_tokens: 8192,
    system: `以下の画像は子供の学校・保育園から届いたプリントです。
以下の形式でJSONとして構造化してください。

{
  "target_person": "対象者名または学年（不明な場合はnull）",
  "category": "予定 or 持ち物 or 提出物 or その他",
  "content": "内容の要約（Markdown形式で箇条書き）",
  "items": ["持ち物リスト（持ち物の場合のみ、空の場合は空配列）"],
  "events": [
    { "date": "YYYY-MM-DD", "time": "HH:MM or null", "title": "イベント名", "is_deadline": false },
    { "date": "YYYY-MM-DD", "time": null, "title": "締切名", "is_deadline": true }
  ]
}

・eventsには日程・締切を含むすべての予定を列挙してください（1枚のプリントに複数の日程が含まれる場合は全件）。
・単一予定のプリントでも events は必ず配列（要素1件）で返してください。
・is_deadlineは提出締切・申込締切などの場合はtrue、行事・実施日などはfalseにしてください。
・timeはプリントに時刻の記載がある場合のみ "HH:MM" 形式で設定し、記載がない場合は null にしてください。
・表形式の場合、一番左の列は日付である可能性が高い。左端の列を起点に各行の情報を対応づけて読み取ること。
・追加指示がある場合はそれを優先して解釈してください。
・JSON以外は出力しないでください。`,
    messages: [
      {
        role:    "user",
        // deno-lint-ignore no-explicit-any
        content: content as any,
      },
    ],
  })

  // Claudeが```json ... ```のコードフェンスで囲んで返すことがあるため、パース前に取り除く
  const raw     = response.content[0].type === "text" ? response.content[0].text : "{}"
  const cleaned = raw.replace(/^```(?:json)?\n?|\n?```$/g, "").trim()
  return JSON.parse(cleaned)
}

// ---------------------------------------------------------------------------
// Format LINE reply text
// ---------------------------------------------------------------------------
function buildReplyText(parsed: Record<string, unknown>): string {
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

// ---------------------------------------------------------------------------
// Shared: analyze an already-uploaded image and reply with the result
//
// P3フローの2つの出口（handlePostbackの「指示なし」/ handleTextでの「指示あり」後の
// テキスト回答）の両方からここを呼ぶ。呼び出し側でセッション削除を済ませてから呼ぶこと。
// ---------------------------------------------------------------------------
async function analyzeAndReply(
  replyToken: string,
  imageUrl: string,
  instruction?: string,
): Promise<void> {
  try {
    const { buffer, contentType } = await fetchImageFromUrl(imageUrl)
    const parsed = await analyzePrint(buffer, contentType, instruction)

    // Derive date/deadline from events array for backward compat
    type ParsedEvent = { date: string; time?: string | null; title: string; is_deadline: boolean }
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
    }).select("id").single()
    if (dbError) throw dbError

    // Insert each event into print_events
    if (events.length > 0 && printRow?.id) {
      const eventRows = events
        .filter((e) => e.date && e.title)
        .map((e) => ({
          print_id:    printRow.id,
          event_date:  e.date,
          event_time:  e.time ?? null,
          title:       e.title,
          is_deadline: e.is_deadline ?? false,
        }))
      if (eventRows.length > 0) {
        const { error: eventsError } = await supabase.from("print_events").insert(eventRows)
        if (eventsError) console.error("[analyzeAndReply] print_events insert error:", eventsError)
      }
    }

    await replyLine(replyToken, [textMessage(buildReplyText(parsed))])
  } catch (err) {
    console.error("[analyzeAndReply]", err)
    await replyLine(
      replyToken,
      [textMessage("プリントの解析中にエラーが発生しました。\nもう一度送ってみてください。")],
    )
  }
}

// ---------------------------------------------------------------------------
// Bulk registration (rich menu → free-text → confirm → print_events insert)
//
// pending_registrations.status の状態遷移:
//   awaiting_input        -- リッチメニュー「予定登録」押下直後。次のテキストを一次パース
//   clarifying            -- Claudeが情報不足と判断し逆質問中。次のテキストは質問への回答
//   awaiting_confirmation -- パース完了、Quick Reply「はい/いいえ」の回答待ち
// いずれの状態も、無関係な操作（新規画像送信・別の予定登録の開始）で無条件に上書きされる。
// ---------------------------------------------------------------------------
type DraftEvent = {
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

type PendingRegistration = {
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
  const today = new Date().toISOString().split("T")[0]

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

function buildEventListText(events: DraftEvent[]): string {
  return events.map((e) => {
    const icon = e.is_deadline ? "⏰" : "📅"
    const time = e.event_time ? ` ${e.event_time}` : ""
    return `${icon} ${e.event_date.replace(/-/g, "/")}${time} ${e.title}`
  }).join("\n")
}

function buildConfirmationText(events: DraftEvent[]): string {
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
async function handleBulkRegisterStart(replyToken: string, userId: string): Promise<void> {
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
async function handleBulkRegisterText(
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
async function handleBulkRegisterConfirm(
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

  const { error: insertError } = await supabase.from("print_events").insert(eventRows)
  if (insertError) {
    console.error("[handleBulkRegisterConfirm] insert error", insertError)
    await replyLine(replyToken, [textMessage("登録中にエラーが発生しました。もう一度試してください。")])
    return
  }

  await replyLine(
    replyToken,
    [textMessage(["✅ 登録しました。", "", buildEventListText(events)].join("\n"))],
  )
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
type LineEvent = Record<string, any>

// 画像受信時はここでは解析しない（P3）。Storageに保存してセッションを作るだけで、
// 「指示あり/なし」の確認を挟んでから analyzeAndReply を呼ぶのは handlePostback / handleText 側。
async function handleImage(event: LineEvent): Promise<void> {
  const replyToken = event.replyToken as string
  const messageId  = event.message.id as string
  const userId     = event.source.userId as string

  try {
    const { buffer, contentType } = await fetchLineImage(messageId)

    // Upload original image to Supabase Storage
    const ext      = contentType.split("/")[1]?.split(";")[0] ?? "jpg"
    const filePath = `${userId}/${messageId}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from("prints")
      .upload(filePath, buffer, { contentType, upsert: false })
    if (uploadError) throw uploadError

    const { data: { publicUrl } } = supabase.storage.from("prints").getPublicUrl(filePath)

    // Replace any previous pending session for this user (upsert on line_user_id)
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
    const { error: sessionError } = await supabase
      .from("pending_image_sessions")
      .upsert(
        { line_user_id: userId, image_url: publicUrl, status: "awaiting_choice", expires_at: expiresAt },
        { onConflict: "line_user_id" },
      )
    if (sessionError) throw sessionError

    await replyWithInstructionChoice(replyToken)
  } catch (err) {
    console.error("[handleImage]", err)
    await replyLine(
      replyToken,
      [textMessage("プリントの受信中にエラーが発生しました。\nもう一度送ってみてください。")],
    )
  }
}

// postback dataの値でフローを振り分ける（名前空間はファイル冒頭の定数を参照）。
// 予定一括登録関連を先に判定してから、P3（pending_image_sessions）の分岐に進む。
async function handlePostback(event: LineEvent): Promise<void> {
  const replyToken = event.replyToken as string
  const userId     = event.source.userId as string
  const data       = event.postback?.data as string | undefined

  if (data === BULK_REGISTER_START) {
    await handleBulkRegisterStart(replyToken, userId)
    return
  }

  if (data === BULK_REGISTER_CONFIRM_YES || data === BULK_REGISTER_CONFIRM_NO) {
    await handleBulkRegisterConfirm(replyToken, userId, data)
    return
  }

  const { data: session, error } = await supabase
    .from("pending_image_sessions")
    .select("id, image_url")
    .eq("line_user_id", userId)
    .eq("status", "awaiting_choice")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle()

  if (error) {
    console.error("[handlePostback] DB error", error)
    await replyLine(replyToken, [textMessage("エラーが発生しました。もう一度試してください。")])
    return
  }

  if (!session) {
    await replyLine(replyToken, [textMessage("画像の有効期限が切れました。もう一度送ってください。")])
    return
  }

  if (data === INSTRUCTION_NO) {
    await supabase.from("pending_image_sessions").delete().eq("id", session.id)
    await analyzeAndReply(replyToken, session.image_url as string)
    return
  }

  if (data === INSTRUCTION_YES) {
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
    const { error: updateError } = await supabase
      .from("pending_image_sessions")
      .update({ status: "awaiting_instruction", expires_at: expiresAt })
      .eq("id", session.id)
    if (updateError) {
      console.error("[handlePostback] update error", updateError)
      await replyLine(replyToken, [textMessage("エラーが発生しました。もう一度試してください。")])
      return
    }
    await replyLine(replyToken, [textMessage("具体的な指示を教えてください。")])
    return
  }
}

async function handleChatQuestion(replyToken: string, question: string): Promise<void> {
  try {
    const { data: prints, error } = await supabase
      .from("prints")
      .select("date, deadline, target_person, category, content")
      .is("archived_at", null)
      .order("deadline", { ascending: true })
    if (error) throw error

    if (!prints || prints.length === 0) {
      await replyLine(
        replyToken,
        [textMessage("現在有効なプリントはありません。\nLINEでプリントの写真を送ってください。")],
      )
      return
    }

    const markdown = prints.map((p) =>
      `## ${p.deadline ?? "締切未定"}｜${p.target_person ?? "不明"}（${p.category ?? "その他"}）\n${p.content ?? ""}`
    ).join("\n\n---\n\n")

    const res = await anthropic.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 1000,
      system: `あなたは子供の学校・保育園プリントを管理するアシスタントです。
以下のプリント内容を参照して質問に答えてください。
プリントに書かれていない情報は「プリントに記載がありません」と答えてください。
回答は簡潔に、LINEメッセージとして読みやすい形式にしてください。

【現在有効なプリント一覧】
${markdown}`,
      messages: [{ role: "user", content: question }],
    })

    const answer = res.content[0].type === "text" ? res.content[0].text : "回答できませんでした。"
    await replyLine(replyToken, [textMessage(answer)])
  } catch (err) {
    console.error("[handleChatQuestion]", err)
    await replyLine(replyToken, [textMessage("エラーが発生しました。もう一度試してください。")])
  }
}

async function handleText(event: LineEvent): Promise<void> {
  const replyToken = event.replyToken as string
  const question   = event.message.text as string
  const userId     = event.source.userId as string

  // テキスト受信時の判定優先順位: ①予定一括登録セッション → ②P3画像指示待ちセッション → ③通常チャット
  // どちらのセッションもTTL付きで、期限切れなら該当なし（次の優先順位に自然にフォールスルー）として扱われる。
  const { data: regSession, error: regError } = await supabase
    .from("pending_registrations")
    .select("id, status, draft_events, clarification_context")
    .eq("line_user_id", userId)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle()

  if (regError) {
    console.error("[handleText] pending_registrations lookup error", regError)
  }

  if (regSession) {
    await handleBulkRegisterText(replyToken, question, regSession as PendingRegistration)
    return
  }

  const { data: session, error: sessionError } = await supabase
    .from("pending_image_sessions")
    .select("id, image_url")
    .eq("line_user_id", userId)
    .eq("status", "awaiting_instruction")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle()

  if (sessionError) {
    console.error("[handleText] session lookup error", sessionError)
  }

  if (session) {
    await supabase.from("pending_image_sessions").delete().eq("id", session.id)
    await analyzeAndReply(replyToken, session.image_url as string, question)
    return
  }

  await handleChatQuestion(replyToken, question)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 })
  }

  const body      = await req.text()
  const signature = req.headers.get("x-line-signature") ?? ""

  if (!(await verifySignature(body, signature))) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { events = [] } = JSON.parse(body)
  const tasks: Promise<void>[] = []

  // LINEは1リクエストに複数eventsをまとめて送ってくることがあるため全件並行処理する
  for (const event of events) {
    if (event.type === "message") {
      if (event.message?.type === "image") tasks.push(handleImage(event))
      else if (event.message?.type === "text") tasks.push(handleText(event))
    } else if (event.type === "postback") {
      tasks.push(handlePostback(event))
    }
  }

  // Register background work with EdgeRuntime so the function stays alive
  // after returning 200 to LINE (LINE requires response within 1 second).
  const bgWork = Promise.all(tasks)
  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime
  if (runtime?.waitUntil) {
    runtime.waitUntil(bgWork)
  } else {
    // Local dev: just await
    await bgWork
  }

  return new Response("OK", { status: 200 })
})
