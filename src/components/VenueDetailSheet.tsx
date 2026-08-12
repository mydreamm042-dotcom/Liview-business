'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Participant, VenuePublicDetail, VenueCategory } from '@/lib/supabase/types'
import TrendLine from '@/components/TrendLine'
import SeatMap from '@/components/SeatMap'

const CATEGORY_LABELS: Record<string, string> = {
  pocha: '포차', bar: '바', pub: '펍', wine_bar: '와인바', cafe: '카페', event_hall: '행사장', etc: '기타',
}

interface LiveMessage {
  sender_nickname: string
  content: string
  created_at: string
}

type Tab = 'hot' | 'star' | 'chat' | 'seat'

const TABS: { key: Tab; label: string }[] = [
  { key: 'hot', label: 'HOT' },
  { key: 'star', label: '실시간 별점' },
  { key: 'chat', label: '매장 채팅' },
  { key: 'seat', label: '좌석' },
]

// 매장 상세 바텀시트 (Discovery 도메인, BUSINESS_RULES.md §2.7 "매장 상세 화면 v4"). 지도 마커/
// 지역 랭킹/장소 검색 어느 경로로 들어와도 이 화면으로 수렴한다. 비참여자도 오픈 후 지금까지의
// HOT/만족도/채팅/좌석을 읽기 전용으로 본다. 미구독 매장은 각 탭이 안내로 대체된다(구독 게이트).
export default function VenueDetailSheet({ venueId, distanceKm, onClose }: {
  venueId: string
  distanceKm: number | null
  onClose: () => void
}) {
  const router = useRouter()
  const [detail, setDetail] = useState<VenuePublicDetail | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [tab, setTab] = useState<Tab>('hot')
  const [chat, setChat] = useState<LiveMessage[]>([])

  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetch(`/api/venues/${venueId}/public`)
        .then(res => {
          if (res.status === 404) { setNotFound(true); return null }
          return res.ok ? res.json() : null
        })
        .then(data => { if (!cancelled && data) setDetail(data) })
        .catch(() => {})
    }
    load()
    // 실시간 공개 데이터라 열려있는 동안 3초마다 갱신 (Discovery 3초 폴링 패턴과 동일)
    const interval = setInterval(load, 3000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [venueId])

  useEffect(() => {
    if (tab !== 'chat' || !detail?.venue.public_chat_enabled) return
    const load = () => {
      fetch(`/api/venue/${venueId}/live-chat`)
        .then(res => res.ok ? res.json() : { messages: [] })
        .then(data => setChat(data.messages ?? []))
        .catch(() => {})
    }
    load()
    const interval = setInterval(load, 3000)
    return () => clearInterval(interval)
  }, [tab, detail?.venue.public_chat_enabled, venueId])

  const venue = detail?.venue
  const subscribed = venue?.subscription_status === 'active'
  const withinRadius = distanceKm !== null && venue ? Math.round(distanceKm * 1000) <= venue.geofence_radius_m : false
  const directionsUrl = venue && venue.latitude && venue.longitude
    ? `https://map.kakao.com/link/to/${encodeURIComponent(venue.name)},${venue.latitude},${venue.longitude}`
    : null

  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 0, top: 40, zIndex: 45,
      background: 'var(--bg)', borderRadius: '20px 20px 0 0', border: '1px solid var(--border)', borderBottom: 'none',
      boxShadow: '0 -12px 40px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }} className="animate-slide-up">
      {/* 핸들 + 닫기 */}
      <div style={{ padding: '10px 20px 0', flexShrink: 0 }}>
        <div style={{ width: 40, height: 4, borderRadius: 999, background: 'var(--muted)', margin: '0 auto 4px' }} />
      </div>

      {notFound ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
          <p style={{ fontSize: 15, color: 'var(--muted2)' }}>매장을 찾을 수 없어요</p>
          <button className="btn btn-secondary" onClick={onClose} style={{ maxWidth: 160 }}>닫기</button>
        </div>
      ) : !venue ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ fontSize: 13, color: 'var(--muted2)' }}>불러오는 중...</p>
        </div>
      ) : (
        <>
          {/* 헤더 */}
          <div style={{ padding: '8px 20px 16px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <p style={{ fontSize: 24, fontWeight: 800 }}>{venue.name}</p>
                  {detail.is_open && (
                    <>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>🔥 {Math.round(detail.hot_score * 100)}%</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)' }}>⭐ {detail.satisfaction || '-'}</span>
                    </>
                  )}
                </div>
                <p style={{ fontSize: 13, color: 'var(--muted2)', marginTop: 4 }}>
                  {CATEGORY_LABELS[venue.category ?? ''] ?? venue.category}
                  {distanceKm !== null && ` · ${distanceKm.toFixed(1)}km`}
                  {' · '}
                  <span style={{ color: detail.is_open ? '#22c55e' : 'var(--muted)' }}>
                    {detail.is_open ? '영업 중' : '영업 종료'}
                  </span>
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                {subscribed && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--accent)' }} />
                    <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>LIview</span>
                  </span>
                )}
                <button onClick={onClose} aria-label="닫기"
                  style={{ width: 30, height: 30, borderRadius: 999, background: 'var(--card2)', border: '1px solid var(--border)', color: 'var(--muted2)', cursor: 'pointer' }}>✕</button>
              </div>
            </div>
          </div>

          {/* 탭 */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{
                  flex: 1, padding: '12px 0', background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 14, fontWeight: 700, color: tab === t.key ? 'var(--accent)' : 'var(--muted2)',
                  borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
                }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* 본문 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
            {!subscribed ? (
              <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>구독하지 않은 매장이에요</p>
                <p style={{ fontSize: 13, color: 'var(--muted2)' }}>실시간 HOT·별점·채팅·좌석은 LIview 구독 매장에서만 볼 수 있어요</p>
              </div>
            ) : !detail.is_open ? (
              <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>지금은 영업 중이 아니에요</p>
                <p style={{ fontSize: 13, color: 'var(--muted2)' }}>영업이 시작되면 실시간 데이터가 표시돼요</p>
              </div>
            ) : (
              <>
                {tab === 'hot' && <HotTab detail={detail} />}
                {tab === 'star' && <StarTab detail={detail} />}
                {tab === 'chat' && <ChatTab enabled={venue.public_chat_enabled} messages={chat} />}
                {tab === 'seat' && <SeatTab detail={detail} />}
              </>
            )}
          </div>

          {/* 하단 액션 */}
          <div style={{ padding: '12px 20px max(20px, env(safe-area-inset-bottom))', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            {!withinRadius && distanceKm !== null && (
              <p style={{ fontSize: 12, color: 'var(--accent2)', marginBottom: 10, textAlign: 'center' }}>
                매장에서 {Math.round(distanceKm * 1000)}m 떨어져 있어요 — 가까이 가면 입장할 수 있어요
              </p>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button className="btn btn-secondary" disabled={!directionsUrl}
                onClick={() => directionsUrl && window.open(directionsUrl, '_blank', 'noopener,noreferrer')}>
                🧭 길찾기
              </button>
              <button className="btn btn-primary" onClick={() => router.push(`/v/${venueId}`)} disabled={!withinRadius}
                style={{ opacity: withinRadius ? 1 : 0.4 }}>
                🚪 입장하기
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function HotTab({ detail }: { detail: VenuePublicDetail }) {
  const points = detail.hot_timeline.map(b => ({
    date: b.t,
    value: b.count,
  }))
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 40, fontWeight: 800, color: 'var(--accent)' }}>{Math.round(detail.hot_score * 100)}</span>
        <span style={{ fontSize: 15, color: 'var(--muted2)' }}>지금 HOT 지수</span>
      </div>
      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted2)', marginBottom: 8 }}>오픈 후 HOT 추이 (10분 단위 탭 수)</p>
      <TrendLine data={points} color="#e10600" formatValue={v => `${v}`} formatDate={fmtTime} emptyLabel="아직 HOT 반응이 없어요" />
    </div>
  )
}

function StarTab({ detail }: { detail: VenuePublicDetail }) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 20px' }}>
      <div style={{ fontSize: 48, fontWeight: 800, color: 'var(--text)' }}>
        {detail.satisfaction ? detail.satisfaction.toFixed(1) : '-'}
        <span style={{ fontSize: 24, color: 'var(--muted2)' }}> / 5</span>
      </div>
      <p style={{ fontSize: 14, color: 'var(--muted2)', marginTop: 8 }}>현재 손님들의 실시간 평균 만족도</p>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>손님은 30분마다 별점을 남길 수 있어요</p>
    </div>
  )
}

function ChatTab({ enabled, messages }: { enabled: boolean; messages: LiveMessage[] }) {
  if (!enabled) {
    return <p style={{ fontSize: 13, color: 'var(--muted2)', textAlign: 'center', padding: '32px 20px' }}>이 매장은 채팅을 공개하지 않아요</p>
  }
  if (messages.length === 0) {
    return <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '32px 20px' }}>아직 채팅이 없어요</p>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {messages.slice().reverse().map((m, i) => (
        <p key={i} style={{ fontSize: 13, color: 'var(--text2)' }}>
          <span style={{ fontWeight: 700, color: 'var(--muted2)' }}>{m.sender_nickname}</span> {m.content}
        </p>
      ))}
    </div>
  )
}

const SEAT_CANVAS_HEIGHT = 260

// 좌석 탭 — 실제 자리배치도를 그대로 보여준다 (§2.7, 2026-08-12 ADR-0008로 집계 숫자에서 승격).
// 비참여자용 읽기 전용 뷰라 좌석을 누를 수 없고(onSeatClick 없음), 확대/이동·미니맵만 손님
// 화면과 동일하게 동작한다.
function SeatTab({ detail }: { detail: VenuePublicDetail }) {
  const { seats, layout_items: layoutItems, participant_count: participantCount } = detail

  // SeatMap은 "참여자 배열의 seat_id"로 점유를 판단하지만, 이 공개 화면은 참여자 정보를
  // 받지 않는다(개인식별 정보 비노출, §2.6). 서버가 준 occupied 플래그만 가지고 익명 점유자를
  // 만들어 넘겨서, 어떤 자리가 찼는지만 손님 화면과 똑같은 명암으로 보이게 한다.
  const anonymousOccupants: Participant[] = useMemo(
    () => seats.filter(s => s.occupied).map(s => ({
      id: `occupied-${s.id}`,
      room_id: '',
      nickname: '',
      session_token: '',
      joined_at: '',
      left_at: null,
      seat_id: s.id,
    })),
    [seats],
  )

  if (seats.length === 0) {
    return <p style={{ fontSize: 13, color: 'var(--muted2)', textAlign: 'center', padding: '32px 20px' }}>등록된 좌석이 없어요</p>
  }

  const occupied = seats.filter(s => s.occupied).length
  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
        <div><span style={{ fontSize: 24, fontWeight: 800 }}>{occupied}</span><span style={{ fontSize: 13, color: 'var(--muted2)' }}> / {seats.length} 좌석 사용 중</span></div>
        <div><span style={{ fontSize: 24, fontWeight: 800 }}>{participantCount}</span><span style={{ fontSize: 13, color: 'var(--muted2)' }}>명 참여 중</span></div>
      </div>
      <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)' }}>
        <SeatMap
          seats={seats}
          participants={anonymousOccupants}
          hotReactions={[]}
          now={Date.now()}
          height={SEAT_CANVAS_HEIGHT}
          layoutItems={layoutItems}
        />
      </div>
      <p style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', marginTop: 8 }}>
        어두운 자리는 사용 중이에요 · 두 손가락으로 확대할 수 있어요
      </p>
    </div>
  )
}
