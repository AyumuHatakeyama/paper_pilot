/**
 * LINE Messaging APIとのやり取りに関する共通処理。
 * webhook-line（署名検証・画像取得・reply）と cron-reminder / cron-notify（push）の
 * 3つのEdge Functionから利用する。
 */
const LINE_BOT_API  = "https://api.line.me/v2/bot/message"
const LINE_DATA_API = "https://api-data.line.me/v2/bot/message"

// LINEメッセージオブジェクトの型。quickReply付きのオブジェクトも入るため厳密な型は付けずRecordで保持
// deno-lint-ignore no-explicit-any
export type LineMessage = Record<string, any>

export function textMessage(text: string): LineMessage {
  return { type: "text", text }
}

// LINEからのWebhookであることをHMAC-SHA256署名で検証する（なりすまし防止）
export async function verifyLineSignature(body: string, signature: string): Promise<boolean> {
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
export async function fetchLineImage(
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

// LINE Reply APIへの送信（reply tokenは1回・短時間のみ有効。webhook-line専用）
export async function replyLine(replyToken: string, messages: LineMessage[]): Promise<void> {
  const token = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!
  await fetch(`${LINE_BOT_API}/reply`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body:    JSON.stringify({ replyToken, messages }),
  })
}

// LINE Push APIへの送信（reply tokenを使わず任意タイミングで送れる。cron-reminder / cron-notifyが利用）
export async function pushLine(userId: string, text: string): Promise<void> {
  const token = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!
  const res = await fetch(`${LINE_BOT_API}/push`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body:    JSON.stringify({ to: userId, messages: [{ type: "text", text }] }),
  })
  if (!res.ok) console.error("[pushLine]", await res.text())
}
