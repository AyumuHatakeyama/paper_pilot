/**
 * chat — Web app chat endpoint (Phase 2)
 *
 * POST /functions/v1/chat
 * Body: { question: string }
 * Auth: Authorization: Bearer <SUPABASE_ANON_KEY>  (validated by LIFF token in Phase 2)
 *
 * Returns: { answer: string }
 */
import { createClient } from "npm:@supabase/supabase-js@2"
import Anthropic from "npm:@anthropic-ai/sdk"

const supabase  = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
)
const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! })

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS })
  }

  // --- Phase 2: LIFF token verification goes here ---
  // const lineUserId = await verifyLiffToken(req.headers.get("authorization"))
  // const allowed = Deno.env.get("ALLOWED_LINE_USER_IDS")!.split(",")
  // if (!allowed.includes(lineUserId)) {
  //   return new Response("Forbidden", { status: 403, headers: CORS_HEADERS })
  // }

  let question: string
  try {
    const body = await req.json()
    question   = body.question?.trim()
    if (!question) throw new Error("question is required")
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    )
  }

  // Fetch all active prints
  const { data: prints, error: dbError } = await supabase
    .from("prints")
    .select("date, deadline, target_person, category, content")
    .is("archived_at", null)
    .order("deadline", { ascending: true })

  if (dbError) {
    console.error("[chat] DB error", dbError)
    return new Response(
      JSON.stringify({ error: "DB error" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    )
  }

  const markdown = (prints ?? []).map((p) =>
    `## ${p.deadline ?? "締切未定"}｜${p.target_person ?? "不明"}（${p.category ?? "その他"}）\n${p.content ?? ""}`
  ).join("\n\n---\n\n")

  const noData = !prints || prints.length === 0

  const res = await anthropic.messages.create({
    model:      "claude-sonnet-4-6",
    max_tokens: 1000,
    system: noData
      ? "現在有効なプリントはありません。そのことをユーザーに伝えてください。"
      : `あなたは子供の学校・保育園プリントを管理するアシスタントです。
以下のプリント内容を参照して質問に答えてください。
プリントに書かれていない情報は「プリントに記載がありません」と答えてください。

【現在有効なプリント一覧】
${markdown}`,
    messages: [{ role: "user", content: question }],
  })

  const answer = res.content[0].type === "text" ? res.content[0].text : "回答できませんでした。"

  return new Response(
    JSON.stringify({ answer }),
    { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
  )
})
