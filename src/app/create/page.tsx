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

  // BUSINESS 전용 상태: 내 매장 목록 (있으면 선택해서 설정 화면으로, 없으면 신규 등록).
  // 매장은 "방 만들기"가 아니라 한 번만 등록하고, 이후엔 설정 화면의 "오늘 영업 시작"으로
  // 매일 세션을 연다 (BUSINESS_RULES.md §2.1~2.2 — 고정 QR 모델).
  const [myVenues, setMyVenues] = useState<MyVenue[] | null>(null)
  const [newVenueName, setNewVenueName] = useState('')
  const [newVenueCategory, setNewVenueCategory] = useState<VenueCategory>('pocha')

  // BUSINESS 탭 첫 진입 시 내 매장 목록을 불러온다
  useEffect(() => {
    if (roomType !== 'BUSINESS' || myVenues !== null) return
    const token = getSessionToken()
    fetch(`/api/venues?operator_token=${encodeURIComponent(token)}`)
      .then(res => res.json())
      .then(data => setMyVenues(data.venues ?? []))
      .catch(() => setMyVenues([]))
  }, [roomType, myVenues])

  const handleCreatePersonal = async () => {
    if (!roomName.trim()) { setError('방 이름을 입력해주세요'); return }
    setLoading(true); setError('')
    try {
      const host_session = getSessionToken()
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: roomName.trim(), host_session }),
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

  const handleRegisterVenue = async () => {
    if (!newVenueName.trim()) { setError('매장 이름을 입력해주세요'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/venues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newVenueName.trim(),
          category: newVenueCategory,
          operator_token: getSessionToken(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      router.push(`/operator/settings/${data.venue.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다')
      setLoading(false)
    }
  }

  const isBusiness = roomType === 'BUSINESS'

  return (
    <main className="flex flex-col min-h-dvh px-6" style={{ paddingTop: 56, paddingBottom: 32 }}>
      <button onClick={() => router.back()}
        style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--card2)', border: '1px solid var(--border)', color: 'var(--text2)', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginBottom: 32 }}>
        ←
      </button>

      <div className="animate-fade-in" style={{ marginBottom: 28 }}>
        <p style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700, marginBottom: 6, letterSpacing: '0.05em' }}>{isBusiness ? 'MY VENUE' : 'NEW ROOM'}</p>
        <h1 style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.2, marginBottom: 8 }}>{isBusiness ? '매장 관리' : '방 만들기'}</h1>
        <p style={{ color: 'var(--muted2)', fontSize: 14 }}>
          {isBusiness ? '매장은 한 번만 등록하면 고정 QR이 계속 유지돼요' : '오늘 모임의 이름을 정해주세요'}
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

      {isBusiness ? (
        <div style={{ flex: 1 }}>
          {myVenues === null ? (
            <p style={{ fontSize: 13, color: 'var(--muted2)' }}>매장 정보를 불러오는 중...</p>
          ) : myVenues.length > 0 ? (
            <>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted2)', letterSpacing: '0.05em', display: 'block', marginBottom: 10 }}>내 매장</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                {myVenues.map(v => (
                  <button key={v.id} onClick={() => router.push(`/operator/settings/${v.id}`)}
                    style={{
                      padding: '14px 16px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', fontSize: 14, fontWeight: 700,
                      background: 'var(--card2)', border: '1px solid var(--border)', color: 'var(--text2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                    <span>
                      {v.name}
                      {v.category && <span style={{ fontSize: 11, color: 'var(--muted2)', marginLeft: 8, fontWeight: 400 }}>{CATEGORIES.find(c => c.value === v.category)?.label}</span>}
                    </span>
                    <span style={{ color: 'var(--muted2)' }}>→</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted2)', letterSpacing: '0.05em', display: 'block', marginBottom: 10 }}>매장 이름</label>
              <input
                className="input"
                type="text"
                value={newVenueName}
                onChange={e => setNewVenueName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleRegisterVenue()}
                placeholder="예: 별빛포차 강남점"
                maxLength={30}
                autoFocus
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
              {error && <p style={{ marginTop: 8, fontSize: 13, color: '#ff6b6b' }}>{error}</p>}
            </div>
          )}

          <div className="card" style={{ padding: 18, marginBottom: 24 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 12 }}>매장 등록하면 되는 것들</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {['한 번 등록하면 바뀌지 않는 고정 QR', '오늘 영업 시작/종료 버튼으로 매일 세션 관리', '입장 비밀번호 · 위치 반경 제한으로 QR 도용 방지', '마감 후에도 매장 이력 영구 보존'].map(t => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text2)' }}>
                  <span style={{ color: 'var(--accent)', fontSize: 16 }}>✓</span>{t}
                </div>
              ))}
            </div>
          </div>

          {myVenues !== null && myVenues.length === 0 && (
            <button className="btn btn-primary" onClick={handleRegisterVenue} disabled={loading || !newVenueName.trim()}
              style={{ opacity: loading || !newVenueName.trim() ? 0.5 : 1, fontSize: 17 }}>
              {loading ? '등록 중...' : '🏪 매장 등록하기'}
            </button>
          )}
        </div>
      ) : (
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted2)', letterSpacing: '0.05em', display: 'block', marginBottom: 10 }}>모임 이름</label>
          <input
            className="input"
            type="text"
            value={roomName}
            onChange={e => setRoomName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreatePersonal()}
            placeholder="예: 팀 회식, 대학 동창 모임"
            maxLength={30}
            autoFocus
          />
          {error && <p style={{ marginTop: 8, fontSize: 13, color: '#ff6b6b' }}>{error}</p>}

          <div className="card" style={{ padding: 18, marginTop: 24 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 12 }}>방 만들면 생기는 것들</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {['6자리 참여 코드 + QR코드 자동 생성', '1시간마다 인터랙션 알림', '익명 하트 · 자제 시그널 · 별점 전송', '종료 시 오늘의 하이라이트 결과'].map(t => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text2)' }}>
                  <span style={{ color: 'var(--accent)', fontSize: 16 }}>✓</span>{t}
                </div>
              ))}
            </div>
          </div>

          <button className="btn btn-primary" onClick={handleCreatePersonal} disabled={loading || !roomName.trim()}
            style={{ opacity: loading || !roomName.trim() ? 0.5 : 1, fontSize: 17, marginTop: 24 }}>
            {loading ? '생성 중...' : '🎉 방 만들기'}
          </button>
        </div>
      )}
    </main>
  )
}
