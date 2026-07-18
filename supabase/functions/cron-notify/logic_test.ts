import { strict as assert } from "node:assert"
import { addDays, buildDigestBody, buildReminderBody, diffInDays, fmtDate, getJSTParts, isDigestDueToday } from "./logic.ts"
import type { TodoRow } from "./logic.ts"

// ---------------------------------------------------------------------------
// isDigestDueToday
// ---------------------------------------------------------------------------
Deno.test("isDigestDueToday is always true for daily frequency regardless of weekday", () => {
  assert.equal(isDigestDueToday({ frequency: "daily", weekly_day: null }, 3), true)
  assert.equal(isDigestDueToday({ frequency: "daily", weekly_day: null }, 0), true)
})

Deno.test("isDigestDueToday only matches the configured weekday for weekly frequency", () => {
  assert.equal(isDigestDueToday({ frequency: "weekly", weekly_day: 1 }, 1), true)
  assert.equal(isDigestDueToday({ frequency: "weekly", weekly_day: 1 }, 2), false)
})

// ---------------------------------------------------------------------------
// getJSTParts
// ---------------------------------------------------------------------------
Deno.test("getJSTParts converts UTC midnight to 9:00 JST the same day", () => {
  // 2026-07-18T00:00:00Z（UTC）は2026-07-18 09:00 JST。曜日は土曜日(6)
  const { hour, weekday, dateStr } = getJSTParts(new Date("2026-07-18T00:00:00Z"))
  assert.equal(hour, 9)
  assert.equal(weekday, 6)
  assert.equal(dateStr, "2026-07-18")
})

Deno.test("getJSTParts rolls over to the next JST day near UTC midnight", () => {
  // 2026-07-18T15:30:00Z（UTC）は2026-07-19 00:30 JST。日付が翌日に繰り上がる
  const { hour, dateStr } = getJSTParts(new Date("2026-07-18T15:30:00Z"))
  assert.equal(hour, 0)
  assert.equal(dateStr, "2026-07-19")
})

// ---------------------------------------------------------------------------
// diffInDays / addDays / fmtDate
// ---------------------------------------------------------------------------
Deno.test("diffInDays returns 0 for the same day", () => {
  assert.equal(diffInDays("2026-07-18", "2026-07-18"), 0)
})

Deno.test("diffInDays returns a positive number for future dates", () => {
  assert.equal(diffInDays("2026-07-21", "2026-07-18"), 3)
})

Deno.test("diffInDays returns a negative number for past (overdue) dates", () => {
  assert.equal(diffInDays("2026-07-15", "2026-07-18"), -3)
})

Deno.test("addDays adds/subtracts days and stays within the same string format", () => {
  assert.equal(addDays("2026-07-18", 7), "2026-07-25")
  assert.equal(addDays("2026-07-18", -7), "2026-07-11")
})

Deno.test("addDays rolls over month boundaries correctly", () => {
  assert.equal(addDays("2026-07-30", 3), "2026-08-02")
})

Deno.test("fmtDate converts YYYY-MM-DD to YYYY/MM/DD", () => {
  assert.equal(fmtDate("2026-07-18"), "2026/07/18")
})

// ---------------------------------------------------------------------------
// buildReminderBody
// ---------------------------------------------------------------------------
Deno.test("buildReminderBody shows the empty-state message when there are no todos", () => {
  assert.equal(buildReminderBody([]), "本日・近日の締切はありません")
})

Deno.test("buildReminderBody appends the 準備が必要です note only for 要準備 category", () => {
  const todos: TodoRow[] = [
    { id: "1", title: "遠足のしおり", due_date: "2026-07-18", category: "要準備" },
    { id: "2", title: "アンケート提出", due_date: "2026-07-18", category: "提出のみ" },
  ]
  const body = buildReminderBody(todos)
  assert.match(body, /・遠足のしおり（2026\/07\/18まで）\n準備が必要です/)
  assert.match(body, /・アンケート提出（2026\/07\/18まで）(?!\n準備が必要です)/)
})

// ---------------------------------------------------------------------------
// buildDigestBody
// ---------------------------------------------------------------------------
Deno.test("buildDigestBody shows empty-state text for both sections when nothing is upcoming", () => {
  const body = buildDigestBody([], [], "2026-07-18")
  assert.match(body, /未処理のToDoはありません/)
  assert.match(body, /来週の締切はありません/)
  assert.match(body, /✅ 0件処理済み/)
})

Deno.test("buildDigestBody excludes today's due items from 来週の締切 but keeps them in 未処理のToDo", () => {
  const upcoming: TodoRow[] = [
    { id: "1", title: "今日締切", due_date: "2026-07-18", category: null },
    { id: "2", title: "来週締切", due_date: "2026-07-23", category: null },
  ]
  const body = buildDigestBody(upcoming, [], "2026-07-18")
  assert.match(body, /■ 未処理のToDo（2件）/)
  assert.match(body, /・今日締切（2026\/07\/18まで）/)
  // 来週の締切セクションには今日締切分は出ず、来週締切分だけが出る
  const nextWeekSection = body.split("■ 来週の締切")[1]
  assert.doesNotMatch(nextWeekSection, /今日締切/)
  assert.match(nextWeekSection, /2026\/07\/23 来週締切/)
})

Deno.test("buildDigestBody counts completed todos", () => {
  const body = buildDigestBody([], [{ id: "1", title: "done" }, { id: "2", title: "done2" }], "2026-07-18")
  assert.match(body, /✅ 2件処理済み/)
})
