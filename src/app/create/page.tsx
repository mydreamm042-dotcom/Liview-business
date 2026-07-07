'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSessionToken, storeRoomData } from '@/lib/session'
import { RoomType, VenueCategory } from '@/lib/supabase/types'

const CATEGORIES: { value: VenueCategory; label: string }[] = [
  { value: 'pocha', label: '포차' },
  { value: 'bar', label: '바' },
  { value: 'pub', label: '펍' },
  { value: 'wine_bar', label: '와인바' },
  { value: 'cafe', label: '카페' },
  { value: 'event_hall', label: '행사장' },
  { value: 'etc', label: '기타' },
]

interface MyVenue {
  id: string
  name: string
  category: VenueCategory | null
}

export default function CreatePage() {
  const router = useRouter()
  const [roomType, setRoomType] = useState<RoomType>('PERSONAL')
  const [roomName, setRoomName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // BUSINESS 전용 상태: 내 매장 목록 (있으면 선택, 없으면 새로 등록)
  const [myVenues, setMyVenues] = useState<MyVenue[] | null>(null)
  const [selectedVenueId, setSelectedVenueId] = useState<string>('')
  const [newVenueName, setNewVenueName] = useState('')
  const [newVenueCategory, setNewVenueCategory] = useState<VenueCategory>('pocha')

  // BUSINESS 탭 첫 진입 시 내 매장 목록을 불러온다
  useEffect(() => {
    if (roomType !== 'BUSINESS' || myVenues !== null) return
    const token = getSessionToken()
    fetch(`/api/venues?operator_token=${encodeURIComponent(token)}`)
      .then(res => res.json())
      .then(data => {
        const venues: MyVenue[] = data.venues ?? []
        setMyVenues(venues)
        if (venues.length > 0) setSelectedVenueId(venues[0].id)
      })
      .catch(() => setMyVenues([]))
  }, [roomType, myVenues])

  const handleCreate = async () => {
    if (!roomName.trim()) { setError('방 이름을 입력해주세요'); return }
    if (roomType === 'BUSINESS' && !selectedVenueId && !newVenueName.trim()) {
      setError('매장을 선택하거나 새 매장 이름을 입력해주세요'); return
    }
    setLoading(true); setError('')

    try {
      const host_session = getSessionToken()

      // BUSINESS: 매장이 없으면 먼저 등록하고 그 venue_id로 방을 만든다
      let venue_id = selectedVenueId
      if (roomType === 'BUSINESS' && !venue_id) {
        const venueRes = await fetch('/api/venues', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: newVenueName.trim(),
            category: newVenueCategory,
            operator_token: host_session,
          }),
        })
        const venueData = await venueRes.json()
        if (!venueRes.ok) throw new Error(venueData.error)
        venue_id = venueData.venue.id
      }

      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: roomName.trim(),
          host_session,
          ...(roomType === 'BUSINESS' ? { room_type: 'BUSINESS', venue_id } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      storeRoomData({
        roomId: data.room.id,
        roomCode: data.room.code,
        roomName: data.room.name,
        participantId: data.participant.id,
        nickname: '호스트',
      })
      router.push(`/room/${data.room.code}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다')
      setLoading(false)
    }
  }

  const isBusiness = roomType === 'BUSINESS'
  const needNewVenue = isBusiness && myVenues !== null && myVenues.length === 0
  const createDisabled = loading || !roomName.trim() ||
    (isBusiness && !selectedVenueId && !newVenueName.trim())

  return (
    <main className="flex flex-col min-h-dvh px-6" style={{ paddingTop: 56, paddingBottom: 32 }}>
      <button onClick={() => router.back()}
        style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--card2)', border: '1px solid var(--border)', color: 'var(--text2)', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginBottom: 32 }}>
        ←
      </button>

      <div className="animate-fade-in" style={{ marginBottom: 28 }}>
        <p style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700, marginBottom: 6, letterSpacing: '0.05em' }}>NEW ROOM</p>
        <h1 style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.2, marginBottom: 8 }}>방 만들기</h1>
        <p style={{ color: 'var(--muted2)', fontSize: 14 }}>
          {isBusiness ? '매장 손님들을 위한 방을 열어주세요' : '오늘 모임의 이름을 정해주세요'}
        </p>
      </div>

      {/* 방 타입 선택: PERSONAL(기존 B2C) / BUSINESS(매장 운영) */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {([
          { type: 'PERSONAL' as const, label: '개인 모임', desc: '친구 · 회식 · 동창회' },
          { type: 'BUSINESS' as const, label: '매장 운영', desc: '술집 · 펍 · 카페 사장님' },
        ]).map(({ type, label, desc }) => (
          <button key={type} onClick={() => { setRoomType(type); setError('') }}
            style={{
              flex: 1, padding: '14px 12px', borderRadius: 14, cursor: 'pointer', textAlign: 'left',
              background: roomType === type ? 'var(--card)' : 'var(--card2)',
              border: roomType === type ? '2px solid var(--accent)' : '1px solid var(--border)',
            }}>
            <p style={{ fontSize: 15, fontWeight: 800, color: roomType === type ? 'var(--accent)' : 'var(--text2)', marginBottom: 2 }}>{label}</p>
            <p style={{ fontSize: 11, color: 'var(--muted2)' }}>{desc}</p>
          </button>
        ))}
      </div>

      <div style={{ flex: 1 }}>
        {/* BUSINESS: 매장 선택 or 신규 등록 */}
        {isBusiness && (
          <div style={{ marginBottom: 24 }}>
            {myVenues === null ? (
              <p style={{ fontSize: 13, color: 'var(--muted2)' }}>매장 정보를 불러오는 중...</p>
            ) : myVenues.length > 0 ? (
              <>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted2)', letterSpacing: '0.05em', display: 'block', marginBottom: 10 }}>내 매장</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {myVenues.map(v => (
                    <button key={v.id} onClick={() => setSelectedVenueId(v.id)}
                      style={{
                        padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', fontSize: 14, fontWeight: 700,
                        background: selectedVenueId === v.id ? 'var(--card)' : 'var(--card2)',
                        border: selectedVenueId === v.id ? '2px solid var(--accent)' : '1px solid var(--border)',
                        color: selectedVenueId === v.id ? 'var(--accent)' : 'var(--text2)',
                      }}>
                      {v.name}
                      {v.category && <span style={{ fontSize: 11, color: 'var(--muted2)', marginLeft: 8, fontWeight: 400 }}>{CATEGORIES.find(c => c.value === v.category)?.label}</span>}
                    </button>
                  ))}
                  <button onClick={() => { setSelectedVenueId(''); }}
                    style={{
                      padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', fontSize: 13,
                      background: selectedVenueId === '' ? 'var(--card)' : 'var(--card2)',
                      border: selectedVenueId === '' ? '2px solid var(--accent)' : '1px dashed var(--border)',
                      color: 'var(--muted2)',
                    }}>
                    + 새 매장 등록
                  </button>
                </div>
              </>
            ) : null}

            {(needNewVenue || (myVenues !== null && myVenues.length > 0 && selectedVenueId === '')) && (
              <div style={{ marginTop: myVenues && myVenues.length > 0 ? 12 : 0 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted2)', letterSpacing: '0.05em', display: 'block', marginBottom: 10 }}>매장 이름</label>
                <input
                  className="input"
                  type="text"
                  value={newVenueName}
                  onChange={e => setNewVenueName(e.target.value)}
                  placeholder="예: 별빛포차 강남점"
                  maxLength={30}
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  {CATEGORIES.map(c => (
                    <button key={c.value} onClick={() => setNewVenueCategory(c.value)}
                      style={{
                        padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                        background: newVenueCategory === c.value ? 'var(--accent)' : 'var(--card2)',
                        border: '1px solid var(--border)',
                        color: newVenueCategory === c.value ? '#fff' : 'var(--muted2)',
                      }}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted2)', letterSpacing: '0.05em', display: 'block', marginBottom: 10 }}>
          {isBusiness ? '오늘의 방 이름' : '모임 이름'}
        </label>
        <input
          className="input"
          type="text"
          value={roomName}
          onChange={e => setRoomName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          placeholder={isBusiness ? '예: 금요일 밤, 불금 파티' : '예: 팀 회식, 대학 동창 모임'}
          maxLength={30}
          autoFocus={!isBusiness}
        />
        {error && <p style={{ marginTop: 8, fontSize: 13, color: '#ff6b6b' }}>{error}</p>}

        <div className="card" style={{ padding: 18, marginTop: 24 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 12 }}>
            {isBusiness ? 'BUSINESS 방에서 되는 것들' : '방 만들면 생기는 것들'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(isBusiness
              ? ['손님용 QR 입장 + 익명 분위기 피드백', '매장 브랜딩 노출 (이름/로고/컬러)', '마감 후에도 방 기록 영구 보존', '운영자 대시보드 · 리뷰 유도 (준비 중)']
              : ['6자리 참여 코드 + QR코드 자동 생성', '1시간마다 인터랙션 알림', '익명 하트 · 자제 시그널 · 별점 전송', '종료 시 오늘의 하이라이트 결과']
            ).map(t => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text2)' }}>
                <span style={{ color: 'var(--accent)', fontSize: 16 }}>✓</span>{t}
              </div>
            ))}
          </div>
        </div>
      </div>

      <button className="btn btn-primary" onClick={handleCreate} disabled={createDisabled}
        style={{ opacity: createDisabled ? 0.5 : 1, fontSize: 17, marginTop: 24 }}>
        {loading ? '생성 중...' : isBusiness ? '🏪 매장 방 열기' : '🎉 방 만들기'}
      </button>
    </main>
  )
}
