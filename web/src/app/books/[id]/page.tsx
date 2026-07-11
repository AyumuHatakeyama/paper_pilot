'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getBookById, getPrintsByBookId } from '@/lib/supabase'
import { PrintCard } from '@/components/PrintCard'
import type { Print, PrintBook } from '@/types/print'

export default function BookDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [book, setBook] = useState<PrintBook | null>(null)
  const [prints, setPrints] = useState<Print[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (typeof params.id !== 'string') return
    Promise.all([
      getBookById(params.id),
      getPrintsByBookId(params.id),
    ]).then(([b, ps]) => {
      setBook(b)
      setPrints(ps)
    }).finally(() => setLoading(false))
  }, [params.id])

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!book) {
    return (
      <div className="p-4 text-center">
        <p className="text-slate-500">ブックが見つかりません</p>
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
        <h1 className="font-bold text-slate-800 flex-1">📚 {book.title}</h1>
      </div>

      {/* Prints */}
      {prints.length === 0 ? (
        <p className="text-slate-500 text-sm text-center py-8">このブックにはまだプリントがありません</p>
      ) : (
        <div className="space-y-3">
          {prints.map(print => (
            <PrintCard key={print.id} print={print} />
          ))}
        </div>
      )}

      <p className="text-xs text-slate-400 text-center pb-2">
        登録日: {new Date(book.created_at).toLocaleDateString('ja-JP')}
      </p>
    </div>
  )
}
