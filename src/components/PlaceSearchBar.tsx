'use client'

import { useState, useRef, useEffect } from 'react'
import { KakaoPlace } from '@/hooks/useKakaoMap'

// 실제 장소 검색바 (Discovery 도메인, BUSINESS_RULES.md §2.7 "실제 장소 검색"). 카카오
// services 라이브러리의 키워드 검색을 쓴다. SDK가 준비된(sdkReady) 뒤에만 검색이 동작한다.
// 결과를 탭하면 좌표를 부모에 넘겨 지도를 그쪽으로 이동시킨다.
export default function PlaceSearchBar({
  sdkReady,
  center,
  onPick,
}: {
  sdkReady: boolean
  center: { lat: number; lng: number } | null
  onPick: (place: { name: string; lat: number; lng: number }) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<KakaoPlace[]>([])
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const search = () => {
    const q = query.trim()
    if (!q || !sdkReady || !window.kakao?.maps?.services) return
    const places = new window.kakao.maps.services.Places()
    const options = center ? { x: center.lng, y: center.lat, radius: 20000, size: 10 } : { size: 10 }
    places.keywordSearch(q, (data, status) => {
      if (status === window.kakao.maps.services.Status.OK) {
        setResults(data)
        setOpen(true)
      } else {
        setResults([])
        setOpen(true)
      }
    }, options)
  }

  return (
    <div ref={boxRef} style={{ position: 'absolute', top: 16, left: 16, right: 16, zIndex: 25 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px',
        background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      }}>
        <span style={{ fontSize: 16 }}>🔍</span>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') search() }}
          onFocus={() => { if (results.length > 0) setOpen(true) }}
          placeholder="장소, 매장 검색"
          style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 15 }}
        />
        {query && (
          <button onClick={() => { setQuery(''); setResults([]); setOpen(false) }} aria-label="지우기"
            style={{ background: 'none', border: 'none', color: 'var(--muted2)', cursor: 'pointer', fontSize: 14 }}>✕</button>
        )}
      </div>

      {open && (
        <div style={{
          marginTop: 8, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14,
          overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', maxHeight: 320, overflowY: 'auto',
        }}>
          {results.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--muted2)', padding: 16, textAlign: 'center' }}>검색 결과가 없어요</p>
          ) : (
            results.map(p => (
              <button key={p.id}
                onClick={() => {
                  onPick({ name: p.place_name, lat: Number(p.y), lng: Number(p.x) })
                  setOpen(false)
                }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px',
                  background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{p.place_name}</p>
                <p style={{ fontSize: 12, color: 'var(--muted2)', marginTop: 2 }}>
                  {p.road_address_name || p.address_name}
                </p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
