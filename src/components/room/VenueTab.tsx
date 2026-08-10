'use client'

import { VenueBranding, VenueBusinessHours } from '@/lib/supabase/types'
import StarRow from './StarRow'

function fmtTime(t: string | null) {
  if (!t) return null
  // 'HH:MM:SS' 또는 'HH:MM' → 'HH:MM'
  return t.slice(0, 5)
}

// 방 화면 "매장" 탭 — 매장명/실시간 별점/현재원/HOT 지수 + HOT 버튼/마감시간/소개.
// 좌석을 아직 안 고른 손님에게는 HOT 버튼 자리에 안내 문구를 보여준다(디자인 1번 화면).
export default function VenueTab({
  venue, moodAverage, occupied, capacity, hotIndex, hasSeat, businessHours,
  onHot, hotDisabledLabel,
}: {
  venue: VenueBranding | null
  moodAverage: number | null
  occupied: number
  capacity: number
  hotIndex: number
  hasSeat: boolean
  businessHours: VenueBusinessHours | null
  onHot: () => void
  hotDisabledLabel: string
}) {
  const lastOrder = fmtTime(businessHours?.last_order_time ?? null)
  const closeTime = businessHours?.is_24h ? null : fmtTime(businessHours?.close_time ?? null)

  return (
    <div style={{ padding: '20px 20px 0' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.25, marginBottom: 12 }}>
        {venue?.name ?? '매장'}
      </h1>

      {/* 실시간 별점 + 현재원 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
        <div>
          <p style={{ fontSize: 11, color: 'var(--muted2)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--accent)' }} />
            실시간 별점
          </p>
          <StarRow value={moodAverage ?? 0} size={20} />
        </div>
        <p style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 700, alignSelf: 'flex-end' }}>
          현재원 {occupied}{capacity > 0 ? `/${capacity}` : ''}
        </p>
      </div>

      {/* HOT 지수 바 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1, height: 8, borderRadius: 999, background: 'var(--card2)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${hotIndex}%`, borderRadius: 999,
            background: 'var(--accent)', transition: 'width 0.3s ease',
          }} />
        </div>
        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent)', minWidth: 44, textAlign: 'right' }}>
          {hotIndex}%
        </span>
      </div>

      {/* HOT 버튼 (좌석 선택 전에는 안내로 대체) */}
      {hasSeat ? (
        <button onClick={onHot} className="btn btn-primary"
          style={{ fontSize: 22, minHeight: 68, borderRadius: 14, marginBottom: 22 }}>
          HOT 🔥
        </button>
      ) : (
        <div style={{
          minHeight: 68, borderRadius: 14, background: 'var(--card2)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22,
          fontSize: 16, fontWeight: 700, color: 'var(--text2)', textAlign: 'center', padding: '0 16px',
        }}>
          {hotDisabledLabel}
        </div>
      )}

      {/* 마감 시간 */}
      {(lastOrder || closeTime || businessHours?.is_24h) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 18 }}>🕐</span>
          <span style={{ fontSize: 16, fontWeight: 800 }}>마감 시간</span>
          <span style={{ fontSize: 14, color: 'var(--text2)' }}>
            {businessHours?.is_24h
              ? '· 24시간 영업'
              : `· ${lastOrder ? `라스트오더 ${lastOrder}` : ''}${lastOrder && closeTime ? '  ' : ''}${closeTime ? `매장 마감 ${closeTime}` : ''}`}
          </span>
        </div>
      )}

      {/* 소개 */}
      {venue?.description && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 18 }}>🔥</span>
            <span style={{ fontSize: 16, fontWeight: 800 }}>소개</span>
          </div>
          <div style={{
            background: 'rgba(225,6,0,0.10)', border: '1px solid rgba(225,6,0,0.45)',
            borderRadius: 12, padding: '14px 16px', fontSize: 14, lineHeight: 1.6, color: 'var(--text)',
            whiteSpace: 'pre-wrap',
          }}>
            “ {venue.description} ”
          </div>
        </div>
      )}
    </div>
  )
}
