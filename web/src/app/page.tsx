'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { CalendarView } from '@/components/CalendarView'
import { EventCard } from '@/components/EventCard'
import { TodoItem } from '@/components/TodoItem'
import { getActiveEvents, getActiveTodos, updateTodoStatus } from '@/lib/supabase'
import type { PrintEvent, Todo } from '@/types/print'
import { daysUntil } from '@/lib/date-utils'

/** トップ画面（カレンダー）。月表示 + 選択日/直近の予定・締切・ToDo一覧を1画面にまとめている。 */
export default function CalendarPage() {
  const [events, setEvents] = useState<PrintEvent[]>([])
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  useEffect(() => {
    // ToDoの取得はカレンダー本体（予定・締切）に対して副次的な情報なので、
    // 個別にcatchして空配列にフォールバックし、失敗してもカレンダー表示自体は生かす
    Promise.all([
      getActiveEvents().catch(() => { console.error("[CalendarPage] getActiveEvents failed"); return [] }),
      getActiveTodos().catch(() => { console.error("[CalendarPage] getActiveTodos failed"); return [] }),
    ])
      .then(([evs, tds]) => {
        setEvents(evs)
        setTodos(tds)
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleToggleTodo(id: string, completed: boolean) {
    await updateTodoStatus(id, completed)
    // getActiveTodosは未完了のみを返す前提なので、完了にしたものは一覧から外す
    setTodos(prev => prev.filter(t => t.id !== id))
  }

  const selectedEvents = selectedDate
    ? events.filter(e => e.event_date === selectedDate)
    : []
  const selectedTodos = selectedDate
    ? todos.filter(t => t.due_date === selectedDate)
    : []

  // 予定・締切は「今日〜14日以内」のみ（過去の予定を一覧に残す意味が無いため）
  const upcoming = events
    .filter(e => {
      const days = daysUntil(e.event_date)
      return days >= 0 && days <= 14
    })
    .slice(0, 10)

  // ToDoは下限を設けず「14日以内」のみ（期限超過であっても未完了なら気づけるよう出し続ける）
  const upcomingTodos = todos
    .filter(t => t.due_date && daysUntil(t.due_date) <= 14)
    .slice(0, 10)

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-lg font-bold text-slate-800">📅 OTAYORI NAVI</h1>
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
            todos={todos}
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
              {selectedEvents.length === 0 && selectedTodos.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">この日の予定・締切はありません</p>
              ) : (
                <>
                  {selectedEvents.map(e => <EventCard key={e.id} event={e} showDate={false} />)}
                  {selectedTodos.length > 0 && (
                    <div className="bg-white rounded-xl p-4 shadow-sm divide-y divide-slate-50">
                      {selectedTodos.map(t => <TodoItem key={t.id} todo={t} onToggle={handleToggleTodo} />)}
                    </div>
                  )}
                </>
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

          {/* 直近のToDo */}
          {!selectedDate && upcomingTodos.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-600">✅ ToDo（期限が近い順）</h2>
              <div className="bg-white rounded-xl p-4 shadow-sm divide-y divide-slate-50">
                {upcomingTodos.map(t => <TodoItem key={t.id} todo={t} onToggle={handleToggleTodo} />)}
              </div>
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
