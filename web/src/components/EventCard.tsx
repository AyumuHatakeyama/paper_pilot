'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { PrintEvent } from '@/types/print'
import { CATEGORY_COLOR } from '@/types/print'
import { daysUntil } from '@/lib/date-utils'

interface EventCardProps {
  event: PrintEvent
  showDate?: boolean
}

const cardClass = 'block bg-white rounded-xl p-4 shadow-sm border border-slate-100 hover:border-blue-200 transition-colors cursor-pointer'

export function EventCard({ event, showDate = true }: EventCardProps) {
  const router = useRouter()
  const days = daysUntil(event.event_date)
  const urgent = event.is_deadline && days <= 3 && days >= 0
  // print_id=NULL = プリントに紐づかないWeb手動登録イベント（詳細はlib/events.tsのファイル冒頭コメント参照）
  const isManual = !event.print_id
  const book = event.prints?.print_books

  const inner = (
    <div className="flex items-start justify-between gap-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          {event.is_deadline ? (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">⏰ 締切</span>
          ) : (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">📅 予定</span>
          )}
          {isManual ? (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">✏️ 手動登録</span>
          ) : (
            <>
              {event.prints?.category && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLOR[event.prints.category]}`}>
                  {event.prints.category}
                </span>
              )}
              {event.prints?.target_person && (
                <span className="text-xs text-slate-500">{event.prints.target_person}</span>
              )}
            </>
          )}
          {isManual && event.target_person && (
            <span className="text-xs text-slate-500">{event.target_person}</span>
          )}
          {book && (
            <Link
              href={`/books/${book.id}`}
              onClick={(e) => e.stopPropagation()}
              className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors"
            >
              📚 {book.title}
            </Link>
          )}
        </div>
        <p className="text-sm font-medium text-slate-800">
          {event.event_time && (
            <span className="text-slate-400 font-normal mr-1">{event.event_time.slice(0, 5)}</span>
          )}
          {event.title}
        </p>
        {isManual && event.note && (
          <p className="text-xs text-slate-400 mt-1 line-clamp-1">{event.note}</p>
        )}
      </div>
      {showDate && (
        <div className={`text-right shrink-0 ${urgent ? 'text-red-500' : 'text-slate-400'}`}>
          <p className="text-sm font-semibold">{event.event_date.replace(/-/g, '/')}</p>
          <p className="text-xs">
            {days === 0 ? '今日' : days < 0 ? `${Math.abs(days)}日経過` : `${days}日後`}
          </p>
        </div>
      )}
    </div>
  )

  const href = isManual ? `/events/${event.id}/edit` : `/prints/${event.print_id}`

  return (
    <div onClick={() => router.push(href)} className={cardClass}>
      {inner}
    </div>
  )
}
