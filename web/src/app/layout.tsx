import type { Metadata } from 'next'
import './globals.css'
import { LiffProvider } from '@/components/LiffProvider'
import { Navigation } from '@/components/Navigation'

export const metadata: Metadata = {
  title: 'OTAYORI NAVI',
  description: '子供の学校プリントをAIで管理',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-slate-50 antialiased">
        {/* LINEのLIFFブラウザ/スマホでの利用を主眼としたモバイル専用レイアウト。
            max-w-lgでPC幅でも中央にスマホ相当の幅で表示し、pb-20は固定表示のNavigation分の余白 */}
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
