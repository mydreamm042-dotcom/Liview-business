import { describe, it, expect } from 'vitest'
import { WARNING_COOLDOWN_MS, STAR_COOLDOWN_MS, formatCooldown } from './cooldown'

// RULES.md §4, §5 — 쿨타임 규칙이 문서에 적힌 값과 실제로 일치하는지 검증한다.
describe('쿨타임 상수 (RULES.md §4, §5)', () => {
  it('자제 시그널 쿨타임은 정확히 5분이다', () => {
    expect(WARNING_COOLDOWN_MS).toBe(5 * 60 * 1000)
  })

  it('별점 쿨타임은 정확히 30분이다', () => {
    expect(STAR_COOLDOWN_MS).toBe(30 * 60 * 1000)
  })
})

describe('formatCooldown — 남은 시간 표시 형식', () => {
  it('정확히 5분이면 5:00으로 표시한다', () => {
    expect(formatCooldown(5 * 60 * 1000)).toBe('5:00')
  })

  it('1분 5초는 1:05로 표시한다', () => {
    expect(formatCooldown(65 * 1000)).toBe('1:05')
  })

  it('59초는 0:59로 표시한다', () => {
    expect(formatCooldown(59 * 1000)).toBe('0:59')
  })

  it('0이면 0:00으로 표시한다', () => {
    expect(formatCooldown(0)).toBe('0:00')
  })

  it('음수(이미 지난 시간)는 0:00으로 표시한다', () => {
    expect(formatCooldown(-5000)).toBe('0:00')
  })

  it('남은 밀리초는 올림 처리한다 (64.5초 → 1:05)', () => {
    expect(formatCooldown(64_500)).toBe('1:05')
  })
})
