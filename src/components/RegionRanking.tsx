'use client'

import { ReactNode } from 'react'
import { RankedVenue, RegionalRankings, VenueCategory } from '@/lib/supabase/types'
import Icon, { IconName } from '@/components/Icon'
import { GAP, ICON } from '@/lib/design'

const CATEGORY_LABELS: Record<string, string> = {
  pocha: '포차', bar: '바', pub: '펍', wine_bar: '와인바', cafe: '카페', event_hall: '행사장', etc: '기타',
}

function categoryLabel(c: VenueCategory | null) {
  return CATEGORY_LABELS[c ?? ''] ?? c ?? ''
}

// 랭킹 카드 한 장 — 정사각 이미지(placeholder) + 매장명/카테고리 + 지표값. 구독 매장만 빨간
// LIview 배지가 붙는다 (Subscription 도메인, BUSINESS_RULES.md §2.7 "구독 배지").
function RankCard({ venue, metric, onSelect }: { venue: RankedVenue; metric: string; onSelect: () => void }) {
  const subscribed = venue.subscription_status === 'active'
  return (
    <button
      onClick={onSelect}
      style={{
        flexShrink: 0, width: 148, textAlign: 'left', background: 'none', border: 'none',
        cursor: 'pointer', padding: 0,
      }}
    >
      <div style={{
        width: 148, height: 148, borderRadius: 16, position: 'relative', overflow: 'hidden',
        background: venue.logo_url ? `center/cover no-repeat url(${venue.logo_url})` : 'var(--card2)',
        border: '1px solid var(--border)',
      }}>
        {subscribed && (
          <span style={{
            position: 'absolute', top: 8, right: 8, display: 'inline-flex', alignItems: 'center', gap: 3,
            background: 'rgba(0,0,0,0.55)', padding: '3px 8px', borderRadius: 999, fontSize: 10, fontWeight: 800,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--accent)' }} />
            <span style={{ color: '#fff' }}>LIview</span>
          </span>
        )}
      </div>
      <p style={{ fontSize: 14, fontWeight: 800, marginTop: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {venue.name}
      </p>
      <p style={{ fontSize: 12, color: 'var(--muted2)', marginTop: 2 }}>
        {categoryLabel(venue.category)} · <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{metric}</span>
      </p>
    </button>
  )
}

function RankRow({ title, titleIcon, venues, metricOf, onSelect }: {
  title: ReactNode
  // 2026-08-17(ADR-0009): 제목 뒤에 붙던 이모지(🔥/⭐/❤️)를 Icon으로 교체. 이모지는 세
  // 줄의 제목 높이를 서로 다르게 만들어(각 이모지의 실제 글리프 높이가 달라서) 나란한
  // 섹션 제목들이 정렬돼 보이지 않았다.
  titleIcon: IconName
  venues: RankedVenue[]
  metricOf: (v: RankedVenue) => string
  onSelect: (id: string) => void
}) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{
        fontSize: 20, fontWeight: 800, padding: '0 20px', marginBottom: GAP.base,
        display: 'flex', alignItems: 'center', gap: GAP.snug,
      }}>
        {title}
        <span style={{ color: 'var(--accent)', display: 'flex' }}><Icon name={titleIcon} size={ICON.row} /></span>
      </h2>
      {venues.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--muted2)', padding: '0 20px' }}>지금 이 지역에 활성화된 매장이 없어요</p>
      ) : (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '0 20px', scrollbarWidth: 'none' }}>
          {venues.map((v, i) => (
            <RankCard key={`${v.id}-${i}`} venue={v} metric={metricOf(v)} onSelect={() => onSelect(v.id)} />
          ))}
        </div>
      )}
    </section>
  )
}

// 지역별 TOP10 랭킹 (Discovery 도메인, BUSINESS_RULES.md §2.7). HOT/실시간 별점/헌팅 3분류.
export default function RegionRanking({ rankings, regionLabel, onSelectVenue }: {
  rankings: RegionalRankings
  regionLabel: string
  onSelectVenue: (id: string) => void
}) {
  return (
    <div>
      <p style={{
        fontSize: 13, fontWeight: 700, color: 'var(--muted2)', padding: '0 20px',
        marginBottom: GAP.loose, display: 'flex', alignItems: 'center', gap: GAP.tight + 2,
      }}>
        <Icon name="location_on" size={ICON.inline} />
        {regionLabel}
      </p>
      <RankRow
        title={<>HOT TOP10</>} titleIcon="local_fire_department"
        venues={rankings.hot}
        metricOf={v => `HOT ${Math.round((v.hot_score ?? 0) * 100)}`}
        onSelect={onSelectVenue}
      />
      <RankRow
        title={<>실시간 별점 TOP10</>} titleIcon="star"
        venues={rankings.star}
        metricOf={v => `${(v.satisfaction ?? 0).toFixed(1)}`}
        onSelect={onSelectVenue}
      />
      <RankRow
        title={<>헌팅 TOP10</>} titleIcon="favorite"
        venues={rankings.heart}
        metricOf={v => `${v.heart_count ?? 0}`}
        onSelect={onSelectVenue}
      />
    </div>
  )
}
