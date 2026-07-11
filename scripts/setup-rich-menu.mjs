/**
 * LINE リッチメニュー セットアップスクリプト
 *
 * 実行方法：
 *   node scripts/setup-rich-menu.mjs
 *
 * 必要な環境変数（.env.local から自動読み込み）:
 *   LINE_CHANNEL_ACCESS_TOKEN
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import sharp from '../web/node_modules/sharp/lib/index.js'

// ── 設定 ────────────────────────────────────────────────────────────────────
const __dir = dirname(fileURLToPath(import.meta.url))

// .env.local から環境変数を読み込む
const envPath = join(__dir, '..', 'web', '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim()
  }
}

const TOKEN   = process.env.LINE_CHANNEL_ACCESS_TOKEN
const APP_URL = 'https://web-gamma-livid-hmyzfffrkm.vercel.app'
const API     = 'https://api.line.me/v2/bot'

if (!TOKEN) {
  console.error('LINE_CHANNEL_ACCESS_TOKEN が設定されていません')
  process.exit(1)
}

// ── 画像生成 ────────────────────────────────────────────────────────────────
const W = 2500
const H = 843

// 4等分（最後の列で端数を吸収）
const COL_W    = Math.floor(W / 4)
const COL1_X   = 0
const COL2_X   = COL_W
const COL3_X   = COL_W * 2
const COL4_X   = COL_W * 3
const COL4_W   = W - COL4_X
const COL1_MID = COL_W / 2
const COL2_MID = COL_W + COL_W / 2
const COL3_MID = COL_W * 2 + COL_W / 2
const COL4_MID = COL4_X + COL4_W / 2

const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="calGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3B82F6"/>
      <stop offset="100%" stop-color="#1D4ED8"/>
    </linearGradient>
    <linearGradient id="chatGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#10B981"/>
      <stop offset="100%" stop-color="#059669"/>
    </linearGradient>
    <linearGradient id="regGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#F59E0B"/>
      <stop offset="100%" stop-color="#D97706"/>
    </linearGradient>
    <linearGradient id="bookGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#8B5CF6"/>
      <stop offset="100%" stop-color="#6D28D9"/>
    </linearGradient>
  </defs>

  <!-- Calendar button -->
  <rect x="0" y="0" width="${COL_W - 6}" height="${H}" fill="url(#calGrad)"/>

  <!-- Chat button -->
  <rect x="${COL2_X + 6}" y="0" width="${COL_W - 12}" height="${H}" fill="url(#chatGrad)"/>

  <!-- Register button -->
  <rect x="${COL3_X + 6}" y="0" width="${COL_W - 12}" height="${H}" fill="url(#regGrad)"/>

  <!-- Book button -->
  <rect x="${COL4_X + 6}" y="0" width="${COL4_W - 6}" height="${H}" fill="url(#bookGrad)"/>

  <!-- Dividers -->
  <rect x="${COL_W - 6}" y="0" width="12" height="${H}" fill="#f8fafc"/>
  <rect x="${COL3_X - 6}" y="0" width="12" height="${H}" fill="#f8fafc"/>
  <rect x="${COL4_X - 6}" y="0" width="12" height="${H}" fill="#f8fafc"/>

  <!-- Calendar icon + label -->
  <text x="${COL1_MID}" y="${H / 2 - 60}" text-anchor="middle"
        font-size="160" font-family="serif" fill="white" opacity="0.95">&#x1F4C5;</text>
  <text x="${COL1_MID}" y="${H / 2 + 120}" text-anchor="middle"
        font-size="100" font-family="'Hiragino Sans', 'Noto Sans CJK JP', sans-serif"
        font-weight="bold" fill="white">カレンダー</text>

  <!-- Chat icon + label -->
  <text x="${COL2_MID}" y="${H / 2 - 60}" text-anchor="middle"
        font-size="160" font-family="serif" fill="white" opacity="0.95">&#x1F4AC;</text>
  <text x="${COL2_MID}" y="${H / 2 + 120}" text-anchor="middle"
        font-size="100" font-family="'Hiragino Sans', 'Noto Sans CJK JP', sans-serif"
        font-weight="bold" fill="white">チャット</text>

  <!-- Register icon + label -->
  <text x="${COL3_MID}" y="${H / 2 - 60}" text-anchor="middle"
        font-size="160" font-family="serif" fill="white" opacity="0.95">&#x1F4DD;</text>
  <text x="${COL3_MID}" y="${H / 2 + 120}" text-anchor="middle"
        font-size="100" font-family="'Hiragino Sans', 'Noto Sans CJK JP', sans-serif"
        font-weight="bold" fill="white">予定登録</text>

  <!-- Book icon + label -->
  <text x="${COL4_MID}" y="${H / 2 - 60}" text-anchor="middle"
        font-size="160" font-family="serif" fill="white" opacity="0.95">&#x1F4DA;</text>
  <text x="${COL4_MID}" y="${H / 2 + 120}" text-anchor="middle"
        font-size="100" font-family="'Hiragino Sans', 'Noto Sans CJK JP', sans-serif"
        font-weight="bold" fill="white">ブックで登録</text>
</svg>`

const imgPath = join(__dir, 'rich-menu.png')
await sharp(Buffer.from(svg)).resize(W, H).png().toFile(imgPath)
console.log(`✓ 画像生成: ${imgPath}`)

// ── ヘルパー ─────────────────────────────────────────────────────────────────
async function lineApi(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`LINE API ${path} failed: ${res.status} ${text}`)
  return text ? JSON.parse(text) : {}
}

// ── 既存のデフォルトリッチメニューを削除 ─────────────────────────────────────
try {
  const existing = await lineApi('GET', '/richmenu/default')
  if (existing.richMenuId) {
    await lineApi('DELETE', `/richmenu/${existing.richMenuId}`)
    console.log(`✓ 既存リッチメニュー削除: ${existing.richMenuId}`)
  }
} catch {
  // デフォルトが存在しない場合は無視
}

// ── リッチメニュー作成 ────────────────────────────────────────────────────────
const menu = await lineApi('POST', '/richmenu', {
  size: { width: W, height: H },
  selected: true,
  name: 'AIプリント秘書メニュー',
  chatBarText: 'メニュー',
  areas: [
    {
      bounds: { x: COL1_X, y: 0, width: COL_W, height: H },
      action: { type: 'uri', uri: APP_URL, label: 'カレンダー' },
    },
    {
      bounds: { x: COL2_X, y: 0, width: COL_W, height: H },
      action: { type: 'uri', uri: `${APP_URL}/chat`, label: 'チャット' },
    },
    {
      bounds: { x: COL3_X, y: 0, width: COL_W, height: H },
      action: { type: 'postback', label: '予定登録', data: 'bulk_register_start' },
    },
    {
      bounds: { x: COL4_X, y: 0, width: COL4_W, height: H },
      action: { type: 'postback', label: 'ブックで登録', data: 'book_register_start' },
    },
  ],
})

console.log(`✓ リッチメニュー作成: ${menu.richMenuId}`)

// ── 画像アップロード ──────────────────────────────────────────────────────────
const imgBuf = readFileSync(imgPath)
const uploadRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${menu.richMenuId}/content`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'image/png',
  },
  body: imgBuf,
})
if (!uploadRes.ok) throw new Error(`画像アップロード失敗: ${uploadRes.status} ${await uploadRes.text()}`)
console.log('✓ 画像アップロード完了')

// ── デフォルトに設定 ──────────────────────────────────────────────────────────
await lineApi('POST', `/user/all/richmenu/${menu.richMenuId}`)
console.log('✓ デフォルトリッチメニューに設定完了')
console.log('')
console.log('🎉 リッチメニューのセットアップが完了しました！')
console.log(`   カレンダー   → ${APP_URL}`)
console.log(`   チャット     → ${APP_URL}/chat`)
console.log('   予定登録     → postback (bulk_register_start)')
console.log('   ブックで登録 → postback (book_register_start)')
