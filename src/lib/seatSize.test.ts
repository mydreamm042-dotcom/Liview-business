import { describe, it, expect } from 'vitest'
import { VenueLayoutItem } from '@/lib/supabase/types'
import { seatSizePx, SEAT_FALLBACK_PCT, SEAT_MIN_PCT, SEAT_MAX_PCT, SEAT_TO_BOX_RATIO } from './seatSize'

function box(width: number, height: number, kind: VenueLayoutItem['kind'] = 'box'): VenueLayoutItem {
  return {
    id: Math.random().toString(36), venue_id: 'v1', kind, label: null,
    position_x: 50, position_y: 50, width, height, rotation: 0, sort_order: 0, created_at: '',
  }
}

const W = 400
const H = 400

describe('seatSizePx — 좌석 크기는 box 평균에 비례한 파생값 (ADR-0008)', () => {
  it('네모가 없으면 기본값(캔버스 너비의 8%)', () => {
    expect(seatSizePx([], W, H)).toBe((W * SEAT_FALLBACK_PCT) / 100)
  })

  it('네모 외 종류만 있으면 기본값 — 비례 대상은 box뿐', () => {
    expect(seatSizePx([box(40, 40, 'door'), box(40, 40, 'text')], W, H)).toBe((W * SEAT_FALLBACK_PCT) / 100)
  })

  it('네모 평균의 짧은 변에 비례한다', () => {
    // 평균 20×10% → px로 80×40 → 짧은 변 40 → ×0.4 = 16
    const size = seatSizePx([box(10, 8), box(30, 12)], W, H)
    expect(size).toBeCloseTo(40 * SEAT_TO_BOX_RATIO)
  })

  it('네모가 커지면 좌석도 커진다 (실시간 fit의 핵심)', () => {
    const small = seatSizePx([box(10, 10)], W, H)
    const large = seatSizePx([box(20, 20)], W, H)
    expect(large).toBeGreaterThan(small)
  })

  it('캔버스가 가로로 길어도 세로 비율을 px로 환산해 비교한다', () => {
    // height 20%가 세로 200px에서는 40px — width 20%(=160px)보다 짧으므로 이쪽이 기준
    const size = seatSizePx([box(20, 20)], 800, 200)
    expect(size).toBeCloseTo(40 * SEAT_TO_BOX_RATIO)
  })

  it('네모가 아주 작아도 누를 수 있는 최소 크기는 지킨다', () => {
    expect(seatSizePx([box(0.5, 0.5)], W, H)).toBe((W * SEAT_MIN_PCT) / 100)
  })

  it('네모가 아주 커도 배치도를 덮지 않게 최대 크기를 넘지 않는다', () => {
    expect(seatSizePx([box(100, 100)], W, H)).toBe((W * SEAT_MAX_PCT) / 100)
  })

  it('캔버스 크기를 아직 못 잰 시점엔 0을 준다 (렌더 전 깜빡임 방지)', () => {
    expect(seatSizePx([box(20, 20)], 0, 0)).toBe(0)
  })
})
