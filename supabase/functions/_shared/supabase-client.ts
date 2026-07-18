/**
 * webhook-line / cron-reminder / cron-notify の3つのEdge Functionで共有するSupabaseクライアント。
 * 各Functionは個別にデプロイされるが、Secretsはプロジェクト全体で共有されているため
 * このクライアント初期化ロジックだけを共通化できる。
 */
import { createClient } from "npm:@supabase/supabase-js@2"

export const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
)
