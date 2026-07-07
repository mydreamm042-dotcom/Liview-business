import { describe, it, expect } from 'vitest'
import {
  simulateHotTaps,
  hotIndexAt,
  calcHotIndex,
  HOT_HOLD_MS,
  HOT_DECAY_MS,
  HOT_TOTAL_MS,
} from './hotIndex'

// 고정 기준 시각(2026-01-01 00:00:00 UTC). 테스트는 이 시각으로부터의 오프셋으로 탭을 만든다.
const BASE = new Date('2026-01-01T00:00:00.000Z').getTime()

// n명일 때 min분 시점에 눌린 HOT 탭 하나를 만든다 (value = 그 순간 참여자 수).
function tap(minutesFromBase: number, participantCount: number | null) {
  return { created_at: new Date(BASE + minutesFromBase * 60_000).toISOString(), value: participantCount }
}

// 기준 시각으로부터 min분 뒤의 실제 epoch (읽는 시점 지정용).
function at(minutesFromBase: number) {
  return BASE + minutesFromBase * 60_000
}

describe('탭당 증가율은 참여자 수에 반비례한다 (RULES.md §6)', () => {
  it('4명 기준 탭 1회는 정확히 2% 오른다', () => {
    expect(calcHotIndex([tap(0, 4)], at(0))).toBe(2)
  })

  it('1명일 때 탭 1회는 4% 오른다 (인원 적을수록 크게)', () => {
    expect(calcHotIndex([tap(0, 1)], at(0))).toBe(4)
  })

  it('16명일 때 탭 1회는 1% 오른다 (인원 많을수록 작게)', () => {
    expect(calcHotIndex([tap(0, 16)], at(0))).toBe(1)
  })

  it('참여자 수가 없으면(null) 1명으로 간주한다', () => {
    expect(calcHotIndex([tap(0, null)], at(0))).toBe(4)
  })
})

describe('감쇠(식음) 규칙 (RULES.md §6)', () => {
  // 1명 기준 탭 25회를 같은 순간에 눌러 값을 100까지 채운다 (4% * 25 = 100).
  const taps100 = Array.from({ length: 25 }, () => tap(0, 1))

  it('마지막 탭 이후 5분간은 값이 그대로 유지된다', () => {
    expect(calcHotIndex(taps100, at(0))).toBe(100)
    expect(calcHotIndex(taps100, at(5))).toBe(100) // 정확히 hold 경계 = 아직 100
  })

  it('감쇠 구간 중간(10분 시점 = 감쇠 5분 경과)에는 절반이 된다', () => {
    // hold 5분 + 감쇠 10분 중 5분 경과 → 50%
    expect(calcHotIndex(taps100, at(10))).toBe(50)
  })

  it('총 15분(hold 5 + 감쇠 10)이 지나면 0이 된다', () => {
    expect(calcHotIndex(taps100, at(15))).toBe(0)
    expect(calcHotIndex(taps100, at(20))).toBe(0) // 이후로도 계속 0
  })

  it('탭이 하나도 없으면 0이다', () => {
    expect(calcHotIndex([], at(0))).toBe(0)
  })
})

describe('식는 중 탭 1회는 100으로 튀지 않는다 (과거 회귀 버그, RULES.md §6)', () => {
  it('감쇠로 절반이 된 값에 탭 1회분만 더해진다', () => {
    // 1명 기준 탭 1회(4%) → 10분 뒤 감쇠로 2%로 식음 → 그 시점 다시 탭 1회
    const taps = [tap(0, 1), tap(10, 1)]
    // 2%(식은 값) + 4%(새 탭) = 6%. 100으로 튀지 않아야 한다.
    expect(calcHotIndex(taps, at(10))).toBe(6)
  })
})

describe('참여자 수 변동은 과거 탭 증가분을 바꾸지 않는다 (RULES.md §6)', () => {
  it('각 탭은 눌린 순간의 인원 수 기준으로만 계산된다', () => {
    // 4명일 때 탭(2%) + 1명일 때 탭(4%), 같은 순간 → 6%
    const taps = [tap(0, 4), tap(0, 1)]
    expect(calcHotIndex(taps, at(0))).toBe(6)
  })
})

describe('상한선', () => {
  it('아무리 많이 눌러도 100%를 넘지 않는다', () => {
    const taps = Array.from({ length: 200 }, () => tap(0, 1)) // 4% * 200 = 800이지만
    expect(calcHotIndex(taps, at(0))).toBe(100)
  })
})

describe('calcHotIndex는 지정 시점 이후의 탭을 제외한다 (결과 차트용)', () => {
  it('미래 탭은 계산에 포함하지 않는다', () => {
    const taps = [tap(0, 1), tap(100, 1)]
    // 0분 시점에서 보면 100분 탭은 아직 없으므로 첫 탭만 반영 = 4%
    expect(calcHotIndex(taps, at(0))).toBe(4)
  })
})

describe('simulateHotTaps / hotIndexAt 분리 (성능용 저장/조회 분리)', () => {
  it('탭 없으면 lastTapTime은 -Infinity, 값은 0', () => {
    const sim = simulateHotTaps([])
    expect(sim.value).toBe(0)
    expect(sim.lastTapTime).toBe(-Infinity)
    expect(hotIndexAt(sim, at(0))).toBe(0)
  })

  it('한 번 시뮬레이션한 결과로 여러 시점의 표시값을 O(1)로 구한다', () => {
    const sim = simulateHotTaps(Array.from({ length: 25 }, () => tap(0, 1))) // 값 100
    expect(hotIndexAt(sim, at(0))).toBe(100)
    expect(hotIndexAt(sim, at(10))).toBe(50)
    expect(hotIndexAt(sim, at(15))).toBe(0)
  })
})

describe('감쇠 상수 (RULES.md §6)', () => {
  it('hold 5분, 감쇠 10분, 총 15분', () => {
    expect(HOT_HOLD_MS).toBe(5 * 60 * 1000)
    expect(HOT_DECAY_MS).toBe(10 * 60 * 1000)
    expect(HOT_TOTAL_MS).toBe(15 * 60 * 1000)
  })
})
