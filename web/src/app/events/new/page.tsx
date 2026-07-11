'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createManualEvent } from '@/lib/supabase'

const inputClass = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelClass = 'text-sm font-medium text-slate-600 block mb-1'

export default function NewEventPage() {
  const router = useRouter()
  const today = new Date().toISOString().slice(0, 10)

  const [eventDate, setEventDate] = useState(today)
  const [eventTime, setEventTime] = useState('')
  const [title, setTitle] = useState('')
  const [isDeadline, setIsDeadline] = useState(false)
  const [targetPerson, setTargetPerson] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  // URLパラメータ ?date=YYYY-MM-DD があれば日付を初期値に設定
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const date = params.get('date')
    if (date) setEventDate(date)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    try {
      await createManualEvent({
        event_date: eventDate,
        event_time: eventTime || null,
        title: title.trim(),
        is_deadline: isDeadline,
        target_person: targetPerson.trim() || null,
        note: note.trim() || null,
      })
      router.push('/')
    } catch {
      alert('保存に失敗しました。もう一度試してください。')
      setSaving(false)
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2 pt-2">
        <button onClick={() => router.back()} className="text-slate-500 hover:text-slate-800 transition-colors p-1">←</button>
        <h1 className="font-bold text-slate-800 flex-1">予定を手動追加</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-white rounded-xl p-4 shadow-sm space-y-4">
          <div>
            <label className={labelClass}>日付 *</label>
            <input
              type="date"
              required
              value={eventDate}
              onChange={e => setEventDate(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>時間（任意）</label>
            <input
              type="time"
              value={eventTime}
              onChange={e => setEventTime(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>タイトル *</label>
            <input
              type="text"
              required
              placeholder="例：個人面談、運動会"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className={inputClass}
            />
          </div>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isDeadline}
              onChange={e => setIsDeadline(e.target.checked)}
              className="w-4 h-4 rounded accent-red-500"
            />
            <span className="text-sm text-slate-700">締切・提出期限</span>
          </label>

          <div>
            <label className={labelClass}>対象者（任意）</label>
            <input
              type="text"
              placeholder="例：太郎、長女"
              value={targetPerson}
              onChange={e => setTargetPerson(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>補足コメント（任意）</label>
            <textarea
              rows={3}
              placeholder="例：体操服着用、弁当持参"
              value={note}
              onChange={e => setNote(e.target.value)}
              className={`${inputClass} resize-none`}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving || !title.trim()}
          className="w-full bg-blue-600 text-white rounded-xl py-3 font-semibold text-sm disabled:opacity-50 hover:bg-blue-700 transition-colors"
        >
          {saving ? '保存中...' : '保存する'}
        </button>
      </form>
    </div>
  )
}
