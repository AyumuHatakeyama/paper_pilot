import type { Metadata } from 'next'
import './globals.css'
import { LiffProvider } from '@/components/LiffProvider'
import { Navigation } from '@/components/Navigation'

export const metadata: Metadata = {
  title: 'AIプリント秘書',
  description: '子供の学校プリントをAIで管理',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-slate-50 antialiased">
        <LiffProvider>
          <div className="max-w-lg mx-auto min-h-screen pb-20">
            {children}
          </div>
          <Navigation />
        </LiffProvider>
      </body>
    </html>
  )
}
