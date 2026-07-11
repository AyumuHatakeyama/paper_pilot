'use client'

import { createContext, useContext, useEffect, useState } from 'react'

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
  const [state, setState] = useState<LiffContextType>({
    userId: null,
    isReady: false,
    isAuthorized: false,
  })

  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID

    // Dev mode: skip LIFF auth if LIFF_ID is not configured
    if (!liffId) {
      setState({ userId: 'dev-user', isReady: true, isAuthorized: true })
      return
    }

    const allowed = (process.env.NEXT_PUBLIC_ALLOWED_LINE_USER_IDS ?? '').split(',').filter(Boolean)

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
  }, [])

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
