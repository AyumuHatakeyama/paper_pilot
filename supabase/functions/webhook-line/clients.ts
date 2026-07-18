/** webhook-line固有のクライアント初期化（Supabaseは_sharedを再エクスポート、AnthropicはClaude解析専用なのでここだけで使う） */
import Anthropic from "npm:@anthropic-ai/sdk"

export { supabase } from "../_shared/supabase-client.ts"
export const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! })
