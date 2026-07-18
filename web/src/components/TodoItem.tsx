'use client'

import { useState } from 'react'
import type { Todo } from '@/types/print'
import { TODO_CATEGORY_COLOR } from '@/types/print'

interface TodoItemProps {
  todo: Todo
  onToggle: (id: string, completed: boolean) => void | Promise<void>
}

function daysUntil(date: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((new Date(date).getTime() - today.getTime()) / 86400000)
}

export function TodoItem({ todo, onToggle }: TodoItemProps) {
  const [updating, setUpdating] = useState(false)
  const completed = todo.status === '完了'
  const days = todo.due_date ? daysUntil(todo.due_date) : null
  const urgent = !completed && days !== null && days <= 3

  async function handleChange() {
    setUpdating(true)
    try {
      await onToggle(todo.id, !completed)
    } finally {
      setUpdating(false)
    }
  }

  return (
    <label className={`flex items-start gap-3 py-2 cursor-pointer select-none ${updating ? 'opacity-50' : ''}`}>
      <input
        type="checkbox"
        checked={completed}
        disabled={updating}
        onChange={handleChange}
        className="w-4 h-4 mt-0.5 rounded accent-blue-600 shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm ${completed ? 'line-through text-slate-400' : 'text-slate-700'}`}>
            {todo.title}
          </span>
          {todo.category && (
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${TODO_CATEGORY_COLOR[todo.category] ?? 'bg-slate-100 text-slate-500'}`}>
              {todo.category}
            </span>
          )}
          {todo.reminder_enabled && !completed && (
            <span className="text-xs text-slate-400" title="リマインドON">🔔</span>
          )}
        </div>
        {todo.due_date && (
          <p className={`text-xs mt-0.5 ${urgent ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>
            {urgent && '⚠ '}
            期限：{todo.due_date.replace(/-/g, '/')}
          </p>
        )}
      </div>
    </label>
  )
}
