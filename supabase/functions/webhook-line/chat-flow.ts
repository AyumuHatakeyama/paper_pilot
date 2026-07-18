/** LINEでの自由なテキスト質問に、有効なプリント一覧を文脈としてClaudeが回答するチャット機能。 */
import { supabase, anthropic } from "./clients.ts"
import { replyLine, textMessage } from "../_shared/line-client.ts"

export async function handleChatQuestion(replyToken: string, question: string): Promise<void> {
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
