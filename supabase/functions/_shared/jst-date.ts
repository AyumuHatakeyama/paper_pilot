/**
 * JSTでの「今日の日付」をYYYY-MM-DD形式で返す。
 * サーバーはUTCで動く前提のため、`new Date().toISOString()`の生の日付をそのまま使うと、
 * 00:00〜08:59 JSTの間はまだUTCが日付を跨いでおらず前日の日付になってしまう
 * （例: JST 2026-07-18 03:00 は UTC 2026-07-17 18:00）。+9時間してからUTCのgetterで
 * 読むことで、JSTの壁時計の日付を取得する。
 */
export function getJSTDateString(date: Date = new Date()): string {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000)
  return jst.toISOString().split("T")[0]
}
