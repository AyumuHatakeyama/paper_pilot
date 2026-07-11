'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Print } from '@/types/print'
import { CATEGORY_COLOR } from '@/types/print'

interface PrintCardProps {
  print: Print
  showDeadline?: boolean
}

function daysUntil(deadline: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(deadline)
  return Math.ceil((d.getTime() - today.getTime()) / 86400000)
}

export function PrintCard({ print, showDeadline = true }: PrintCardProps) {
  const router = useRouter()
  const days = print.deadline ? daysUntil(print.deadline) : null
  const urgent = days !== null && days <= 3

  return (
    <div
      onClick={() => router.push(`/prints/${print.id}`)}
      className="block bg-white rounded-xl p-4 shadow-sm border border-slate-100 hover:border-blue-200 transition-colors cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLOR[print.category ?? 'その他']}`}>
              {print.category ?? 'その他'}
            </span>
            {print.target_person && (
              <span className="text-xs text-slate-500">{print.target_person}</span>
            )}
            {print.book_id && print.print_books && (
              <Link
                href={`/books/${print.book_id}`}
                onClick={(e) => e.stopPropagation()}
                className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors"
              >
                📚 {print.print_books.title}
              </Link>
            )}
          </div>
          <p className="text-sm text-slate-700 line-clamp-2 whitespace-pre-line">
            {print.content?.split('\n')[0] ?? '内容なし'}
          </p>
        </div>
        {showDeadline && print.deadline && (
          <div className={`text-right shrink-0 ${urgent ? 'text-red-500' : 'text-slate-400'}`}>
            <p className="text-xs">締切</p>
            <p className="text-sm font-semibold">{print.deadline.replace(/-/g, '/')}</p>
            {days !== null && (
              <p className="text-xs">{days === 0 ? '今日' : days < 0 ? `${Math.abs(days)}日超過` : `${days}日後`}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
