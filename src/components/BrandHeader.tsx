'use client'

import { VenueBranding } from '@/lib/supabase/types'

const CATEGORY_LABELS: Record<string, string> = {
  bar: '바', pub: '펍', pocha: '포차', wine_bar: '와인바',
  cafe: '카페', event_hall: '행사장', etc: '',
}

// BUSINESS 방에서만 렌더된다 (PERSONAL 방은 venue가 null이라 호출부에서 걸러짐).
// 손님이 방 이름보다 매장 브랜딩(매장명/로고/컬러)을 먼저 보게 하는 것이 목적.
// isOperator=true(방 호스트=운영자)면 우측에 매장 설정 진입 버튼을 노출한다.
export default function BrandHeader({ venue, isOperator, onSettings }: {
  venue: VenueBranding
  isOperator?: boolean
  onSettings?: () => void
}) {
  const accent = venue.primary_color || 'var(--accent)'
  const categoryLabel = venue.category ? CATEGORY_LABELS[venue.category] : ''

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px', marginBottom: 12, borderRadius: 16,
      background: 'var(--card)', border: '1px solid var(--border)',
      borderLeft: `4px solid ${accent}`,
    }}>
      {venue.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={venue.logo_url} alt={venue.name}
          style={{ width: 44, height: 44, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
      ) : (
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, fontWeight: 800, color: '#fff', background: accent,
        }}>
          {venue.name[0] ?? '🏪'}
        </div>
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <p style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {venue.name}
          </p>
          {categoryLabel && (
            <span className="badge" style={{ background: 'var(--card2)', color: 'var(--muted2)', fontSize: 10, flexShrink: 0 }}>
              {categoryLabel}
            </span>
          )}
        </div>
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>MySTAR로 실시간 분위기 참여 중</p>
      </div>
      {isOperator && onSettings && (
        <button onClick={onSettings} aria-label="매장 설정"
          style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--card2)', border: '1px solid var(--border)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          ⚙️
        </button>
      )}
    </div>
  )
}
