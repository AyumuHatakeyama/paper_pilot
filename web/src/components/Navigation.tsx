'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/',         icon: '📅', label: 'カレンダー' },
  { href: '/chat',     icon: '💬', label: 'チャット'   },
  { href: '/archive',  icon: '📦', label: 'アーカイブ' },
  { href: '/settings', icon: '⚙️', label: '設定'       },
]

export function Navigation() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50">
      <div className="max-w-lg mx-auto flex">
        {NAV_ITEMS.map(({ href, icon, label }) => {
          // '/'だけはstartsWith判定にすると全パスが前方一致してしまうため、完全一致にする
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center py-2 gap-0.5 text-xs transition-colors ${
                active ? 'text-blue-600' : 'text-slate-400'
              }`}
            >
              <span className="text-xl">{icon}</span>
              <span>{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
