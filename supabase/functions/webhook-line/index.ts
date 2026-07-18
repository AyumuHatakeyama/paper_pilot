/**
 * webhook-line — LINE Messaging API webhook（画像解析 / チャット / 予定一括登録 / ブック登録 / ToDo確認）
 *
 * このEdge Functionは5つのユーザーフローを1つのwebhookで受け持つ。実処理は同ディレクトリ内の
 * フロー別モジュールに分割してあり、このファイルはLINEイベントの受信とフロー振り分けに徹する：
 *   - print-flow.ts            : 画像解析（P1）＋ ToDo追加確認プロンプトの生成
 *   - bulk-register-flow.ts    : 予定一括登録（リッチメニュー起点のテキスト解析）
 *   - book-register-flow.ts    : ブック登録（P5、複数画像をまとめて登録）
 *   - todo-flow.ts             : ToDo追加確認Quick Replyのpostback処理
 *   - notification-settings.ts: 通知設定の初回自動作成
 *   - chat-flow.ts             : 自由テキストでのプリントQ&A
 * LINE API呼び出し（署名検証・reply送信等）は ../_shared/line-client.ts に共通化している。
 *
 * 画像受信後すぐには解析せず「指示あり/なし」を確認する（P3）ため、また予定一括登録・
 * ブック登録もどちらも複数回のLINEメッセージ往復が必要なため、DBの一時セッションテーブル
 * （pending_image_sessions / pending_registrations / pending_book_sessions）でユーザーごとの
 * 会話状態を保持する。セッションはユーザーごとに最新1件のみ（line_user_idにUNIQUE制約＋upsert）、
 * TTL（expires_at）を過ぎたセッションは黙って無効化され、通常フローに自然に戻る。
 */
import { supabase } from "./clients.ts"
import { verifyLineSignature, replyLine, textMessage, fetchLineImage } from "../_shared/line-client.ts"
import {
  INSTRUCTION_YES,
  INSTRUCTION_NO,
  BULK_REGISTER_START,
  BULK_REGISTER_CONFIRM_YES,
  BULK_REGISTER_CONFIRM_NO,
  BOOK_REGISTER_START,
  SESSION_TTL_MS,
} from "./constants.ts"
import { analyzeAndReply, replyWithInstructionChoice } from "./print-flow.ts"
import {
  handleBulkRegisterStart,
  handleBulkRegisterText,
  handleBulkRegisterConfirm,
} from "./bulk-register-flow.ts"
import type { PendingRegistration } from "./bulk-register-flow.ts"
import { handleBookRegisterStart, handleBookImage, handleBookText } from "./book-register-flow.ts"
import type { PendingBookSession } from "./book-register-flow.ts"
import { handleTodoAction } from "./todo-flow.ts"
import { ensureNotificationSettings } from "./notification-settings.ts"
import { handleChatQuestion } from "./chat-flow.ts"

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

    // ①ブック収集中セッションがあれば画像をブックに追加する（P5）
    const { data: bookSession, error: bookSessionError } = await supabase
      .from("pending_book_sessions")
      .select("id, image_urls, status")
      .eq("line_user_id", userId)
      .eq("status", "collecting")
      .gt("expires_at", new Date().toISOString())
      .maybeSingle()

    if (bookSessionError) {
      console.error("[handleImage] pending_book_sessions lookup error", bookSessionError)
    }

    if (bookSession) {
      await handleBookImage(replyToken, bookSession as PendingBookSession, publicUrl)
      return
    }

    // ②既存の画像指示確認フロー（P3）へ：pending_image_sessionsを作成
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

// postback dataの値でフローを振り分ける（名前空間はconstants.tsを参照）。
// ToDo確認・予定一括登録関連を先に判定してから、P3（pending_image_sessions）の分岐に進む。
async function handlePostback(event: LineEvent): Promise<void> {
  const replyToken = event.replyToken as string
  const userId     = event.source.userId as string
  const data       = event.postback?.data as string | undefined

  // ToDo確認フローのpostbackは `action=` から始まるクエリ文字列形式で、
  // 他フローの固定文字列（例："book_register_start"）と衝突しない
  if (data?.startsWith("action=")) {
    await handleTodoAction(replyToken, data)
    return
  }

  if (data === BOOK_REGISTER_START) {
    await handleBookRegisterStart(replyToken, userId)
    return
  }

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

async function handleText(event: LineEvent): Promise<void> {
  const replyToken = event.replyToken as string
  const question   = event.message.text as string
  const userId     = event.source.userId as string

  // テキスト受信時の判定優先順位: ①ブック登録セッション → ②予定一括登録セッション → ③P3画像指示待ちセッション → ④通常チャット
  // どのセッションもTTL付きで、期限切れなら該当なし（次の優先順位に自然にフォールスルー）として扱われる。
  const { data: bookSession, error: bookSessionError } = await supabase
    .from("pending_book_sessions")
    .select("id, image_urls, status")
    .eq("line_user_id", userId)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle()

  if (bookSessionError) {
    console.error("[handleText] pending_book_sessions lookup error", bookSessionError)
  }

  if (bookSession) {
    await handleBookText(replyToken, question, bookSession as PendingBookSession)
    return
  }

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

  if (!(await verifyLineSignature(body, signature))) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { events = [] } = JSON.parse(body)
  const tasks: Promise<void>[] = []

  // LINEは1リクエストに複数eventsをまとめて送ってくることがあるため全件並行処理する
  for (const event of events) {
    const userId = event.source?.userId as string | undefined
    if (userId) tasks.push(ensureNotificationSettings(userId))

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
