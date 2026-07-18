'use client'

import { useState } from 'react'
import type { PrintEvent, Todo } from '@/types/print'
import { daysUntil } from '@/lib/date-utils'

interface CalendarViewProps {
  events: PrintEvent[]
  /** 省略可。渡すと、未完了ToDoの期限が近い日を⚠アイコン＋赤字＋橙ドットで強調表示する */
  todos?: Todo[]
  onDayClick: (date: string) => void
  selectedDate: string | null
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

export function CalendarView({ events, todos = [], onDayClick, selectedDate }: CalendarViewProps) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())

  // 月グリッド生成: 1日の曜日（0=日）だけ空セルを先頭に埋め、そのあとdaysInMonth日分を並べる
  // （getDay()はDate生成時の月をまたぐ自動繰り上げ処理を利用しており、
  //  new Date(year, month+1, 0)は「翌月0日目」＝「当月の最終日」を指す）
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  // Map event_date → { deadline: bool, nonDeadline: bool }
  // 締切: 赤ドット / 予定: 青ドット で視覚的に区別
  const eventMap = new Map<string, { deadline: boolean; nonDeadline: boolean }>()
  for (const event of events) {
    const key = event.event_date
    if (!eventMap.has(key)) eventMap.set(key, { deadline: false, nonDeadline: false })
    const entry = eventMap.get(key)!
    if (event.is_deadline) entry.deadline = true
    else entry.nonDeadline = true
  }

  // Map due_date → 未完了ToDoが近い（3日以内・期限超過含む）かどうか
  const todoMap = new Map<string, { urgent: boolean }>()
  for (const todo of todos) {
    if (!todo.due_date) continue
    const key = todo.due_date
    const urgent = daysUntil(todo.due_date) <= 3
    const existing = todoMap.get(key)
    todoMap.set(key, { urgent: existing?.urgent || urgent })
  }

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <button onClick={prevMonth} className="p-2 text-slate-500 hover:text-slate-800 transition-colors">‹</button>
        <span className="font-semibold text-slate-800">{year}年 {month + 1}月</span>
        <button onClick={nextMonth} className="p-2 text-slate-500 hover:text-slate-800 transition-colors">›</button>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 text-center">
        {WEEKDAYS.map((d, i) => (
          <div
            key={d}
            className={`py-1 text-xs font-medium ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-slate-400'}`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} />
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const eventInfo = eventMap.get(dateStr)
          const todoInfo = todoMap.get(dateStr)
          const isToday = dateStr === todayStr
          const isSelected = dateStr === selectedDate
          const col = i % 7

          return (
            <button
              key={dateStr}
              onClick={() => onDayClick(dateStr)}
              className={`relative flex flex-col items-center py-1.5 transition-colors ${
                isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'
              }`}
            >
              {/* 未完了ToDoの期限が近い日は右上に⚠を表示して視覚的に強調 */}
              {todoInfo?.urgent && (
                <span className="absolute top-0 right-1 text-[10px] leading-none">⚠️</span>
              )}
              <span
                className={`w-7 h-7 flex items-center justify-center rounded-full text-sm ${
                  isToday
                    ? 'bg-blue-600 text-white font-bold'
                    : todoInfo?.urgent
                    ? 'text-red-600 font-semibold'
                    : col === 0
                    ? 'text-red-500'
                    : col === 6
                    ? 'text-blue-500'
                    : 'text-slate-700'
                }`}
              >
                {day}
              </span>
              {/* Event dots: 青=予定, 赤=締切, 橙=未完了ToDo */}
              {(eventInfo?.nonDeadline || eventInfo?.deadline || todoInfo) && (
                <div className="flex gap-0.5 mt-0.5">
                  {eventInfo?.nonDeadline && (
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  )}
                  {eventInfo?.deadline && (
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  )}
                  {todoInfo && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex justify-end gap-3 px-4 py-2 border-t border-slate-50 text-xs text-slate-400">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />予定
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />締切
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />ToDo
        </span>
      </div>
    </div>
  )
}
