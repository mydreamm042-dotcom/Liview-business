import { describe, it, expect } from 'vitest'
import { distanceMeters } from './geo'

describe('distanceMeters', () => {
  it('같은 좌표는 거리 0', () => {
    expect(distanceMeters(37.5665, 126.978, 37.5665, 126.978)).toBeCloseTo(0, 3)
  })

  it('서울시청과 강남역 사이 거리는 대략 8~9km', () => {
    // 서울시청 37.5665,126.9780 / 강남역 37.4979,127.0276
    const d = distanceMeters(37.5665, 126.978, 37.4979, 127.0276)
    expect(d).toBeGreaterThan(7000)
    expect(d).toBeLessThan(10000)
  })

  it('아주 가까운 두 좌표(약 50m 이내)는 작은 값을 반환한다', () => {
    // 위도 0.0005도 차이 ≈ 55m
    const d = distanceMeters(37.5665, 126.978, 37.5670, 126.978)
    expect(d).toBeGreaterThan(40)
    expect(d).toBeLessThan(70)
  })
})
