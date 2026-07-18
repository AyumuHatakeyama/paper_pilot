/**
 * 「今日からYYYY-MM-DDまで何日か」を計算する。カレンダー・EventCard・PrintCard・TodoItemの
 * 「あと◯日／◯日経過」表示、および締切間近の強調表示（urgent判定）で共通して使う。
 * 戻り値が0なら今日、負ならその日数分だけ過ぎている。
 *
 * 注意: `date`は`year, month, day`を個別に渡してローカルタイムゾーンのmidnightとして
 * 組み立てている。`new Date("YYYY-MM-DD")`のようにISO文字列をそのまま渡すとUTC midnightとして
 * 解釈されるため、UTCより進んだタイムゾーン（JST等）では「今日」の判定が実際の日付より
 * 1日進んでしまう不具合があった（今日の日付を渡しても「1日後」になる等）。
 */
export function daysUntil(date: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const [year, month, day] = date.split('-').map(Number)
  const target = new Date(year, month - 1, day)
  return Math.ceil((target.getTime() - today.getTime()) / 86400000)
}
