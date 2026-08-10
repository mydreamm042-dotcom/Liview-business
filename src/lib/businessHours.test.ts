import { describe, it, expect } from 'vitest'
import { normalizeDay, validateDay, BusinessHoursDay } from './businessHours'

function day(overrides: Partial<BusinessHoursDay> = {}): BusinessHoursDay {
  return {
    weekday: 2,
    is_closed: false,
    is_24h: false,
    open_time: '18:00',
    close_time: '02:00',
    last_order_time: null,
    ...overrides,
  }
}

// BUSINESS_RULES.md §2.2 "요일별 영업시간" — 정기휴무/24시간 체크 시 시간 필드를 서버가
// 강제로 맞춘다 (클라이언트가 뭘 보내든 저장값은 항상 그 상태에 맞게 정규화됨).
describe('normalizeDay', () => {
  it('정기휴무면 24시간 여부와 무관하게 시간 필드를 00:00으로, 라스트오더는 null로 맞춘다', () => {
    const result = normalizeDay(day({ is_closed: true, is_24h: true, open_time: '18:00', close_time: '02:00', last_order_time: '01:00' }))
    expect(result).toMatchObject({ is_closed: true, is_24h: false, open_time: '00:00', close_time: '00:00', last_order_time: null })
  })

  it('24시간 영업이면 시작/종료를 00:00으로 맞추고 라스트오더는 그대로 둔다', () => {
    const result = normalizeDay(day({ is_24h: true, open_time: '18:00', close_time: '02:00', last_order_time: '05:00' }))
    expect(result).toMatchObject({ is_24h: true, open_time: '00:00', close_time: '00:00', last_order_time: '05:00' })
  })

  it('일반 영업일은 값을 그대로 둔다', () => {
    const input = day({ open_time: '14:00', close_time: '04:00', last_order_time: '03:00' })
    expect(normalizeDay(input)).toEqual(input)
  })
})

// BUSINESS_RULES.md §2.2 "라스트 오더 유효성" — 자정을 넘어가는 영업(예: 14:00~04:00)은
// "시작 이후 또는 종료 이전"으로 판정 방식이 달라진다.
describe('validateDay', () => {
  it('정기휴무/24시간 영업은 항상 유효하다 (검사를 건너뜀)', () => {
    expect(validateDay(day({ is_closed: true, open_time: '', close_time: '' }))).toBeNull()
    expect(validateDay(day({ is_24h: true, open_time: '00:00', close_time: '00:00' }))).toBeNull()
  })

  it('시작/종료 시간이 없으면 에러', () => {
    expect(validateDay(day({ open_time: '', close_time: '18:00' }))).toContain('시작/종료')
  })

  it('시작과 종료가 같으면 에러', () => {
    expect(validateDay(day({ open_time: '18:00', close_time: '18:00' }))).toContain('같을 수 없습니다')
  })

  it('라스트오더 없으면 통과', () => {
    expect(validateDay(day({ open_time: '18:00', close_time: '23:00', last_order_time: null }))).toBeNull()
  })

  it('같은 날 끝나는 영업 — 라스트오더가 영업시간 안이면 통과', () => {
    expect(validateDay(day({ open_time: '18:00', close_time: '23:00', last_order_time: '22:30' }))).toBeNull()
  })

  it('같은 날 끝나는 영업 — 라스트오더가 영업시간 밖이면 에러', () => {
    expect(validateDay(day({ open_time: '18:00', close_time: '23:00', last_order_time: '10:00' }))).toContain('라스트 오더')
  })

  it('자정을 넘는 영업 — 라스트오더가 다음날 새벽이면(종료 이전) 통과', () => {
    // 14:00~익일 04:00 영업, 라스트오더 익일 03:00
    expect(validateDay(day({ open_time: '14:00', close_time: '04:00', last_order_time: '03:00' }))).toBeNull()
  })

  it('자정을 넘는 영업 — 라스트오더가 당일 저녁이면(시작 이후) 통과', () => {
    expect(validateDay(day({ open_time: '14:00', close_time: '04:00', last_order_time: '20:00' }))).toBeNull()
  })

  it('자정을 넘는 영업 — 라스트오더가 시작 전/종료 후 사이(낮 시간)면 에러', () => {
    // 14:00~익일 04:00 영업 중 오전 10시는 영업시간이 아니다
    expect(validateDay(day({ open_time: '14:00', close_time: '04:00', last_order_time: '10:00' }))).toContain('라스트 오더')
  })
})
