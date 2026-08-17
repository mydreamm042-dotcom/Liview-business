'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useGeolocation } from '@/hooks/useKakaoMap'
import { DiscoverVenue, VenueCategory } from '@/lib/supabase/types'
import BackButton from '@/components/BackButton'
import Icon from '@/components/Icon'
import { GAP, ICON, SEMANTIC } from '@/lib/design'

const CATEGORIES: { value: VenueCategory | 'all'; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'pocha', label: '포차' },
  { value: 'bar', label: '바' },
  { value: 'pub', label: '펍' },
  { value: 'wine_bar', label: '와인바' },
  { value: 'cafe', label: '카페' },
  { value: 'event_hall', label: '행사장' },
]

type SortKey = 'hot' | 'distance'

interface LiveMessage {
  sender_nickname: string
  content: string
  created_at: string
}

function DiscoverContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const highlightVenueId = searchParams.get('venue')

  const { position, status: geoStatus } = useGeolocation()
  const [venues, setVenues] = useState<DiscoverVenue[]>([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState<VenueCategory | 'all'>('all')
  const [sort, setSort] = useState<SortKey>('hot')
  const [expandedId, setExpandedId] = useState<string | null>(highlightVenueId)
  const [liveChat, setLiveChat] = useState<Record<string, LiveMessage[]>>({})

  const center = position ?? (geoStatus !== 'loading' ? { lat: 37.5665, lng: 126.978 } : null)

  const fetchVenues = useCallback(() => {
    if (!center) return
    const params = new URLSearchParams({
      lat: String(center.lat),
      lng: String(center.lng),
      radius_km: '10',
    })
    if (category !== 'all') params.set('category', category)
    fetch(`/api/discover/venues?${params}`)
      .then(res => res.json())
      .then(data => setVenues(data.venues ?? []))
      .catch(() => setVenues([]))
      .finally(() => setLoading(false))
  }, [center, category])

  // 3초 폴링 — 기존 useRoom의 실시간 갱신 패턴과 동일한 주기
  useEffect(() => {
    fetchVenues()
    const interval = setInterval(fetchVenues, 3000)
    return () => clearInterval(interval)
  }, [fetchVenues])

  // 채팅이 공개된(public_chat_enabled) 매장의 프리뷰만 가져온다.
  const loadLiveChat = useCallback((venueId: string) => {
    fetch(`/api/venue/${venueId}/live-chat`)
      .then(res => res.ok ? res.json() : { messages: [] })
      .then(data => setLiveChat(prev => ({ ...prev, [venueId]: data.messages ?? [] })))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (expandedId) loadLiveChat(expandedId)
  }, [expandedId, loadLiveChat])

  const sorted = [...venues].sort((a, b) =>
    sort === 'hot' ? b.hot_score - a.hot_score : a.distance_km - b.distance_km
  )

  return (
    <main className="flex flex-col min-h-dvh px-6" style={{ paddingTop: 56, paddingBottom: 32 }}>
      <BackButton onClick={() => router.back()} marginBottom={20} />

      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4, display: 'flex', alignItems: 'center', gap: GAP.snug }}>
          <span style={{ color: 'var(--accent)', display: 'flex' }}><Icon name="local_fire_department" size={ICON.card} /></span>
          실시간 핫한 가게
        </h1>
      <p style={{ color: 'var(--muted2)', fontSize: 13, marginBottom: 20 }}>
        지금 이 순간 분위기가 좋은 매장이에요. 입장은 실제 방문 후 QR로만 가능해요.
      </p>

      {/* 카테고리 필터 */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 12, paddingBottom: 4 }}>
        {CATEGORIES.map(c => (
          <button key={c.value} onClick={() => setCategory(c.value)}
            style={{
              padding: '6px 14px', borderRadius: 999, whiteSpace: 'nowrap', cursor: 'pointer', fontSize: 12, fontWeight: 700,
              background: category === c.value ? 'var(--accent)' : 'var(--card2)',
              border: '1px solid var(--border)',
              color: category === c.value ? '#fff' : 'var(--muted2)',
            }}>
            {c.label}
          </button>
        ))}
      </div>

      {/* 정렬 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {([{ key: 'hot' as const, label: 'HOT순' }, { key: 'distance' as const, label: '거리순' }]).map(s => (
          <button key={s.key} onClick={() => setSort(s.key)}
            style={{
              fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '4px 0',
              color: sort === s.key ? 'var(--accent)' : 'var(--muted2)',
              borderBottom: sort === s.key ? '2px solid var(--accent)' : '2px solid transparent',
              background: 'none',
            }}>
            {s.label}
          </button>
        ))}
      </div>

      {loading && <p style={{ textAlign: 'center', color: 'var(--muted2)', fontSize: 13 }}>불러오는 중...</p>}
      {!loading && sorted.length === 0 && (
        <p style={{ textAlign: 'center', color: 'var(--muted2)', fontSize: 13, marginTop: 40 }}>
          주변에 활성화된 매장이 없어요
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {sorted.map(v => (
          <div key={v.id} className="card" style={{ padding: 16, cursor: 'pointer' }}
            onClick={() => setExpandedId(expandedId === v.id ? null : v.id)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ fontSize: 16, fontWeight: 800 }}>{v.name}</p>
                <p style={{ fontSize: 11, color: 'var(--muted2)' }}>
                  {CATEGORIES.find(c => c.value === v.category)?.label ?? v.category} · {v.distance_km.toFixed(1)}km
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: GAP.tight, justifyContent: 'flex-end' }}>
                  <Icon name="local_fire_department" size={ICON.inline} />{Math.round(v.hot_score * 100)}
                </p>
                <p style={{ fontSize: 11, color: 'var(--muted2)', display: 'flex', alignItems: 'center', gap: GAP.tight, justifyContent: 'flex-end', marginTop: 2 }}>
                  <Icon name="star" size={13} />{v.satisfaction ? v.satisfaction.toFixed(1) : '-'}
                </p>
              </div>
            </div>

            {expandedId === v.id && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                {v.public_chat_enabled ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
                    {(liveChat[v.id] ?? []).length === 0 && (
                      <p style={{ fontSize: 12, color: 'var(--muted)' }}>아직 채팅이 없어요</p>
                    )}
                    {(liveChat[v.id] ?? []).slice().reverse().map((m, i) => (
                      <p key={i} style={{ fontSize: 12, color: 'var(--text2)' }}>
                        <span style={{ fontWeight: 700, color: 'var(--muted2)' }}>{m.sender_nickname}</span> {m.content}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: 'var(--muted)' }}>이 매장은 채팅을 공개하지 않아요</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  )
}

export default function DiscoverPage() {
  return (
    <Suspense fallback={null}>
      <DiscoverContent />
    </Suspense>
  )
}
