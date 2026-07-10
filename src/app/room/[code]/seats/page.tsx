'use client'

import { useEffect, useState, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import { getRoomData, getSessionToken } from '@/lib/session'
import { Participant, VenueSeat, Reaction, VenueBranding } from '@/lib/supabase/types'
import { simulateHotTaps, hotIndexAt } from '@/lib/hotIndex'

function fmtElapsed(seatAssignedAt: string, now: number): string {
  const sec = Math.max(0, Math.floor((now - new Date(seatAssignedAt).getTime()) / 1000))
  const m = Math.floor(sec / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}시간 ${m % 60}분째`
  if (m > 0) return `${m}분째`
  return '방금 앉음'
}

// 참여자용 자리배치도 — BUSINESS 방은 좌석 선택이 필수다 (BUSINESS_RULES.md §2.8).
// 매장에 등록된 좌석이 하나도 없으면(운영자 미설정) 게이트를 걸지 않고 방으로 바로 보낸다.
export default function SeatSelectionPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  const router = useRouter()
  const roomData = getRoomData()

  const [seats, setSeats] = useState<VenueSeat[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [venue, setVenue] = useState<VenueBranding | null>(null)
  const [hotReactions, setHotReactions] = useState<Reaction[]>([])
  const [loaded, setLoaded] = useState(false)
  const [selectingSeatId, setSelectingSeatId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!roomData || roomData.roomCode !== code) router.replace(`/join?code=${code}`)
  }, [code, roomData, router])

  useEffect(() => {
    const ticker = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(ticker)
  }, [])

  const fetchState = useCallback(async () => {
    const [rRes, hRes] = await Promise.all([
      fetch(`/api/rooms/${code}?session_token=${encodeURIComponent(getSessionToken())}`),
      roomData ? fetch(`/api/reactions?room_id=${roomData.roomId}&type=hot`) : Promise.resolve(null),
    ])
    const rData = await rRes.json()
    if (rRes.ok) {
      setSeats(rData.seats ?? [])
      setParticipants((rData.participants ?? []).filter((p: Participant) => !p.left_at))
      setVenue(rData.venue ?? null)
    }
    if (hRes) {
      const hData = await hRes.json()
      setHotReactions(hData.reactions ?? [])
    }
    setLoaded(true)
  }, [code, roomData])

  useEffect(() => {
    fetchState()
    const interval = setInterval(fetchState, 3_000)
    return () => clearInterval(interval)
  }, [fetchState])

  const myParticipant = participants.find(p => p.id === roomData?.participantId)

  useEffect(() => {
    if (!loaded) return
    // 좌석 개념이 없는 방(PERSONAL이거나 매장이 아직 좌석을 설정 안 함), 또는 이미
    // 좌석을 골라둔 경우엔 이 화면에 머물 이유가 없다.
    if (seats.length === 0 || myParticipant?.seat_id) {
      router.replace(`/room/${code}`)
    }
  }, [loaded, seats, myParticipant, code, router])

  const handleSelect = async (seatId: string) => {
    if (!roomData) return
    setSelectingSeatId(seatId)
    setError('')
    try {
      const res = await fetch('/api/participants/seat', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participant_id: roomData.participantId,
          session_token: getSessionToken(),
          seat_id: seatId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      router.replace(`/room/${code}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '좌석 선택에 실패했습니다')
      fetchState()
    } finally {
      setSelectingSeatId(null)
    }
  }

  if (!loaded) {
    return <main className="flex min-h-dvh items-center justify-center"><p style={{ color: 'var(--muted2)' }}>불러오는 중...</p></main>
  }

  return (
    <main className="flex flex-col min-h-dvh px-6" style={{ paddingTop: 56, paddingBottom: 40 }}>
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700, marginBottom: 6, letterSpacing: '0.05em' }}>SEAT</p>
        <h1 style={{ fontSize: 26, fontWeight: 800 }}>{venue?.name ? `${venue.name} 좌석을 선택해주세요` : '좌석을 선택해주세요'}</h1>
        <p style={{ color: 'var(--muted2)', fontSize: 13, marginTop: 6 }}>비어있는 좌석을 눌러 앉아주세요</p>
      </div>

      {error && <p style={{ fontSize: 13, color: '#ff6b6b', marginBottom: 16 }}>{error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {seats.map(seat => {
          const occupant = participants.find(p => p.seat_id === seat.id)
          const occupantHot = occupant
            ? hotIndexAt(simulateHotTaps(hotReactions.filter(r => r.receiver_id === occupant.id)), now) > 0
            : false
          const isEmpty = !occupant

          return (
            <button
              key={seat.id}
              disabled={!isEmpty || selectingSeatId === seat.id}
              onClick={() => handleSelect(seat.id)}
              className="card"
              style={{
                padding: 16, textAlign: 'left', cursor: isEmpty ? 'pointer' : 'not-allowed',
                opacity: isEmpty ? 1 : 0.6,
                border: isEmpty ? '1.5px solid var(--accent)' : '1px solid var(--border)',
              }}
            >
              <p style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>{seat.label}</p>
              {isEmpty ? (
                <p style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>
                  {selectingSeatId === seat.id ? '선택 중...' : '빈 자리 · 선택하기'}
                </p>
              ) : (
                <div>
                  <p style={{ fontSize: 12, color: 'var(--muted2)' }}>
                    {occupant!.nickname} {occupantHot && '🔥'}
                  </p>
                  {occupant!.seat_assigned_at && (
                    <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{fmtElapsed(occupant!.seat_assigned_at, now)}</p>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </main>
  )
}
