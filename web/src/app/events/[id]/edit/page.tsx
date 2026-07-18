'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getEventById, updateManualEvent, deleteManualEvent } from '@/lib/supabase'

const inputClass = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelClass = 'text-sm font-medium text-slate-600 block mb-1'

/**
 * Web手動登録イベント（print_id=NULL）専用の編集画面。
 * LINE・プリント由来のイベント（print_idあり）はgetEventByIdが対象外として扱うため、
 * ここに来た時点でそちらのidだった場合は「見つからない」扱いでトップへリダイレクトする。
 */
export default function EditEventPage() {
  const params = useParams()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [eventId, setEventId] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [eventTime, setEventTime] = useState('')
  const [title, setTitle] = useState('')
  const [isDeadline, setIsDeadline] = useState(false)
  const [targetPerson, setTargetPerson] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (typeof params.id !== 'string') return
    getEventById(params.id).then(ev => {
      if (!ev) { router.replace('/'); return }
      setEventId(ev.id)
      setEventDate(ev.event_date)
      // DB は HH:MM:SS で返るため input[type=time] 用に HH:MM に切り詰め
      setEventTime(ev.event_time ? ev.event_time.slice(0, 5) : '')
      setTitle(ev.title)
      setIsDeadline(ev.is_deadline)
      setTargetPerson(ev.target_person ?? '')
      setNote(ev.note ?? '')
    }).finally(() => setLoading(false))
  }, [params.id, router])

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    try {
      await updateManualEvent(eventId, {
        event_date: eventDate,
        event_time: eventTime || null,
        title: title.trim(),
        is_deadline: isDeadline,
        target_person: targetPerson.trim() || null,
        note: note.trim() || null,
      })
      router.push('/')
    } catch {
      alert('保存に失敗しました。')
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm('この予定を削除しますか？')) return
    setDeleting(true)
    try {
      await deleteManualEvent(eventId)
      router.push('/')
    } catch {
      alert('削除に失敗しました。')
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2 pt-2">
        <button onClick={() => router.back()} className="text-slate-500 hover:text-slate-800 transition-colors p-1">←</button>
        <h1 className="font-bold text-slate-800 flex-1">予定を編集</h1>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-xs text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
        >
          {deleting ? '削除中...' : '🗑 削除'}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-white rounded-xl p-4 shadow-sm space-y-4">
          <div>
            <label className={labelClass}>日付</label>
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
            <label className={labelClass}>タイトル</label>
            <input
              type="text"
              required
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
            <label className={labelClass}>対象者</label>
            <input
              type="text"
              placeholder="例：太郎、長女"
              value={targetPerson}
              onChange={e => setTargetPerson(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>補足コメント</label>
            <textarea
              rows={3}
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
          {saving ? '保存中...' : '変更を保存'}
        </button>
      </form>
    </div>
  )
}
