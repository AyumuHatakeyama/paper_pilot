'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { CalendarView } from '@/components/CalendarView'
import { EventCard } from '@/components/EventCard'
import { getActiveEvents } from '@/lib/supabase'
import type { PrintEvent } from '@/types/print'

export default function CalendarPage() {
  const [events, setEvents] = useState<PrintEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  useEffect(() => {
    getActiveEvents()
      .then(setEvents)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const selectedEvents = selectedDate
    ? events.filter(e => e.event_date === selectedDate)
    : []

  const upcoming = events
    .filter(e => {
      const days = Math.ceil((new Date(e.event_date).getTime() - Date.now()) / 86400000)
      return days >= 0 && days <= 14
    })
    .slice(0, 10)

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-lg font-bold text-slate-800">📅 AIプリント秘書</h1>
        <Link
          href="/events/new"
          className="w-9 h-9 flex items-center justify-center bg-blue-600 text-white rounded-full text-xl font-light shadow-sm hover:bg-blue-700 transition-colors"
          aria-label="予定を手動追加"
        >
          +
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <CalendarView
            events={events}
            selectedDate={selectedDate}
            onDayClick={date => setSelectedDate(prev => prev === date ? null : date)}
          />

          {/* 選択日のイベント */}
          {selectedDate && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-600">
                  {selectedDate.replace(/-/g, '/')} の予定・締切
                </h2>
                <Link
                  href={`/events/new?date=${selectedDate}`}
                  className="text-xs text-blue-600 font-medium hover:text-blue-800 transition-colors"
                >
                  ＋ 追加
                </Link>
              </div>
              {selectedEvents.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">この日の予定・締切はありません</p>
              ) : (
                selectedEvents.map(e => <EventCard key={e.id} event={e} showDate={false} />)
              )}
            </div>
          )}

          {/* 直近の予定・締切 */}
          {!selectedDate && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-600">直近の予定・締切（14日以内）</h2>
              {upcoming.length === 0 ? (
                <div className="bg-white rounded-xl p-6 text-center">
                  <p className="text-3xl mb-2">🎉</p>
                  <p className="text-sm text-slate-500">直近の予定・締切はありません</p>
                  <p className="text-xs text-slate-400 mt-1">LINEでプリントの写真を送ってください</p>
                </div>
              ) : (
                upcoming.map(e => <EventCard key={e.id} event={e} />)
              )}
            </div>
          )}

          {events.length > 0 && (
            <p className="text-xs text-slate-400 text-center">
              有効なイベント {events.length}件
            </p>
          )}
        </>
      )}
    </div>
  )
}
