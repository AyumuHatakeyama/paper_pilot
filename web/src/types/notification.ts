export interface NotificationSettings {
  id: string
  line_user_id: string
  frequency: 'daily' | 'weekly'
  weekly_day: number | null // 0=日,1=月...6=土
  send_time: string // "HH:MM:SS"
  digest_enabled: boolean
  reminder_enabled: boolean
  send_when_empty: boolean
  updated_at: string
}

export const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']
