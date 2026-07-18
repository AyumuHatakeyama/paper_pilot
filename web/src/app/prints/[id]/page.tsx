'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getPrintById, archivePrint, getPrintEvents, getTodosByEventIds, updateTodoStatus } from '@/lib/supabase'
import { CATEGORY_COLOR } from '@/types/print'
import type { Print, PrintEventRow, Todo } from '@/types/print'
import { TodoItem } from '@/components/TodoItem'

export default function PrintDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [print, setPrint] = useState<Print | null>(null)
  const [events, setEvents] = useState<PrintEventRow[]>([])
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [archiving, setArchiving] = useState(false)
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    if (typeof params.id !== 'string') return
    const printId = params.id
    getPrintEvents(printId).then(async (evs) => {
      const [p, todoList] = await Promise.all([
        getPrintById(printId),
        getTodosByEventIds(evs.map(e => e.id)),
      ])
      setPrint(p)
      setEvents(evs)
      setTodos(todoList)
    }).finally(() => setLoading(false))
  }, [params.id])

  async function handleToggleTodo(id: string, completed: boolean) {
    await updateTodoStatus(id, completed)
    setTodos(prev => prev.map(t =>
      t.id === id
        ? { ...t, status: completed ? '完了' : '未完了', completed_at: completed ? new Date().toISOString() : null }
        : t
    ))
  }

  async function handleArchive() {
    if (!print) return
    if (!confirm('このプリントをアーカイブしますか？')) return
    setArchiving(true)
    try {
      await archivePrint(print.id)
      router.push('/')
    } catch {
      alert('アーカイブに失敗しました')
      setArchiving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!print) {
    return (
      <div className="p-4 text-center">
        <p className="text-slate-500">プリントが見つかりません</p>
        <button onClick={() => router.back()} className="mt-4 text-blue-600 text-sm">← 戻る</button>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 pt-2">
        <button onClick={() => router.back()} className="text-slate-500 hover:text-slate-800 transition-colors p-1">
          ←
        </button>
        <h1 className="font-bold text-slate-800 flex-1">プリント詳細</h1>
        <button
          onClick={handleArchive}
          disabled={archiving}
          className="text-xs text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
        >
          {archiving ? '処理中...' : '📦 アーカイブ'}
        </button>
      </div>

      {/* Meta */}
      <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLOR[print.category ?? 'その他']}`}>
            {print.category ?? 'その他'}
          </span>
          {print.target_person && (
            <span className="text-sm text-slate-600">👤 {print.target_person}</span>
          )}
        </div>

        {/* 日程一覧（print_events） */}
        {events.length > 0 ? (
          <div>
            <p className="text-xs text-slate-400 mb-2">日程一覧</p>
            <div className="space-y-1.5">
              {events.map(ev => (
                <div key={ev.id} className="flex items-center gap-2">
                  {ev.is_deadline ? (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700 shrink-0">⏰ 締切</span>
                  ) : (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 shrink-0">📅 予定</span>
                  )}
                  <span className="text-sm font-medium text-slate-700">{ev.event_date.replace(/-/g, '/')}</span>
                  {ev.event_time && (
                    <span className="text-sm text-slate-400 shrink-0">{ev.event_time.slice(0, 5)}</span>
                  )}
                  <span className="text-sm text-slate-600 truncate">{ev.title}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          // print_eventsがない場合は旧フィールドをフォールバック表示
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-xs text-slate-400">実施日</p>
              <p className="font-medium text-slate-700">{print.date?.replace(/-/g, '/') ?? '未定'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">締切</p>
              <p className="font-medium text-slate-700">{print.deadline?.replace(/-/g, '/') ?? '未定'}</p>
            </div>
          </div>
        )}
      </div>

      {/* ToDo */}
      {todos.length > 0 && (
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-600 mb-1">✅ ToDo</h2>
          <div className="divide-y divide-slate-50">
            {todos.map(todo => (
              <TodoItem key={todo.id} todo={todo} onToggle={handleToggleTodo} />
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-600 mb-2">📝 内容</h2>
        <div className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">
          {print.content ?? '（内容なし）'}
        </div>
      </div>

      {/* Original image */}
      {print.image_url && !imgError && (
        <div className="bg-white rounded-xl overflow-hidden shadow-sm">
          <h2 className="text-sm font-semibold text-slate-600 p-4 pb-2">🖼 元のプリント</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={print.image_url}
            alt="プリント原本"
            className="w-full object-contain max-h-[60vh]"
            onError={() => setImgError(true)}
          />
        </div>
      )}

      <p className="text-xs text-slate-400 text-center pb-2">
        登録日: {new Date(print.created_at).toLocaleDateString('ja-JP')}
      </p>
    </div>
  )
}
