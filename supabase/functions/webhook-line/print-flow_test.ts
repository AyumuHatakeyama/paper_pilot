import { strict as assert } from "node:assert"
import { buildReplyText, buildTodoPromptMessage } from "./print-flow.ts"
import type { SavedPrintEvent } from "./print-flow.ts"
import { getJSTDateString } from "../_shared/jst-date.ts"

// ---------------------------------------------------------------------------
// buildReplyText
// ---------------------------------------------------------------------------
Deno.test("buildReplyText shows the empty-state text when there are no events", () => {
  const text = buildReplyText({ target_person: "太郎", category: "予定", content: "内容です", events: [] })
  assert.match(text, /（日程なし）/)
  assert.match(text, /👤 対象：太郎/)
})

Deno.test("buildReplyText marks deadlines with ⏰ and other events with 📅", () => {
  const text = buildReplyText({
    events: [
      { date: "2026-07-20", title: "運動会", is_deadline: false },
      { date: "2026-07-18", title: "参加費集金", is_deadline: true },
    ],
  })
  assert.match(text, /📅 2026\/07\/20 運動会/)
  assert.match(text, /⏰ 2026\/07\/18 参加費集金/)
})

Deno.test("buildReplyText falls back to defaults for missing fields", () => {
  const text = buildReplyText({})
  assert.match(text, /👤 対象：不明/)
  assert.match(text, /📌 種別：その他/)
  assert.match(text, /（内容なし）/)
})

// ---------------------------------------------------------------------------
// buildTodoPromptMessage
// ---------------------------------------------------------------------------
const TODAY = getJSTDateString()

Deno.test("buildTodoPromptMessage returns null when there are no events", () => {
  assert.equal(buildTodoPromptMessage("print-1", []), null)
})

Deno.test("buildTodoPromptMessage returns null when no event qualifies (no deadline, all in the past)", () => {
  const events: SavedPrintEvent[] = [
    { id: "1", event_date: "2000-01-01", title: "過去の予定", is_deadline: false, category: null },
  ]
  assert.equal(buildTodoPromptMessage("print-1", events), null)
})

Deno.test("buildTodoPromptMessage qualifies when is_deadline is true even if the date is in the past", () => {
  const events: SavedPrintEvent[] = [
    { id: "1", event_date: "2000-01-01", title: "締切（過去日だが締切扱い）", is_deadline: true, category: null },
  ]
  assert.notEqual(buildTodoPromptMessage("print-1", events), null)
})

Deno.test("buildTodoPromptMessage qualifies when the event date is today or later", () => {
  const events: SavedPrintEvent[] = [
    { id: "1", event_date: TODAY, title: "今日の予定", is_deadline: false, category: null },
  ]
  assert.notEqual(buildTodoPromptMessage("print-1", events), null)
})

Deno.test("buildTodoPromptMessage labels a single event without ほか◯件", () => {
  const events: SavedPrintEvent[] = [
    { id: "1", event_date: TODAY, title: "遠足のしおり 参加費集金", is_deadline: true, category: "要準備" },
  ]
  const message = buildTodoPromptMessage("print-1", events)
  assert.match(message!.text, /「遠足のしおり 参加費集金」/)
  assert.doesNotMatch(message!.text, /ほか/)
})

Deno.test("buildTodoPromptMessage labels multiple events with ほか◯件 counting all but the first", () => {
  const events: SavedPrintEvent[] = [
    { id: "1", event_date: TODAY, title: "遠足のしおり 参加費集金", is_deadline: true, category: "要準備" },
    { id: "2", event_date: TODAY, title: "遠足当日", is_deadline: false, category: "イベント参加" },
    { id: "3", event_date: TODAY, title: "持ち物確認", is_deadline: false, category: "要準備" },
  ]
  const message = buildTodoPromptMessage("print-1", events)
  assert.match(message!.text, /「遠足のしおり 参加費集金」ほか2件/)
})

Deno.test("buildTodoPromptMessage embeds print_id in all three postback data strings", () => {
  const events: SavedPrintEvent[] = [
    { id: "1", event_date: TODAY, title: "予定", is_deadline: false, category: null },
  ]
  const message = buildTodoPromptMessage("print-abc-123", events)
  // deno-lint-ignore no-explicit-any
  const items = (message as any).quickReply.items as { action: { data: string } }[]
  assert.equal(items.length, 3)
  for (const item of items) {
    assert.match(item.action.data, /print_id=print-abc-123/)
  }
  assert.match(items[0].action.data, /^action=todo_add.*reminder=true/)
  assert.match(items[1].action.data, /^action=todo_add.*reminder=false/)
  assert.match(items[2].action.data, /^action=todo_skip/)
})
