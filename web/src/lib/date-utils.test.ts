import { describe, expect, it, vi, afterEach } from 'vitest'
import { daysUntil } from './date-utils'

describe('daysUntil', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns 0 when the date is today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-18T15:30:00'))
    expect(daysUntil('2026-07-18')).toBe(0)
  })

  it('returns a positive number of days for a future date', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-18T00:00:00'))
    expect(daysUntil('2026-07-21')).toBe(3)
  })

  it('returns a negative number of days for a past (overdue) date', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-18T00:00:00'))
    expect(daysUntil('2026-07-15')).toBe(-3)
  })

  it('ignores the current time of day (23:59 today is still 0 days, not -1)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-18T23:59:00'))
    expect(daysUntil('2026-07-18')).toBe(0)
  })
})
