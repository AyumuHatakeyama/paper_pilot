/**
 * webhook-line全体で共有する定数。
 * postback dataは全フロー共通の1つの文字列空間なので、フローごとに接頭辞で衝突を避ける
 * （ToDo確認フローだけは `action=todo_add&print_id=...` のクエリ文字列形式で、他と自然に区別できる）。
 */
export const WEB_APP_URL = Deno.env.get("WEB_APP_URL") ?? "https://your-app.vercel.app"

export const SESSION_TTL_MS = 5 * 60 * 1000 // 各セッションテーブル共通のTTL（放置5分で自動失効）

// Postback data namespace (P3: 画像指示確認)
export const INSTRUCTION_YES = "instruction_yes"
export const INSTRUCTION_NO  = "instruction_no"

// Postback data namespace (予定一括登録)
export const BULK_REGISTER_START       = "bulk_register_start"
export const BULK_REGISTER_CONFIRM_YES = "bulk_register_confirm_yes"
export const BULK_REGISTER_CONFIRM_NO  = "bulk_register_confirm_no"

// Postback data namespace (ブック登録)
export const BOOK_REGISTER_START = "book_register_start"

export const BOOK_MAX_PAGES      = 10
export const BOOK_SESSION_TTL_MS = 10 * 60 * 1000 // ブックは複数枚撮影しながら送るため他フローより長めの10分

// ToDo化してよいカテゴリ（Claudeの解析プロンプトが返すcategory値のホワイトリスト。それ以外はnull扱い）
export const TODO_CATEGORIES = ["要準備", "提出のみ", "イベント参加"] as const
