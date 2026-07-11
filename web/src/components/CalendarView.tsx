'use client'

import { useState } from 'react'
import type { PrintEvent } from '@/types/print'

interface CalendarViewProps {
  events: PrintEvent[]
  onDayClick: (date: string) => void
  selectedDate: string | null
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

export function CalendarView({ events, onDayClick, selectedDate }: CalendarViewProps) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())

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
              <span
                className={`w-7 h-7 flex items-center justify-center rounded-full text-sm ${
                  isToday
                    ? 'bg-blue-600 text-white font-bold'
                    : col === 0
                    ? 'text-red-500'
                    : col === 6
                    ? 'text-blue-500'
                    : 'text-slate-700'
                }`}
              >
                {day}
              </span>
              {/* Event dots: 青=予定, 赤=締切 */}
              {eventInfo && (eventInfo.nonDeadline || eventInfo.deadline) && (
                <div className="flex gap-0.5 mt-0.5">
                  {eventInfo.nonDeadline && (
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  )}
                  {eventInfo.deadline && (
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
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
      </div>
    </div>
  )
}
