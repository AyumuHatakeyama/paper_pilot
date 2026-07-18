'use client'

import { useEffect, useState } from 'react'
import { useLiff } from '@/components/LiffProvider'
import { getNotificationSettings, upsertNotificationSettings } from '@/lib/supabase'
import { WEEKDAY_LABELS } from '@/types/notification'
import type { NotificationSettings } from '@/types/notification'

const DEFAULT_SETTINGS: Omit<NotificationSettings, 'id' | 'line_user_id' | 'updated_at'> = {
  frequency: 'daily',
  weekly_day: null,
  send_time: '22:00:00',
  digest_enabled: true,
  reminder_enabled: true,
  send_when_empty: true,
}

const labelClass = 'text-sm font-medium text-slate-600 block mb-1'

export default function SettingsPage() {
  const { userId, isReady } = useLiff()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [sendWhenEmpty, setSendWhenEmpty] = useState(true)

  const [frequency, setFrequency] = useState<'daily' | 'weekly'>(DEFAULT_SETTINGS.frequency)
  const [weeklyDay, setWeeklyDay] = useState<number>(0)
  const [sendTime, setSendTime] = useState('22:00')
  const [digestEnabled, setDigestEnabled] = useState(DEFAULT_SETTINGS.digest_enabled)
  const [reminderEnabled, setReminderEnabled] = useState(DEFAULT_SETTINGS.reminder_enabled)

  useEffect(() => {
    if (!isReady || !userId) return
    getNotificationSettings(userId).then(s => {
      const base = s ?? { ...DEFAULT_SETTINGS, line_user_id: userId, id: '', updated_at: '' }
      setFrequency(base.frequency)
      setWeeklyDay(base.weekly_day ?? 0)
      setSendTime(base.send_time.slice(0, 5))
      setDigestEnabled(base.digest_enabled)
      setReminderEnabled(base.reminder_enabled)
      setSendWhenEmpty(base.send_when_empty)
    }).finally(() => setLoading(false))
  }, [isReady, userId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) return
    setSaving(true)
    setSaved(false)
    try {
      await upsertNotificationSettings(userId, {
        frequency,
        weekly_day: frequency === 'weekly' ? weeklyDay : null,
        send_time: `${sendTime}:00`,
        digest_enabled: digestEnabled,
        reminder_enabled: reminderEnabled,
        send_when_empty: sendWhenEmpty,
      })
      setSaved(true)
    } catch {
      alert('保存に失敗しました。')
    } finally {
      setSaving(false)
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
        <h1 className="font-bold text-slate-800 flex-1">⚙️ 通知設定</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-white rounded-xl p-4 shadow-sm space-y-4">
          <div>
            <label className={labelClass}>通知頻度</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="radio"
                  name="frequency"
                  checked={frequency === 'daily'}
                  onChange={() => setFrequency('daily')}
                  className="w-4 h-4 accent-blue-600"
                />
                毎日
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="radio"
                  name="frequency"
                  checked={frequency === 'weekly'}
                  onChange={() => setFrequency('weekly')}
                  className="w-4 h-4 accent-blue-600"
                />
                曜日を指定
              </label>
            </div>
          </div>

          {frequency === 'weekly' && (
            <div>
              <label className={labelClass}>曜日</label>
              <div className="flex gap-1.5 flex-wrap">
                {WEEKDAY_LABELS.map((label, i) => (
                  <button
                    type="button"
                    key={label}
                    onClick={() => setWeeklyDay(i)}
                    className={`w-9 h-9 rounded-full text-sm font-medium transition-colors ${
                      weeklyDay === i ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className={labelClass}>送信時刻</label>
            <input
              type="time"
              step={1800}
              required
              value={sendTime}
              onChange={e => setSendTime(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <label className="flex items-center justify-between gap-3 cursor-pointer select-none">
            <span className="text-sm text-slate-700">📅 週次ダイジェスト</span>
            <input
              type="checkbox"
              checked={digestEnabled}
              onChange={e => setDigestEnabled(e.target.checked)}
              className="w-4 h-4 rounded accent-blue-600"
            />
          </label>

          <label className="flex items-center justify-between gap-3 cursor-pointer select-none">
            <span className="text-sm text-slate-700">⏰ 締切リマインド</span>
            <input
              type="checkbox"
              checked={reminderEnabled}
              onChange={e => setReminderEnabled(e.target.checked)}
              className="w-4 h-4 rounded accent-blue-600"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-blue-600 text-white rounded-xl py-3 font-semibold text-sm disabled:opacity-50 hover:bg-blue-700 transition-colors"
        >
          {saving ? '保存中...' : '設定を保存'}
        </button>
        {saved && <p className="text-xs text-emerald-600 text-center">保存しました</p>}
      </form>
    </div>
  )
}
