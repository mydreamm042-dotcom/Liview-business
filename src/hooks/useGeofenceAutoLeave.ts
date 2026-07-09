'use client'

import { useEffect, useRef } from 'react'
import { distanceMeters } from '@/lib/geo'

// 입장 후 지속 위치 체크 (BUSINESS_RULES.md §2.3). 체크 주기는 ROADMAP_V2.md Phase 1.5
// "미확정" 항목 — 배터리/정확도 트레이드오프를 감안한 초기값이며 추후 조정 가능.
const CHECK_INTERVAL_MS = 20_000
// GPS 오차로 반경 경계 근처에서 순간적으로 튀는 것까지 바로 퇴장시키지 않기 위해,
// 연속으로 벗어난 것이 확인될 때만 실제 자동 나가기를 트리거한다.
const CONSECUTIVE_MISSES_TO_KICK = 2

export function useGeofenceAutoLeave(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  radiusM: number | null | undefined,
  onOutOfRange: () => void,
) {
  const onOutOfRangeRef = useRef(onOutOfRange)
  useEffect(() => { onOutOfRangeRef.current = onOutOfRange }, [onOutOfRange])

  const missesRef = useRef(0)

  useEffect(() => {
    missesRef.current = 0
    // 매장 위치가 등록 안 돼있으면 검사 자체를 건너뛴다 (BUSINESS_RULES.md §2.3, 입장 시 규칙과 동일)
    if (latitude == null || longitude == null || !radiusM) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) return

    const check = () => {
      navigator.geolocation.getCurrentPosition(
        pos => {
          const distance = distanceMeters(pos.coords.latitude, pos.coords.longitude, latitude, longitude)
          if (distance > radiusM) {
            missesRef.current += 1
            if (missesRef.current >= CONSECUTIVE_MISSES_TO_KICK) onOutOfRangeRef.current()
          } else {
            missesRef.current = 0
          }
        },
        () => {}, // 위치 조회 실패(일시적 오류/권한 철회)는 무시 — 이것만으로 강제 퇴장시키지 않는다
        { enableHighAccuracy: false, maximumAge: 10_000, timeout: 8_000 },
      )
    }

    check()
    const timer = setInterval(check, CHECK_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [latitude, longitude, radiusM])
}
