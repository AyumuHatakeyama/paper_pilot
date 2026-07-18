'use client'

import { createContext, useContext, useEffect, useState } from 'react'

/**
 * LIFF（LINE Front-end Framework）でログインユーザーを識別し、許可リストに無ければ
 * 画面をブロックするアプリ全体のゲート。
 *
 * ⚠️ セキュリティ上の注意: ここでの認可チェックはあくまで画面表示の制御であり、
 * Supabaseへのデータアクセス自体を防いではいない。DB側のRLSはanonロールに
 * ほぼ無条件で許可するPoC設定のままなので、anon keyを直接使われた場合はこのゲートを
 * 迂回できてしまう。複数家族に開放する前に、RLSをline_user_id/family_id単位で
 * 絞り込む対応と合わせて強化する必要がある。
 */

interface LiffContextType {
  userId: string | null
  isReady: boolean
  isAuthorized: boolean
}

const LiffContext = createContext<LiffContextType>({
  userId: null,
  isReady: false,
  isAuthorized: false,
})

export function useLiff() {
  return useContext(LiffContext)
}

export function LiffProvider({ children }: { children: React.ReactNode }) {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID

  // Dev mode（LIFF_ID未設定）は最初から結果が決まっているため、effectを待たずlazy initializerで即確定する
  const [state, setState] = useState<LiffContextType>(() =>
    liffId
      ? { userId: null, isReady: false, isAuthorized: false }
      : { userId: 'dev-user', isReady: true, isAuthorized: true }
  )

  useEffect(() => {
    if (!liffId) return // dev modeは上のlazy initializerで解決済み

    const allowed = (process.env.NEXT_PUBLIC_ALLOWED_LINE_USER_IDS ?? '').split(',').filter(Boolean)

    // @line/liffはwindow等ブラウザAPIに依存するため、SSR/ビルド時に評価されないよう動的importにしている
    import('@line/liff').then(({ default: liff }) => {
      liff.init({ liffId }).then(() => {
        if (!liff.isLoggedIn()) {
          liff.login()
          return
        }
        const userId = liff.getContext()?.userId ?? null
        const isAuthorized = userId !== null && (allowed.length === 0 || allowed.includes(userId))
        setState({ userId, isReady: true, isAuthorized })
      }).catch(console.error)
    })
  }, [liffId])

  if (!state.isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-500">読み込み中...</p>
        </div>
      </div>
    )
  }

  if (!state.isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="text-center space-y-3">
          <p className="text-2xl">🔒</p>
          <p className="font-semibold text-slate-700">アクセス権限がありません</p>
          <p className="text-sm text-slate-500">このアプリは家族専用です</p>
        </div>
      </div>
    )
  }

  return <LiffContext.Provider value={state}>{children}</LiffContext.Provider>
}
