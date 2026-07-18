import { strict as assert } from "node:assert"
import { getJSTDateString } from "./jst-date.ts"

Deno.test("getJSTDateString returns the same calendar day for UTC midnight", () => {
  assert.equal(getJSTDateString(new Date("2026-07-18T00:00:00Z")), "2026-07-18")
})

Deno.test("getJSTDateString rolls over to the next day for late-UTC / early-JST instants", () => {
  // 2026-07-18T15:30:00Z = 2026-07-19 00:30 JST
  assert.equal(getJSTDateString(new Date("2026-07-18T15:30:00Z")), "2026-07-19")
})

Deno.test("getJSTDateString stays on the same JST day during 00:00-08:59 JST (the buggy window for raw UTC dates)", () => {
  // 2026-07-17T20:00:00Z = 2026-07-18 05:00 JST — raw UTC date-string would incorrectly say "2026-07-17"
  assert.equal(getJSTDateString(new Date("2026-07-17T20:00:00Z")), "2026-07-18")
})
