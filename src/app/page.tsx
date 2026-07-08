'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useKakaoMapSdk, useGeolocation } from '@/hooks/useKakaoMap'
import { DiscoverVenue } from '@/lib/supabase/types'

// 서울시청 기본 좌표 (위치 권한 거부/실패 시 폴백)
const FALLBACK_CENTER = { lat: 37.5665, lng: 126.978 }

export default function Home() {
  const router = useRouter()
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const { status: sdkStatus } = useKakaoMapSdk()
  const { position, status: geoStatus } = useGeolocation()
  const [venues, setVenues] = useState<DiscoverVenue[]>([])

  const center = position ?? (geoStatus !== 'loading' ? FALLBACK_CENTER : null)

  // 실시간 HOT 매장 목록을 가져와 지도 위 마커로 표시한다.
  // Discovery 무결성 규칙(BUSINESS_RULES.md §2.6): 이 응답에는 방 코드/QR이 없으므로
  // 지도에서도 노출할 수 없다 — 마커 클릭은 상세 탐색 화면(/discover)으로만 이동시킨다.
  useEffect(() => {
    if (!center) return
    fetch(`/api/discover/venues?lat=${center.lat}&lng=${center.lng}&radius_km=10`)
      .then(res => res.json())
      .then(data => setVenues(data.venues ?? []))
      .catch(() => setVenues([]))
  }, [center])

  useEffect(() => {
    if (sdkStatus !== 'ready' || !center || !mapContainerRef.current) return

    const kakao = window.kakao
    const map = new kakao.maps.Map(mapContainerRef.current, {
      center: new kakao.maps.LatLng(center.lat, center.lng),
      level: 5,
    })

    // 카카오맵은 생성 시점에 컨테이너의 실제 픽셀 크기를 읽는데, flex 레이아웃에서
    // 부모 높이가 min-height로만 결정되는 경우 그 크기를 0으로 읽어 지도가 비어
    // 보이는 문제가 흔하다. relayout으로 강제로 다시 크기를 재보고 중심을 재설정한다.
    kakao.maps.event.trigger(map, 'resize')
    map.setCenter(new kakao.maps.LatLng(center.lat, center.lng))

    venues.forEach(v => {
      const marker = new kakao.maps.Marker({
        position: new kakao.maps.LatLng(v.latitude, v.longitude),
        map,
      })
      kakao.maps.event.addListener(marker, 'click', () => {
        router.push(`/discover?venue=${v.id}`)
      })
    })
  }, [sdkStatus, center, venues, router])

  return (
    <main className="flex flex-col" style={{ height: '100dvh', position: 'relative' }}>
      {/* 지도 영역 */}
      <div style={{ flex: 1, position: 'relative', background: 'var(--card2)' }}>
        {sdkStatus === 'error' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, padding: 24, textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: 'var(--muted2)' }}>지도를 불러올 수 없습니다</p>
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>잠시 후 다시 시도해주세요</p>
          </div>
        )}
        {geoStatus === 'denied' && (
          <div style={{ position: 'absolute', top: 16, left: 16, right: 16, zIndex: 10, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px' }}>
            <p style={{ fontSize: 12, color: 'var(--muted2)' }}>위치 권한이 없어 서울 중심으로 표시됩니다</p>
          </div>
        )}
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
      </div>

      {/* 하단 액션 바 */}
      <div style={{
        padding: '20px 20px 32px',
        background: 'var(--bg)',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 4 }}>
          <p style={{ fontSize: 20, fontWeight: 800 }}>👁️ Liview</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => router.push('/join')}>
            🔗 입장하기
          </button>
          <button className="btn btn-secondary" onClick={() => router.push('/discover')}>
            🔥 실시간 핫한 가게
          </button>
        </div>
        <button className="btn btn-primary" onClick={() => router.push('/create')}>
          🍻 방 만들기
        </button>
      </div>
    </main>
  )
}
