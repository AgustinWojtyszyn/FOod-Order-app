import { describe, expect, it } from 'vitest'
import { formatDuration, formatScheduleRange, getScheduleCountdown, normalizeContext } from './orderSchedule'

describe('order schedule frontend helpers', () => {
  it('normalizes SQL schedule context shape', () => {
    expect(normalizeContext({
      flow: 'extended',
      opens_at: '09:00',
      closes_at: '22:00',
      is_open: true,
      state: 'open',
      next_transition_at: '2026-08-28T22:00:00-03:00'
    })).toMatchObject({
      flow: 'extended',
      opensAt: '09:00',
      closesAt: '22:00',
      isOpen: true,
      state: 'open'
    })
  })

  it('formats ranges and durations for the countdown', () => {
    expect(formatScheduleRange({ opensAt: '06:00', closesAt: '14:00' })).toBe('06:00-14:00')
    expect(formatDuration(3 * 60 * 60 * 1000 + 24 * 60 * 1000)).toBe('3 h 24 min')
  })

  it('builds before_open countdown state', () => {
    const countdown = getScheduleCountdown({
      flow: 'standard',
      opens_at: '06:00',
      closes_at: '14:00',
      is_open: false,
      state: 'before_open',
      next_transition_at: '2026-08-28T06:00:00-03:00'
    }, new Date('2026-08-28T05:30:00-03:00'))

    expect(countdown).toMatchObject({
      countdownLabel: 'Abre en',
      countdownValue: '30 min',
      countdownTone: 'normal',
      statusLabel: 'Pedidos cerrados',
      scheduleRange: '06:00-14:00'
    })
  })

  it('builds open countdown state with warning tone near close', () => {
    const countdown = getScheduleCountdown({
      flow: 'extended',
      opens_at: '09:00',
      closes_at: '22:00',
      is_open: true,
      state: 'open',
      next_transition_at: '2026-08-28T22:00:00-03:00'
    }, new Date('2026-08-28T21:30:00-03:00'))

    expect(countdown).toMatchObject({
      countdownLabel: 'Cierra en',
      countdownValue: '30 min',
      countdownTone: 'warn',
      statusLabel: 'Pedidos habilitados',
      scheduleRange: '09:00-22:00'
    })
  })

  it('builds after_close countdown state for next day opening', () => {
    const countdown = getScheduleCountdown({
      flow: 'extended',
      opens_at: '09:00',
      closes_at: '22:00',
      is_open: false,
      state: 'after_close',
      next_transition_at: '2026-08-29T09:00:00-03:00'
    }, new Date('2026-08-28T22:01:00-03:00'))

    expect(countdown.countdownLabel).toBe('Abre en')
    expect(countdown.countdownValue).toBe('10 h 59 min')
  })
})
