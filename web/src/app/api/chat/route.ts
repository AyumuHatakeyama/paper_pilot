import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

/**
 * Web版チャット（/chat画面）が叩くAPI Route。ほぼ同じロジックが
 * `supabase/functions/chat/index.ts`にも存在するが、そちらは現状どこからも
 * 呼ばれていない（未使用の可能性が高い）。重複を解消するなら、どちらかに一本化すること。
 */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(req: NextRequest) {
  const { question } = await req.json()
  if (!question?.trim()) {
    return NextResponse.json({ error: 'question is required' }, { status: 400 })
  }

  const { data: prints, error } = await supabase
    .from('prints')
    .select('date, deadline, target_person, category, content')
    .is('archived_at', null)
    .order('deadline', { ascending: true, nullsFirst: false })

  if (error) return NextResponse.json({ error: 'DB error' }, { status: 500 })

  const noData = !prints || prints.length === 0
  const markdown = (prints ?? []).map(p =>
    `## ${p.deadline ?? '締切未定'}｜${p.target_person ?? '不明'}（${p.category ?? 'その他'}）\n${p.content ?? ''}`
  ).join('\n\n---\n\n')

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    system: noData
      ? '現在有効なプリントはありません。そのことをユーザーに伝えてください。'
      : `あなたは子供の学校・保育園プリントを管理するアシスタントです。
以下のプリント内容を参照して質問に答えてください。
プリントに書かれていない情報は「プリントに記載がありません」と答えてください。
回答は簡潔に200字以内でまとめてください。

【現在有効なプリント一覧】
${markdown}`,
    messages: [{ role: 'user', content: question }],
  })

  const answer = response.content[0].type === 'text' ? response.content[0].text : '回答できませんでした。'
  return NextResponse.json({ answer })
}
