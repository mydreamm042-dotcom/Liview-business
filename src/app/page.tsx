'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useKakaoMapSdk, useGeolocation, KakaoMapInstance } from '@/hooks/useKakaoMap'
import { DiscoverVenue, RegionalRankings } from '@/lib/supabase/types'
import VenueDetailSheet from '@/components/VenueDetailSheet'
import DraggableBottomSheet from '@/components/DraggableBottomSheet'
import RegionRanking from '@/components/RegionRanking'
import PlaceSearchBar from '@/components/PlaceSearchBar'
import MapBottomTabBar, { MapTab } from '@/components/MapBottomTabBar'

// 서울시청 기본 좌표 (위치 권한 거부/실패 시 폴백)
const FALLBACK_CENTER = { lat: 37.5665, lng: 126.978 }
const TABBAR_H = 66
const PEEK_H = 220 // 지역 랭킹 바텀시트의 peek(기본) 높이 — 현위치 버튼을 이 위로 띄운다
const EMPTY_RANKINGS: RegionalRankings = { hot: [], star: [], heart: [] }

export default function Home() {
  const router = useRouter()
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<KakaoMapInstance | null>(null)
  const { status: sdkStatus } = useKakaoMapSdk()
  const { position, status: geoStatus, locate } = useGeolocation()
  const [venues, setVenues] = useState<DiscoverVenue[]>([])
  const [rankings, setRankings] = useState<RegionalRankings>(EMPTY_RANKINGS)
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null)
  const [sheetSnap, setSheetSnap] = useState(0) // 0=peek, 1=full
  const [activeTab, setActiveTab] = useState<MapTab>('explore')
  const [moreOpen, setMoreOpen] = useState(false)
  // 시트 최대 높이는 뷰포트 높이에 맞춘다. SSR/hydration 불일치를 피하려고 마운트 후 상태로 잡는다.
  const [viewportH, setViewportH] = useState(720)

  useEffect(() => {
    const update = () => setViewportH(window.innerHeight)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const center = position ?? (geoStatus !== 'loading' ? FALLBACK_CENTER : null)

  // 실시간 HOT 매장 목록 + 지역 랭킹을 함께 폴링한다 (같은 위치 기준, 같은 3초 주기라 한 번에).
  useEffect(() => {
    if (!center) return
    const fetchData = () => {
      const q = `lat=${center.lat}&lng=${center.lng}&radius_km=10`
      fetch(`/api/discover/venues?${q}`)
        .then(res => res.json())
        .then(data => setVenues(data.venues ?? []))
        .catch(() => setVenues([]))
      fetch(`/api/discover/rankings?${q}`)
        .then(res => res.json())
        .then(data => setRankings({ hot: data.hot ?? [], star: data.star ?? [], heart: data.heart ?? [] }))
        .catch(() => setRankings(EMPTY_RANKINGS))
    }
    fetchData()
    const interval = setInterval(fetchData, 3000)
    return () => clearInterval(interval)
  }, [center])

  const selectedVenue = venues.find(v => v.id === selectedVenueId) ?? null
  const selectedDistanceKm = selectedVenue?.distance_km ?? null

  // 지도 생성 — SDK 준비되는 즉시 폴백 좌표로 만든다 (위치 권한이 늦어도 지도는 뜨게).
  useEffect(() => {
    if (sdkStatus !== 'ready' || !mapContainerRef.current || mapRef.current) return
    const kakao = window.kakao
    const map = new kakao.maps.Map(mapContainerRef.current, {
      center: new kakao.maps.LatLng(FALLBACK_CENTER.lat, FALLBACK_CENTER.lng),
      level: 5,
    })
    mapRef.current = map
    kakao.maps.event.trigger(map, 'resize')
  }, [sdkStatus])

  // 실제 위치가 확정되면 지도를 그쪽으로 재중심
  useEffect(() => {
    if (!mapRef.current || !center) return
    mapRef.current.setCenter(new window.kakao.maps.LatLng(center.lat, center.lng))
  }, [center])

  // 매장 마커 — 목록 갱신마다 다시 그린다 (이전 마커는 반드시 제거).
  useEffect(() => {
    if (!mapRef.current) return
    const kakao = window.kakao
    const map = mapRef.current
    const markers = venues.map(v => {
      const marker = new kakao.maps.Marker({
        position: new kakao.maps.LatLng(v.latitude, v.longitude),
        map,
      })
      kakao.maps.event.addListener(marker, 'click', () => setSelectedVenueId(v.id))
      return marker
    })
    return () => { markers.forEach(m => m.setMap(null)) }
  }, [venues])

  const handleSearchPick = useCallback((place: { name: string; lat: number; lng: number }) => {
    if (mapRef.current) {
      mapRef.current.setCenter(new window.kakao.maps.LatLng(place.lat, place.lng))
    }
  }, [])

  const handleTab = (tab: MapTab) => {
    setActiveTab(tab)
    setMoreOpen(false)
    if (tab === 'explore') setSheetSnap(0)
    else if (tab === 'hot') setSheetSnap(1)
    else if (tab === 'enter') { /* 입장은 매장 QR로만 — 안내만 */ setMoreOpen(false) }
    else if (tab === 'more') setMoreOpen(true)
  }

  return (
    <main style={{ height: '100dvh', position: 'relative', overflow: 'hidden' }}>
      {/* 지도 */}
      <div style={{ position: 'absolute', inset: 0, background: 'var(--card2)' }}>
        {sdkStatus === 'error' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, padding: 24, textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: 'var(--muted2)' }}>지도를 불러올 수 없습니다</p>
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>잠시 후 다시 시도해주세요</p>
          </div>
        )}
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

        {/* 현재 위치로 이동 — peek 바텀시트에 가리지 않도록 시트 상단 바로 위에 띄운다.
            디자인의 검은 원 + 빨간 내비게이션 화살표 스타일. 상세 시트가 열려있을 땐 숨긴다. */}
        {!selectedVenueId && (
          <button onClick={locate} disabled={geoStatus === 'loading'} aria-label="현재 위치로 이동"
            style={{
              position: 'absolute', right: 16, bottom: TABBAR_H + PEEK_H + 14, zIndex: 24, width: 46, height: 46,
              borderRadius: 999, background: '#000', border: '1px solid var(--border)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              opacity: geoStatus === 'loading' ? 0.5 : 1, boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
            }}>
            {geoStatus === 'loading' ? (
              <span style={{ fontSize: 18 }}>⏳</span>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ transform: 'rotate(0deg)' }}>
                <path d="M21 3L3 10.5l7.2 2.3L12.5 20 21 3z" fill="var(--accent)" />
              </svg>
            )}
          </button>
        )}
      </div>

      {/* 장소 검색바 */}
      <PlaceSearchBar sdkReady={sdkStatus === 'ready'} center={center} onPick={handleSearchPick} />

      {geoStatus === 'denied' && (
        <div style={{ position: 'absolute', top: 78, left: 16, right: 16, zIndex: 24, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '8px 14px' }}>
          <p style={{ fontSize: 12, color: 'var(--muted2)' }}>위치 권한이 없어 서울 중심으로 표시됩니다</p>
        </div>
      )}

      {/* 매장 상세 — 마커/랭킹/검색에서 선택 시 (지도 위 전체 덮는 시트) */}
      {selectedVenueId && (
        <VenueDetailSheet venueId={selectedVenueId} distanceKm={selectedDistanceKm} onClose={() => setSelectedVenueId(null)} />
      )}

      {/* 지역 랭킹 드래그 바텀시트 (상세가 닫혀있을 때만) */}
      {!selectedVenueId && (
        <DraggableBottomSheet
          snapPoints={[PEEK_H, viewportH - 80]}
          snapIndex={sheetSnap}
          onSnapChange={setSheetSnap}
          bottomOffset={TABBAR_H}
          header={
            <div style={{ paddingBottom: 12 }}>
              <p style={{ fontSize: 18, fontWeight: 800 }}>🔥 지금 핫한 가게</p>
            </div>
          }
        >
          <RegionRanking rankings={rankings} regionLabel="내 주변" onSelectVenue={id => setSelectedVenueId(id)} />
        </DraggableBottomSheet>
      )}

      {/* 하단 탭바 */}
      <MapBottomTabBar active={activeTab} onSelect={handleTab} />

      {/* 더보기 메뉴 */}
      {moreOpen && (
        <div onClick={() => setMoreOpen(false)}
          style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: '100%', background: 'var(--bg)', borderRadius: '20px 20px 0 0', padding: '20px 20px 32px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ width: 40, height: 4, borderRadius: 999, background: 'var(--muted)', margin: '0 auto 12px' }} />
            <button className="btn btn-secondary" onClick={() => router.push('/discover')}>📋 전체 목록 보기</button>
            <button className="btn btn-ghost" onClick={() => router.push('/create')} style={{ fontSize: 14 }}>🏪 사장님이신가요? 매장 관리</button>
          </div>
        </div>
      )}

      {/* 입장 안내 */}
      {activeTab === 'enter' && !moreOpen && !selectedVenueId && (
        <div onClick={() => setActiveTab('explore')}
          style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} className="card animate-fade-in" style={{ padding: 28, textAlign: 'center', maxWidth: 320 }}>
            <p style={{ fontSize: 32, marginBottom: 8 }}>🚪</p>
            <p style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>매장 QR로 입장해요</p>
            <p style={{ fontSize: 13, color: 'var(--muted2)', lineHeight: 1.6 }}>
              LIview는 실제 방문 후 매장에 비치된 QR을 스캔해야 입장할 수 있어요. 원격 참여는 지원하지 않아요.
            </p>
            <button className="btn btn-primary" onClick={() => setActiveTab('explore')} style={{ marginTop: 20 }}>알겠어요</button>
          </div>
        </div>
      )}
    </main>
  )
}
