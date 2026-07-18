/**
 * ブック登録（P5）：リッチメニュー → 複数画像収集 → タイトル入力 → 一括解析。
 *
 * pending_book_sessions.status の状態遷移:
 *   collecting     -- リッチメニュー「ブックで登録」押下直後。画像を受信するたびimage_urlsに追記
 *   awaiting_title -- 「完了」受信 or 上限枚数到達。次のテキストをタイトルとして採用する
 *
 * 年間行事予定一括取り込み相当のフローで件数が多く個別のToDo確認に向かないため、
 * 各ページの解析（analyzeAndSavePrint）はbookIdを渡すことでtodo_enabled=false記録に切り替わる。
 */
import { supabase } from "./clients.ts"
import { replyLine, textMessage } from "../_shared/line-client.ts"
import { BOOK_MAX_PAGES, BOOK_SESSION_TTL_MS, WEB_APP_URL } from "./constants.ts"
import { analyzeAndSavePrint } from "./print-flow.ts"

export type PendingBookSession = {
  id:         string
  image_urls: string[]
  status:     "collecting" | "awaiting_title"
}

// リッチメニュー「ブックで登録」postback受信時のエントリポイント。
// 既存セッションは無条件で上書きし、collectingから再スタートする。
export async function handleBookRegisterStart(replyToken: string, userId: string): Promise<void> {
  const expiresAt = new Date(Date.now() + BOOK_SESSION_TTL_MS).toISOString()
  const { error } = await supabase
    .from("pending_book_sessions")
    .upsert(
      { line_user_id: userId, image_urls: [], status: "collecting", expires_at: expiresAt },
      { onConflict: "line_user_id" },
    )

  if (error) {
    console.error("[handleBookRegisterStart]", error)
    await replyLine(replyToken, [textMessage("エラーが発生しました。もう一度試してください。")])
    return
  }

  await replyLine(
    replyToken,
    [textMessage(`画像を送ってください（最大${BOOK_MAX_PAGES}枚）。送り終わったら「完了」と送ってください。`)],
  )
}

// pending_book_sessionsがcollecting中の画像受信を処理する（画像はhandleImage側でアップロード済み）。
export async function handleBookImage(
  replyToken: string,
  session: PendingBookSession,
  imageUrl: string,
): Promise<void> {
  const imageUrls = [...session.image_urls, imageUrl]
  const expiresAt = new Date(Date.now() + BOOK_SESSION_TTL_MS).toISOString()
  const reachedLimit = imageUrls.length >= BOOK_MAX_PAGES

  const { error } = await supabase
    .from("pending_book_sessions")
    .update({
      image_urls: imageUrls,
      status:     reachedLimit ? "awaiting_title" : "collecting",
      expires_at: expiresAt,
    })
    .eq("id", session.id)

  if (error) {
    console.error("[handleBookImage]", error)
    await replyLine(replyToken, [textMessage("エラーが発生しました。もう一度試してください。")])
    return
  }

  if (reachedLimit) {
    await replyLine(
      replyToken,
      [textMessage(`上限の${BOOK_MAX_PAGES}枚に達しました。このブックのタイトルを教えてください（例：夏休みの栞）`)],
    )
    return
  }

  await replyLine(replyToken, [textMessage(`${imageUrls.length}枚目を受信しました（最大${BOOK_MAX_PAGES}枚）`)])
}

// pending_book_sessionsがcollecting／awaiting_title中のテキスト受信を処理する。
export async function handleBookText(
  replyToken: string,
  text: string,
  session: PendingBookSession,
): Promise<void> {
  if (text === "キャンセル") {
    await supabase.from("pending_book_sessions").delete().eq("id", session.id)
    await replyLine(replyToken, [textMessage("ブック登録をキャンセルしました。")])
    return
  }

  if (session.status === "awaiting_title") {
    await finalizeBook(session, text, replyToken)
    return
  }

  // status === "collecting"
  if (text !== "完了") {
    await replyLine(
      replyToken,
      [textMessage(`画像を送ってください（最大${BOOK_MAX_PAGES}枚）。送り終わったら「完了」と送ってください。`)],
    )
    return
  }

  if (session.image_urls.length === 0) {
    await replyLine(replyToken, [textMessage("まだ画像が届いていません。")])
    return
  }

  const expiresAt = new Date(Date.now() + BOOK_SESSION_TTL_MS).toISOString()
  const { error } = await supabase
    .from("pending_book_sessions")
    .update({ status: "awaiting_title", expires_at: expiresAt })
    .eq("id", session.id)

  if (error) {
    console.error("[handleBookText]", error)
    await replyLine(replyToken, [textMessage("エラーが発生しました。もう一度試してください。")])
    return
  }

  await replyLine(replyToken, [textMessage("このブックのタイトルを教えてください（例：夏休みの栞）")])
}

// タイトル確定後の仕上げ処理：print_booksを作成し、収集済みの各ページを順に解析・保存する。
// 1ページの解析失敗で全体を止めず、成否件数を集計して最後に1通で返信する。
async function finalizeBook(
  session: PendingBookSession,
  title: string,
  replyToken: string,
): Promise<void> {
  const { data: bookRow, error: bookError } = await supabase
    .from("print_books")
    .insert({ title })
    .select("id")
    .single()

  if (bookError || !bookRow) {
    console.error("[finalizeBook] print_books insert error", bookError)
    await supabase.from("pending_book_sessions").delete().eq("id", session.id)
    await replyLine(replyToken, [textMessage("ブックの登録中にエラーが発生しました。もう一度お試しください。")])
    return
  }

  const bookId = bookRow.id as string
  let successCount = 0
  let failureCount = 0

  for (const imageUrl of session.image_urls) {
    try {
      await analyzeAndSavePrint(imageUrl, undefined, bookId)
      successCount++
    } catch (err) {
      console.error("[finalizeBook] page analyze error", err)
      failureCount++
    }
  }

  await supabase.from("pending_book_sessions").delete().eq("id", session.id)

  const lines = [`📚 ブック『${title}』に${successCount}件登録しました`]
  if (failureCount > 0) lines.push(`（${failureCount}件は解析に失敗しました）`)
  lines.push("", "👉 確認する", `${WEB_APP_URL}/books/${bookId}`)

  await replyLine(replyToken, [textMessage(lines.join("\n"))])
}
