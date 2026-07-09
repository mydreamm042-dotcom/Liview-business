'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DiscoverVenue } from '@/lib/supabase/types'

interface LiveMessage {
  sender_nickname: string
  content: string
  created_at: string
}

const CATEGORY_LABELS: Record<string, string> = {
  pocha: '포차', bar: '바', pub: '펍', wine_bar: '와인바', cafe: '카페', event_hall: '행사장', etc: '기타',
}

// 홈 지도의 마커 탭 상세 (BUSINESS_RULES.md §2.7 "지도 마커 상세"). 입장하기는 /v/[id]로
// 이동만 시킬 뿐 — 실제 비밀번호/반경 검증은 그 화면의 기존 join 로직이 그대로 담당한다.
export default function VenueBottomSheet({ venue, onClose }: { venue: DiscoverVenue; onClose: () => void }) {
  const router = useRouter()
  const [liveMessages, setLiveMessages] = useState<LiveMessage[]>([])

  useEffect(() => {
    if (!venue.public_chat_enabled) { setLiveMessages([]); return }
    fetch(`/api/venue/${venue.id}/live-chat`)
      .then(res => res.ok ? res.json() : { messages: [] })
      .then(data => setLiveMessages(data.messages ?? []))
      .catch(() => setLiveMessages([]))
  }, [venue.id, venue.public_chat_enabled])

  const distanceM = Math.round(venue.distance_km * 1000)
  const withinRadius = distanceM <= venue.geofence_radius_m
  const directionsUrl = `https://map.kakao.com/link/to/${encodeURIComponent(venue.name)},${venue.latitude},${venue.longitude}`

  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 20,
      padding: '18px 20px 32px', background: 'var(--bg)', borderTop: '1px solid var(--border)',
      borderRadius: '20px 20px 0 0', boxShadow: '0 -8px 24px rgba(0,0,0,0.25)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <p style={{ fontSize: 18, fontWeight: 800 }}>{venue.name}</p>
          <p style={{ fontSize: 12, color: 'var(--muted2)', marginTop: 2 }}>
            {CATEGORY_LABELS[venue.category ?? ''] ?? venue.category} · {venue.distance_km.toFixed(1)}km
          </p>
        </div>
        <button onClick={onClose} aria-label="닫기"
          style={{ width: 32, height: 32, borderRadius: 999, background: 'var(--card2)', border: '1px solid var(--border)', color: 'var(--muted2)', cursor: 'pointer' }}>
          ✕
        </button>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>🔥 HOT {Math.round(venue.hot_score * 100)}</p>
        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text2)' }}>⭐ {venue.satisfaction ? venue.satisfaction.toFixed(1) : '-'}</p>
      </div>

      {venue.public_chat_enabled && (
        <div style={{ maxHeight: 90, overflowY: 'auto', marginBottom: 14 }}>
          {liveMessages.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>아직 채팅이 없어요</p>
          ) : (
            liveMessages.slice().reverse().slice(-4).map((m, i) => (
              <p key={i} style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>
                <span style={{ fontWeight: 700, color: 'var(--muted2)' }}>{m.sender_nickname}</span> {m.content}
              </p>
            ))
          )}
        </div>
      )}

      {!withinRadius && (
        <p style={{ fontSize: 12, color: '#ff6b6b', marginBottom: 10 }}>매장에서 {distanceM}m 떨어져 있어요 — 가까이 가면 입장할 수 있어요</p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <button className="btn btn-secondary" onClick={() => window.open(directionsUrl, '_blank', 'noopener,noreferrer')}>
          🧭 길찾기
        </button>
        <button className="btn btn-primary" onClick={() => router.push(`/v/${venue.id}`)} disabled={!withinRadius}
          style={{ opacity: withinRadius ? 1 : 0.4 }}>
          🚪 입장하기
        </button>
      </div>
    </div>
  )
}
