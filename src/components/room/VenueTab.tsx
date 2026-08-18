'use client'

import { VenueBranding, VenueBusinessHours } from '@/lib/supabase/types'
import StarRow from './StarRow'
import Icon from '@/components/Icon'
import { GAP, TYPE, ICON, RADIUS, SURFACE, SEMANTIC } from '@/lib/design'

function fmtTime(t: string | null) {
  if (!t) return null
  // 'HH:MM:SS' 또는 'HH:MM' → 'HH:MM'
  return t.slice(0, 5)
}

// 방 화면 "매장" 탭 — 매장명/실시간 별점/현재원/HOT 지수 + HOT 버튼/마감시간/소개.
// 좌석 선택이 방 입장의 전제조건이므로(ADR-0001) 이 탭에 도달한 손님은 이미 좌석이 있다 —
// "좌석 선택 전" 분기는 따로 두지 않는다.
//
// 2026-08-17(ADR-0009) 그루핑 정리: 이 탭은 성격이 다른 4가지(① 지금 이 매장의 상태 ② 내가
// 누르는 행동 ③ 영업 정보 ④ 매장 소개)를 세로로 죽 나열하고 있었는데, 간격이 12·14·20·22px로
// 비슷해서 어디서 성격이 바뀌는지 안 보였다. ①은 하나의 카드(공동 영역)로 묶고, ②는 그
// 아래 독립적으로 띄우고, ③④는 각각 영역 제목을 달아 GAP.section으로 떼어놨다.
export default function VenueTab({
  venue, moodAverage, occupied, capacity, hotIndex, businessHours, onHot,
}: {
  venue: VenueBranding | null
  moodAverage: number | null
  occupied: number
  capacity: number
  hotIndex: number
  businessHours: VenueBusinessHours | null
  onHot: () => void
}) {
  const lastOrder = fmtTime(businessHours?.last_order_time ?? null)
  const closeTime = businessHours?.is_24h ? null : fmtTime(businessHours?.close_time ?? null)

  return (
    <div style={{ padding: '20px 20px 0' }}>
      <h1 style={{ ...TYPE.title, fontSize: 28, marginBottom: GAP.loose }}>
        {venue?.name ?? '매장'}
      </h1>

      {/* ① 지금 이 매장의 상태 — 별점·현재원·HOT 지수는 "읽는 값"이라 한 카드로 묶는다.
          세 값이 흩어져 있으면 각각을 따로 확인해야 하지만, 묶여 있으면 한 번에 훑힌다. */}
      <div style={{
        background: SURFACE.group, border: '1px solid var(--border)', borderRadius: RADIUS.card,
        padding: GAP.loose, marginBottom: GAP.base,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: GAP.base }}>
          <div>
            <p style={{ ...TYPE.eyebrow, display: 'flex', alignItems: 'center', gap: GAP.tight + 2, marginBottom: GAP.snug }}>
              <span style={{ width: 6, height: 6, borderRadius: RADIUS.pill, background: 'var(--accent)' }} />
              실시간 별점
            </p>
            <StarRow value={moodAverage ?? 0} size={20} />
          </div>
          {/* 현재원은 별점과 같은 "읽는 값"이라 같은 카드 안, 같은 바닥선에 정렬한다 */}
          <p style={{ ...TYPE.body, display: 'flex', alignItems: 'center', gap: GAP.tight + 2, color: 'var(--text2)', fontWeight: 700 }}>
            <Icon name="group" size={ICON.inline} />
            {occupied}{capacity > 0 ? ` / ${capacity}` : ''}
          </p>
        </div>

        {/* HOT 지수 — 위 두 값과 같은 층의 상태값이라 같은 카드 안에 두고, 구분선으로만 나눈다 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: GAP.base,
          marginTop: GAP.loose, paddingTop: GAP.base, borderTop: '1px solid var(--border)',
        }}>
          <span style={{ ...TYPE.eyebrow, display: 'flex', alignItems: 'center', gap: GAP.tight, color: 'var(--accent)' }}>
            <Icon name="local_fire_department" size={ICON.inline} />
            HOT
          </span>
          <div style={{ flex: 1, height: 8, borderRadius: RADIUS.pill, background: SURFACE.item, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${hotIndex}%`, borderRadius: RADIUS.pill,
              background: 'var(--accent)', transition: 'width 0.3s ease',
            }} />
          </div>
          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent)', minWidth: 40, textAlign: 'right' }}>
            {hotIndex}%
          </span>
        </div>
      </div>

      {/* ② 내가 누르는 행동 — 상태 카드 밖에 둔다. 안에 넣으면 "읽는 것"과 "누르는 것"이
          한 덩어리로 보여서, 버튼이 카드의 일부(예: HOT 지수의 설명)처럼 읽힌다. */}
      <button onClick={onHot} className="btn btn-primary"
        style={{
          fontSize: 22, minHeight: 68, borderRadius: 14, marginBottom: GAP.section,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: GAP.snug,
        }}>
        HOT
        <Icon name="local_fire_department" size={26} />
      </button>

      {/* ③ 영업 정보 */}
      {(lastOrder || closeTime || businessHours?.is_24h) && (
        <section style={{ marginBottom: GAP.section }}>
          <p style={{ ...TYPE.eyebrow, display: 'flex', alignItems: 'center', gap: GAP.tight + 2, marginBottom: GAP.snug }}>
            <Icon name="schedule" size={ICON.inline} />
            마감 시간
          </p>
          <p style={{ ...TYPE.body, color: 'var(--text2)' }}>
            {businessHours?.is_24h
              ? '24시간 영업'
              : [lastOrder && `라스트오더 ${lastOrder}`, closeTime && `매장 마감 ${closeTime}`]
                  .filter(Boolean).join(' · ')}
          </p>
        </section>
      )}

      {/* ④ 매장 소개 */}
      {venue?.description && (
        <section style={{ marginBottom: GAP.snug }}>
          <p style={{ ...TYPE.eyebrow, display: 'flex', alignItems: 'center', gap: GAP.tight + 2, marginBottom: GAP.snug, color: 'var(--accent)' }}>
            <Icon name="local_fire_department" size={ICON.inline} />
            소개
          </p>
          <div style={{
            background: 'rgba(225,6,0,0.10)', border: `1px solid ${SEMANTIC.danger}40`,
            borderRadius: RADIUS.group, padding: `${GAP.base}px ${GAP.loose}px`,
            ...TYPE.body, lineHeight: 1.6, color: 'var(--text)', whiteSpace: 'pre-wrap',
          }}>
            {venue.description}
          </div>
        </section>
      )}
    </div>
  )
}
