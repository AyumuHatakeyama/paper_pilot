/**
 * Supabaseアクセス関数のバレル。ドメインごとに prints.ts / events.ts / books.ts / todos.ts /
 * notifications.ts に分割してあり、既存のコンポーネントは変更なしで `@/lib/supabase` から
 * まとめてimportできる。新規に追加する関数は、対応するドメインファイルに書くこと。
 */
export { supabase } from './supabase-client'
export * from './prints'
export * from './books'
export * from './events'
export * from './todos'
export * from './notifications'
