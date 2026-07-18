'use client'

import { useState, useRef, useEffect } from 'react'

interface Message {
  role: 'user' | 'assistant'
  text: string
}

const SUGGESTIONS = [
  '今週の締切は？',
  '水泳の持ち物は？',
  '次の提出物はいつ？',
  '明日必要なものは？',
]

/**
 * プリントについて自由に質問できるチャット画面。
 * 送信先は`/api/chat`（このNext.jsアプリ内のAPI Route）で、Supabaseの`chat` Edge Functionは
 * 使っていない（同等ロジックの別実装が2箇所に存在している状態。詳細はapi/chat/route.tsのコメント参照）。
 */
export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', text: 'プリントについて何でも聞いてください 📋\n「今週の締切は？」「水泳の持ち物は？」など' },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(question: string) {
    if (!question.trim() || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: question }])
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      const { answer, error } = await res.json()
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: error ? 'エラーが発生しました。もう一度試してください。' : answer,
      }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'エラーが発生しました。' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)]">
      {/* Header */}
      <div className="p-4 pb-2 pt-6">
        <h1 className="text-lg font-bold text-slate-800">💬 プリントに質問</h1>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 space-y-3 pb-2">
        {/* Suggestions */}
        {messages.length <= 1 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                onClick={() => send(s)}
                className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-full border border-blue-100 hover:bg-blue-100 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-line leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-white text-slate-700 shadow-sm rounded-bl-sm'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-white border-t border-slate-100">
        <form
          onSubmit={e => { e.preventDefault(); send(input) }}
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="質問を入力..."
            disabled={loading}
            className="flex-1 bg-slate-100 rounded-full px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center disabled:opacity-40 transition-opacity shrink-0"
          >
            ↑
          </button>
        </form>
      </div>
    </div>
  )
}
