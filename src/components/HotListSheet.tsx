'use client'

import { useMemo, useRef, useState, ReactNode, PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react'
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

// 카테고리 칩의 가로 스크롤. 이 컴포넌트는 시트 헤더(touchAction:none) 안에 있어서 브라우저
// 네이티브 스크롤은 절대 동작하지 않는다 — CSS touch-action은 조상 중 하나라도 none이면
// 자식이 pan-x를 선언해도 무시되는 교집합 규칙이라(스펙), 대신 포인터 이벤트로 scrollLeft를
// 직접 움직이는 자체 드래그 스크롤을 구현한다. 드래그가 실제로 있었으면(임계값 이상 이동)
// 그 뒤의 클릭은 눌러서 카테고리가 바뀌는 걸 막는다(드래그 끝에 버튼이 눌리는 것 방지).
function CategoryScroller({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ startX: number; startScrollLeft: number; moved: boolean } | null>(null)

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    drag.current = { startX: e.clientX, startScrollLeft: ref.current?.scrollLeft ?? 0, moved: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    if (!drag.current || !ref.current) return
    const delta = e.clientX - drag.current.startX
    if (Math.abs(delta) > 4) drag.current.moved = true
    ref.current.scrollLeft = drag.current.startScrollLeft - delta
  }
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => { e.stopPropagation() }
  const onClickCapture = (e: ReactMouseEvent) => {
    if (drag.current?.moved) { e.preventDefault(); e.stopPropagation() }
    drag.current = null
  }

  return (
    <div
      ref={ref}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onClickCapture={onClickCapture}
      style={{ display: 'flex', gap: 6, overflowX: 'hidden', paddingBottom: 10, cursor: 'grab' }}
    >
      {children}
    </div>
  )
}

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

          {/* 카테고리 필터 — 자체 드래그 스크롤(CategoryScroller 참고) */}
          <CategoryScroller>
            {CATEGORIES.map(c => (
              <button key={c.value} onClick={() => setCategory(c.value)}
                style={{
                  flexShrink: 0, padding: '6px 14px', borderRadius: 999, whiteSpace: 'nowrap', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  background: category === c.value ? 'var(--accent)' : 'var(--card2)',
                  border: '1px solid var(--border)', color: category === c.value ? '#fff' : 'var(--muted2)',
                }}>
                {c.label}
              </button>
            ))}
          </CategoryScroller>

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
