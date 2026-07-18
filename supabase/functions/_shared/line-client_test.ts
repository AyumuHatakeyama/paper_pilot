import { strict as assert } from "node:assert"
import { textMessage, verifyLineSignature } from "./line-client.ts"

Deno.test("textMessage builds a LINE text message object", () => {
  assert.deepEqual(textMessage("こんにちは"), { type: "text", text: "こんにちは" })
})

Deno.test("verifyLineSignature accepts a signature computed with the same secret", async () => {
  Deno.env.set("LINE_CHANNEL_SECRET", "test-secret")
  const body = JSON.stringify({ events: [] })

  // 実装と同じ手順でHMAC-SHA256署名を計算し、テスト対象が同じ結果を受理することを確認する
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("test-secret"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))
  const signature = btoa(String.fromCharCode(...new Uint8Array(signed)))

  assert.equal(await verifyLineSignature(body, signature), true)
})

Deno.test("verifyLineSignature rejects a signature computed with the wrong secret", async () => {
  Deno.env.set("LINE_CHANNEL_SECRET", "test-secret")
  const body = JSON.stringify({ events: [] })

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("wrong-secret"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))
  const signature = btoa(String.fromCharCode(...new Uint8Array(signed)))

  assert.equal(await verifyLineSignature(body, signature), false)
})

Deno.test("verifyLineSignature rejects a tampered body", async () => {
  Deno.env.set("LINE_CHANNEL_SECRET", "test-secret")

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("test-secret"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(JSON.stringify({ events: [] })))
  const signature = btoa(String.fromCharCode(...new Uint8Array(signed)))

  // 署名は元のbodyに対して計算したものなので、bodyを変えると一致しなくなるはず
  assert.equal(await verifyLineSignature(JSON.stringify({ events: [{ type: "message" }] }), signature), false)
})
