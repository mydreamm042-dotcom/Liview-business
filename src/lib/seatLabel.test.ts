import { describe, it, expect } from 'vitest'
import { nextDuplicateLabel } from './seatLabel'

describe('nextDuplicateLabel', () => {
  it('끝의 숫자를 1 올린다', () => {
    expect(nextDuplicateLabel('5', ['5'])).toBe('6')
    expect(nextDuplicateLabel('A1', ['A1'])).toBe('A2')
  })

  it('이미 쓰인 라벨은 건너뛴다', () => {
    expect(nextDuplicateLabel('1', ['1', '2', '3'])).toBe('4')
    expect(nextDuplicateLabel('A1', ['A1', 'A2'])).toBe('A3')
  })

  it('자리수를 맞춰둔 라벨은 그 모양을 유지한다', () => {
    expect(nextDuplicateLabel('01', ['01'])).toBe('02')
    expect(nextDuplicateLabel('창가-009', ['창가-009'])).toBe('창가-010')
  })

  it('끝에 숫자가 없으면 " 2"부터 붙인다', () => {
    expect(nextDuplicateLabel('창가', ['창가'])).toBe('창가 2')
    expect(nextDuplicateLabel('창가', ['창가', '창가 2'])).toBe('창가 3')
  })

  it('원본과 무관한 라벨이 이미 있어도 영향받지 않는다', () => {
    expect(nextDuplicateLabel('3', ['3', '99', 'B7'])).toBe('4')
  })
})
