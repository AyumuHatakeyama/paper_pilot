/**
 * Claude Vision — プリント画像を構造化データに変換する（P1の中核ロジック）。
 * 戻り値のJSON構造は buildReplyText / analyzeAndSavePrint（print-flow.ts）が前提とする
 * スキーマと対になっているため、プロンプトを変える場合は両方を合わせて確認すること。
 */
import { anthropic } from "./clients.ts"

export async function analyzePrint(
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
    { "date": "YYYY-MM-DD", "time": "HH:MM or null", "title": "イベント名", "is_deadline": false, "category": "イベント参加" },
    { "date": "YYYY-MM-DD", "time": null, "title": "締切名", "is_deadline": true, "category": "要準備" }
  ]
}

・eventsには日程・締切を含むすべての予定を列挙してください（1枚のプリントに複数の日程が含まれる場合は全件）。
・単一予定のプリントでも events は必ず配列（要素1件）で返してください。
・is_deadlineは提出締切・申込締切などの場合はtrue、行事・実施日などはfalseにしてください。
・timeはプリントに時刻の記載がある場合のみ "HH:MM" 形式で設定し、記載がない場合は null にしてください。
・categoryは各イベントについて、保護者側の対応の性質を次の基準で判定してください（該当がなければnull）。
  ・材料購入・工作道具の準備・服装指定など、事前の準備が必要なものは「要準備」
  ・署名・捺印・提出のみで完結するもの（同意書提出、アンケート提出など）は「提出のみ」
  ・日程の把握のみで、保護者側に特段の対応が不要なもの（行事の実施日・参観日など）は「イベント参加」
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
