'use client'

import { useEffect, useState, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import { getRoomData, getSessionToken, clearRoomData } from '@/lib/session'
import { Participant, VenueSeat, Reaction, VenueBranding } from '@/lib/supabase/types'
import { fmtSeatElapsed, isOccupantHot } from '@/lib/seatDisplay'
import { useGeofenceAutoLeave } from '@/hooks/useGeofenceAutoLeave'

// 참여자용 자리배치도 — BUSINESS 방은 좌석 선택이 필수다 (BUSINESS_RULES.md §2.8).
// 매장에 등록된 좌석이 하나도 없으면(운영자 미설정) 게이트를 걸지 않고 방으로 바로 보낸다.
export default function SeatSelectionPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  const router = useRouter()
  const roomData = getRoomData()
  // getRoomData()는 매 렌더마다 localStorage를 새로 JSON.parse해 매번 다른 객체 참조를
  // 반환한다 — 이 화면의 1초 tick(now)과 겹치면 roomData 전체를 deps에 넣은 effect가
  // 매초 정리/재실행된다. 그래서 아래 effect들은 원시값(participantId/roomId)만 쓴다.
  const myParticipantId = roomData?.participantId
  const myRoomId = roomData?.roomId

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
      myRoomId ? fetch(`/api/reactions?room_id=${myRoomId}&type=hot`) : Promise.resolve(null),
    ])
    const rData = await rRes.json()
    if (rRes.ok) {
      // 좌석을 고르는 동안 운영자가 영업을 종료하면(closed) 다른 참여자들과 마찬가지로
      // 결과 화면으로 보낸다 — 그렇지 않으면 이 화면에 계속 갇힌다.
      if (rData.room?.status === 'ended' || rData.room?.status === 'closed') {
        router.replace(`/room/${code}/result`)
        return
      }
      setSeats(rData.seats ?? [])
      setParticipants((rData.participants ?? []).filter((p: Participant) => !p.left_at))
      setVenue(rData.venue ?? null)
    }
    if (hRes) {
      const hData = await hRes.json()
      setHotReactions(hData.reactions ?? [])
    }
    setLoaded(true)
  }, [code, myRoomId, router])

  useEffect(() => {
    fetchState()
    const interval = setInterval(fetchState, 3_000)
    return () => clearInterval(interval)
  }, [fetchState])

  // 좌석을 아직 안 고른 상태로 이 화면에 머무는 동안에도 위치 반경 제한은 계속 적용돼야
  // 한다 (BUSINESS_RULES.md §2.3) — 방 화면에만 걸려있으면 이 화면에서는 빠져나가게 된다.
  const handleGeofenceLeave = useCallback(async () => {
    if (roomData) {
      try {
        await fetch('/api/participants', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ participant_id: roomData.participantId, session_token: getSessionToken() }),
        })
      } catch {
        // 위치 이탈로 인한 자동 퇴장은 사용자 확인 없이 진행되므로, 서버 처리 실패해도 나간다
      }
    }
    clearRoomData()
    alert('매장 위치를 벗어나 자동으로 퇴장되었습니다')
    router.replace('/')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useGeofenceAutoLeave(venue?.latitude, venue?.longitude, venue?.geofence_radius_m, handleGeofenceLeave)

  const myParticipant = participants.find(p => p.id === myParticipantId)

  useEffect(() => {
    if (!loaded) return
    // 좌석 개념이 없는 방(PERSONAL이거나 매장이 아직 좌석을 설정 안 함), 또는 이미
    // 좌석을 골라둔 경우엔 이 화면에 머물 이유가 없다.
    if (seats.length === 0 || myParticipant?.seat_id) {
      router.replace(`/room/${code}`)
    }
  }, [loaded, seats, myParticipant, code, router])

  const handleSelect = async (seatId: string) => {
    if (!myParticipantId) return
    setSelectingSeatId(seatId)
    setError('')
    try {
      const res = await fetch('/api/participants/seat', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participant_id: myParticipantId,
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
          const occupantHot = occupant ? isOccupantHot(occupant.id, hotReactions, now) : false
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
                    <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{fmtSeatElapsed(occupant!.seat_assigned_at, now)}</p>
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
