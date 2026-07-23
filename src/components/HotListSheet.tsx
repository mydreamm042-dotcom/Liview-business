'use client'

import { useMemo, useState } from 'react'
import { DiscoverVenue, VenueCategory } from '@/lib/supabase/types'
import DraggableBottomSheet from '@/components/DraggableBottomSheet'

const CATEGORIES: { value: VenueCategory | 'all'; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'pocha', label: '포차' },
  { value: 'bar', label: '바' },
  { value: 'pub', label: '펍' },
  { value: 'wine_bar', label: '와인바' },
  { value: 'cafe', label: '카페' },
  { value: 'event_hall', label: '행사장' },
]

type SortKey = 'hot' | 'distance' | 'star'

// HOT 탭 — "실시간 핫한 가게" 전체 목록(카테고리 필터 + 정렬). TOP10 랭킹과는 별개로,
// 매장들을 카테고리/HOT/거리/별점으로 더 세밀하게 정렬해 보는 화면(원래 더보기의 카테고리 창).
// 기본 바텀시트(DraggableBottomSheet)를 그대로 써서 collapsed까지 드래그하면 닫힌다 —
// 별도 X 버튼을 두지 않는다(부모가 collapsed 전환을 "닫기"로 처리).
export default function HotListSheet({
  venues, onSelectVenue, snapPoints, snapIndex, onSnapChange, bottomOffset,
}: {
  venues: DiscoverVenue[]
  onSelectVenue: (id: string) => void
  snapPoints: number[]
  snapIndex: number
  onSnapChange: (index: number) => void
  bottomOffset: number
}) {
  const [category, setCategory] = useState<VenueCategory | 'all'>('all')
  const [sort, setSort] = useState<SortKey>('hot')

  const list = useMemo(() => {
    const filtered = category === 'all' ? venues : venues.filter(v => v.category === category)
    return [...filtered].sort((a, b) =>
      sort === 'hot' ? b.hot_score - a.hot_score
        : sort === 'distance' ? a.distance_km - b.distance_km
        : b.satisfaction - a.satisfaction
    )
  }, [venues, category, sort])

  return (
    <DraggableBottomSheet
      snapPoints={snapPoints}
      snapIndex={snapIndex}
      onSnapChange={onSnapChange}
      bottomOffset={bottomOffset}
      header={
        <div>
          <p style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>🔥 실시간 핫한 가게</p>

          {/* 카테고리 필터 — 시트 드래그와 가로 스크롤이 충돌하지 않도록, 이 영역의 포인터
              이벤트가 상위(헤더 드래그 핸들러)로 전파되지 않게 막는다. */}
          <div
            onPointerDownCapture={e => e.stopPropagation()}
            onPointerMoveCapture={e => e.stopPropagation()}
            style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 10, scrollbarWidth: 'none', touchAction: 'pan-x' }}
          >
            {CATEGORIES.map(c => (
              <button key={c.value} onClick={() => setCategory(c.value)}
                style={{
                  padding: '6px 14px', borderRadius: 999, whiteSpace: 'nowrap', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  background: category === c.value ? 'var(--accent)' : 'var(--card2)',
                  border: '1px solid var(--border)', color: category === c.value ? '#fff' : 'var(--muted2)',
                }}>
                {c.label}
              </button>
            ))}
          </div>

          {/* 정렬 */}
          <div style={{ display: 'flex', gap: 14, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
            {([{ key: 'hot' as const, label: 'HOT순' }, { key: 'star' as const, label: '별점순' }, { key: 'distance' as const, label: '거리순' }]).map(s => (
              <button key={s.key} onClick={() => setSort(s.key)}
                style={{
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '2px 0', background: 'none', border: 'none',
                  color: sort === s.key ? 'var(--accent)' : 'var(--muted2)',
                  borderBottom: sort === s.key ? '2px solid var(--accent)' : '2px solid transparent',
                }}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      }
    >
      {/* 목록 */}
      <div style={{ padding: '12px 20px 24px' }}>
        {list.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--muted2)', fontSize: 13, marginTop: 40 }}>주변에 매장이 없어요</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {list.map(v => {
              const subscribed = v.subscription_status === 'active'
              return (
                <button key={v.id} onClick={() => onSelectVenue(v.id)} className="card"
                  style={{ padding: 14, cursor: 'pointer', textAlign: 'left', width: '100%', border: '1px solid var(--border)', background: 'var(--card)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <p style={{ fontSize: 16, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.name}</p>
                        {subscribed && <span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--accent)', flexShrink: 0 }} />}
                      </div>
                      <p style={{ fontSize: 11, color: 'var(--muted2)', marginTop: 2 }}>
                        {CATEGORIES.find(c => c.value === v.category)?.label ?? v.category} · {v.distance_km.toFixed(1)}km
                        {v.is_open ? '' : ' · 영업종료'}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)' }}>🔥 {Math.round(v.hot_score * 100)}</p>
                      <p style={{ fontSize: 11, color: 'var(--muted2)' }}>⭐ {v.satisfaction ? v.satisfaction.toFixed(1) : '-'}</p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </DraggableBottomSheet>
  )
}
