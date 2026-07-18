import { createClient } from '@supabase/supabase-js'

/** anon keyで初期化したSupabaseクライアント。RLSがPoC前提で緩いため、認可はLIFF側で担保する。 */
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)
