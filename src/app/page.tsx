'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useKakaoMapSdk, useGeolocation, KakaoMapInstance } from '@/hooks/useKakaoMap'
import { DiscoverVenue } from '@/lib/supabase/types'
import VenueBottomSheet from '@/components/VenueBottomSheet'

// 서울시청 기본 좌표 (위치 권한 거부/실패 시 폴백)
const FALLBACK_CENTER = { lat: 37.5665, lng: 126.978 }

export default function Home() {
  const router = useRouter()
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<KakaoMapInstance | null>(null)
  const { status: sdkStatus } = useKakaoMapSdk()
  const { position, status: geoStatus, locate } = useGeolocation()
  const [venues, setVenues] = useState<DiscoverVenue[]>([])
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null)

  const center = position ?? (geoStatus !== 'loading' ? FALLBACK_CENTER : null)

  // 실시간 HOT 매장 목록을 가져와 지도 위 마커로 표시한다. 마커를 탭하면 페이지 이동 대신
  // 지도 위 바텀시트로 상세를 보여준다 (BUSINESS_RULES.md §2.7 "지도 마커 상세").
  // Discovery 무결성 규칙(§2.6)은 그대로 유지: 이 응답엔 방 코드/QR이 없고, 바텀시트의
  // "입장하기"도 /v/[id]로 이동만 시킬 뿐 실제 검증은 그 화면이 그대로 담당한다.
  useEffect(() => {
    if (!center) return
    const fetchVenues = () => {
      fetch(`/api/discover/venues?lat=${center.lat}&lng=${center.lng}&radius_km=10`)
        .then(res => res.json())
        .then(data => setVenues(data.venues ?? []))
        .catch(() => setVenues([]))
    }
    fetchVenues()
    const interval = setInterval(fetchVenues, 3000)
    return () => clearInterval(interval)
  }, [center])

  const selectedVenue = venues.find(v => v.id === selectedVenueId) ?? null

  // 지도 생성은 위치(geolocation) 확정 여부와 무관하게, SDK가 준비되는 즉시 실행한다.
  // 이전에는 center가 나올 때까지 지도 자체를 안 만들었는데, 위치 권한 처리가 늦어지거나
  // 막히면 지도가 영원히 안 뜨는 문제가 있었다 — 일단 폴백 좌표로 만들고 나중에 재중심.
  useEffect(() => {
    if (sdkStatus !== 'ready' || !mapContainerRef.current || mapRef.current) return

    const kakao = window.kakao
    const map = new kakao.maps.Map(mapContainerRef.current, {
      center: new kakao.maps.LatLng(FALLBACK_CENTER.lat, FALLBACK_CENTER.lng),
      level: 5,
    })
    mapRef.current = map

    // 카카오맵은 생성 시점에 컨테이너의 실제 픽셀 크기를 읽는데, flex 레이아웃에서
    // 부모 높이가 min-height로만 결정되는 경우 그 크기를 0으로 읽어 지도가 비어
    // 보이는 문제가 흔하다. relayout으로 강제로 다시 크기를 재본다.
    kakao.maps.event.trigger(map, 'resize')
  }, [sdkStatus])

  // 실제 위치가 확정되면 지도를 그쪽으로 재중심한다 (지도 생성과는 별개 시점).
  useEffect(() => {
    if (!mapRef.current || !center) return
    mapRef.current.setCenter(new window.kakao.maps.LatLng(center.lat, center.lng))
  }, [center])

  // 매장 마커는 목록이 갱신될 때마다 다시 그린다. venues는 이제 3초마다 폴링되므로,
  // 새로 그리기 전에 이전 마커를 반드시 지도에서 떼어내야 한다 (안 지우면 폴링마다 계속 쌓임).
  useEffect(() => {
    if (!mapRef.current) return
    const kakao = window.kakao
    const map = mapRef.current
    const markers = venues.map(v => {
      const marker = new kakao.maps.Marker({
        position: new kakao.maps.LatLng(v.latitude, v.longitude),
        map,
      })
      kakao.maps.event.addListener(marker, 'click', () => {
        setSelectedVenueId(v.id)
      })
      return marker
    })
    return () => { markers.forEach(m => m.setMap(null)) }
  }, [venues])

  return (
    // flex:1로 "남는 공간 채우기"를 계산하게 하면 브라우저/레이아웃에 따라 지도
    // 컨테이너가 0 높이로 잡히는 문제가 반복적으로 발생했다. position:absolute로
    // main 전체를 무조건 채우도록 바꿔 flex 계산 자체를 제거한다 — 버튼 바는 그 위에
    // 겹쳐서 얹는다 (지도 앱들의 표준적인 오버레이 레이아웃 패턴).
    <main style={{ height: '100dvh', position: 'relative', overflow: 'hidden' }}>
      {/* 지도 영역 — main 전체를 절대 위치로 채운다 */}
      <div style={{ position: 'absolute', inset: 0, background: 'var(--card2)' }}>
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

        {/* 현재 위치로 이동 — 카카오맵 자체 UI처럼 지도 위에 떠 있는 버튼.
            하단 액션 바에 가리지 않도록 그 위쪽에 배치한다 (액션 바 높이만큼 여백). */}
        <button
          onClick={locate}
          disabled={geoStatus === 'loading'}
          aria-label="현재 위치로 이동"
          style={{
            position: 'absolute',
            right: 16,
            bottom: 210,
            zIndex: 20,
            width: 44,
            height: 44,
            borderRadius: 999,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            cursor: 'pointer',
            opacity: geoStatus === 'loading' ? 0.5 : 1,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
        >
          {geoStatus === 'loading' ? '⏳' : '🎯'}
        </button>
      </div>

      {/* 매장 마커를 탭하면 하단 액션 바 대신 바텀시트를 보여준다 */}
      {selectedVenue ? (
        <VenueBottomSheet venue={selectedVenue} onClose={() => setSelectedVenueId(null)} />
      ) : (
        <div style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 20,
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
          <button className="btn btn-primary" onClick={() => router.push('/discover')}>
            🔥 실시간 핫한 가게
          </button>
          <button className="btn btn-ghost" onClick={() => router.push('/create')} style={{ fontSize: 13 }}>
            🏪 사장님이신가요? 매장 관리
          </button>
        </div>
      )}
    </main>
  )
}
