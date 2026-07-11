'use client'

import { useEffect, useState } from 'react'
import { getArchivedPrints, unarchivePrint } from '@/lib/supabase'
import { CATEGORY_COLOR } from '@/types/print'
import type { Print } from '@/types/print'
import Link from 'next/link'

export default function ArchivePage() {
  const [prints, setPrints] = useState<Print[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getArchivedPrints()
      .then(setPrints)
      .finally(() => setLoading(false))
  }, [])

  async function handleUnarchive(print: Print) {
    if (!confirm(`「${print.content?.split('\n')[0]?.slice(0, 20) ?? 'このプリント'}」を有効に戻しますか？`)) return
    await unarchivePrint(print.id)
    setPrints(prev => prev.filter(p => p.id !== print.id))
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-bold text-slate-800 pt-2">📦 アーカイブ</h1>
      <p className="text-xs text-slate-400">締切から30日後に自動アーカイブされます</p>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : prints.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center">
          <p className="text-3xl mb-2">📭</p>
          <p className="text-sm text-slate-500">アーカイブ済みのプリントはありません</p>
        </div>
      ) : (
        <div className="space-y-2">
          {prints.map(print => (
            <div key={print.id} className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/prints/${print.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLOR[print.category ?? 'その他']}`}>
                      {print.category ?? 'その他'}
                    </span>
                    {print.target_person && (
                      <span className="text-xs text-slate-400">{print.target_person}</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 line-clamp-1">
                    {print.content?.split('\n')[0] ?? '内容なし'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    締切: {print.deadline?.replace(/-/g, '/') ?? '未定'}
                    {print.archived_at && ` · アーカイブ: ${new Date(print.archived_at).toLocaleDateString('ja-JP')}`}
                  </p>
                </Link>
                <button
                  onClick={() => handleUnarchive(print)}
                  className="text-xs text-slate-400 hover:text-blue-500 transition-colors shrink-0 p-1"
                  title="有効に戻す"
                >
                  ↩
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
