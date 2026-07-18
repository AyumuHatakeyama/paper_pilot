import { strict as assert } from "node:assert"
import { buildConfirmationText, buildEventListText } from "./bulk-register-flow.ts"
import type { DraftEvent } from "./bulk-register-flow.ts"

Deno.test("buildEventListText marks deadlines with ⏰ and other events with 📅", () => {
  const events: DraftEvent[] = [
    { event_date: "2026-08-12", event_time: null, title: "学童お弁当持参", is_deadline: false },
    { event_date: "2026-08-20", event_time: null, title: "夏期講習申込締切", is_deadline: true },
  ]
  const text = buildEventListText(events)
  assert.match(text, /📅 2026\/08\/12 学童お弁当持参/)
  assert.match(text, /⏰ 2026\/08\/20 夏期講習申込締切/)
})

Deno.test("buildEventListText includes the time only when event_time is set", () => {
  const events: DraftEvent[] = [
    { event_date: "2026-08-12", event_time: "09:30", title: "時間指定あり", is_deadline: false },
    { event_date: "2026-08-13", event_time: null, title: "時間指定なし", is_deadline: false },
  ]
  const text = buildEventListText(events)
  assert.match(text, /2026\/08\/12 09:30 時間指定あり/)
  assert.match(text, /2026\/08\/13 時間指定なし/)
})

Deno.test("buildConfirmationText wraps the event list with a confirmation prompt", () => {
  const events: DraftEvent[] = [
    { event_date: "2026-08-12", event_time: null, title: "学童お弁当持参", is_deadline: false },
  ]
  const text = buildConfirmationText(events)
  assert.match(text, /以下の内容で登録します。よろしいですか？/)
  assert.match(text, /学童お弁当持参/)
})
