'use client'

import { useEffect, useState, useCallback, useRef, use, PointerEvent as ReactPointerEvent } from 'react'
import { useRouter } from 'next/navigation'
import { getSessionToken } from '@/lib/session'
import { Participant, VenueSeat, Reaction } from '@/lib/supabase/types'
import { isOccupantHot } from '@/lib/seatDisplay'
import { HOT_TOTAL_MS } from '@/lib/hotIndex'
import SeatBoxContent from '@/components/SeatBoxContent'
import BackButton from '@/components/BackButton'
import ErrorScreen from '@/components/ErrorScreen'
import PageEyebrowHeader from '@/components/PageEyebrowHeader'
import InlineMessage from '@/components/InlineMessage'

interface SessionInfo { id: string; code?: string; status: string }

const CANVAS_HEIGHT = 380

function clampPct(v: number) {
  return Math.max(2, Math.min(98, v))
}

// 운영자의 좌석 배치 "구조 설계" 화면 (Seating 도메인, BUSINESS_RULES.md §2.8 "좌석 배치
// 자유 구성"). 여기서는 좌석을 추가/삭제/드래그 배치만 한다 — 실시간 손님 케어(경고 메시지,
// 좌석 강제 이동)는 운영자가 이미 보고 있는 방 화면으로 옮겼다(§2.9 "트리거 화면 위치").
// 이 화면의 실시간 좌석 현황 표시는 배치를 참고하기 위한 읽기 전용 정보일 뿐이다.
export default function OperatorSeatsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const sessionToken = getSessionToken()

  const [venueName, setVenueName] = useState('')
  const [loadError, setLoadError] = useState('')
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [seats, setSeats] = useState<VenueSeat[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [hotReactions, setHotReactions] = useState<Reaction[]>([])
  const [now, setNow] = useState(() => Date.now())

  const [newSeatLabel, setNewSeatLabel] = useState('')
  const [addingSeat, setAddingSeat] = useState(false)
  const [actionError, setActionError] = useState('')

  const canvasRef = useRef<HTMLDivElement>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  useEffect(() => {
    const ticker = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(ticker)
  }, [])

  const loadSeats = useCallback(() => {
    fetch(`/api/venues/${id}/seats`)
      .then(res => res.json())
      .then(data => setSeats(data.seats ?? []))
      .catch(() => {})
  }, [id])

  // 좌석 배치를 참고하기 위한 읽기 전용 실시간 현황 — 여기서는 아무 액션도 트리거되지 않는다.
  const loadRoomState = useCallback(async (code: string) => {
    const rRes = await fetch(`/api/rooms/${code}?session_token=${encodeURIComponent(sessionToken)}`)
    const rData = await rRes.json()
    if (!rRes.ok) return
    const active = (rData.participants ?? []).filter((p: Participant) => !p.left_at)
    setParticipants(active)
    // 최근 HOT_TOTAL_MS(15분)分만 받는다 — since 없이 전체 히스토리를 매번 받으면 영업
    // 시간이 길어질수록(HOT은 연타 특성상 가장 많이 쌓이는 타입) 응답이 계속 커진다.
    const hotSince = new Date(Date.now() - HOT_TOTAL_MS).toISOString()
    const hRes = await fetch(`/api/reactions?room_id=${rData.room.id}&type=hot&since=${encodeURIComponent(hotSince)}`)
    const hData = await hRes.json()
    setHotReactions(hData.reactions ?? [])
  }, [sessionToken])

  useEffect(() => {
    fetch(`/api/venues/${id}`)
      .then(res => res.json())
      .then(data => {
        if (!data.venue || !data.isOwner) {
          setLoadError('이 매장의 운영자만 좌석을 관리할 수 있습니다')
          return
        }
        setVenueName(data.venue.name)
      })
      .catch(() => setLoadError('매장 정보를 불러오지 못했습니다'))

    fetch(`/api/venues/${id}/session`)
      .then(res => res.json())
      .then(data => setSession(data.session ?? null))
      .catch(() => {})

    loadSeats()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (!session?.code) return
    loadRoomState(session.code)
    const interval = setInterval(() => loadRoomState(session.code!), 3_000)
    return () => clearInterval(interval)
  }, [session, loadRoomState])

  const handleAddSeat = async () => {
    if (!newSeatLabel.trim()) return
    setAddingSeat(true)
    try {
      const res = await fetch(`/api/venues/${id}/seats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newSeatLabel.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error()
      setSeats(prev => [...prev, data.seat])
      setNewSeatLabel('')
    } catch {
      setActionError('좌석 추가에 실패했습니다')
    } finally {
      setAddingSeat(false)
    }
  }

  const handleDeleteSeat = async (seatId: string) => {
    if (!confirm('이 좌석을 삭제할까요?')) return
    setSeats(prev => prev.filter(s => s.id !== seatId))
    const res = await fetch(`/api/venues/${id}/seats`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seat_id: seatId }),
    })
    // 실패했으면 지웠다고 착각하지 않도록 목록을 다시 맞춘다 (성공 시엔 재조회 불필요).
    if (!res.ok) loadSeats()
  }

  // 드래그 중에는 로컬 상태만 갱신해 즉시 반응하게 하고, 뗄 때 딱 한 번만 서버에 저장한다.
  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>, seatId: string) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setDraggingId(seatId)
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingId || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = clampPct(((e.clientX - rect.left) / rect.width) * 100)
    const y = clampPct(((e.clientY - rect.top) / rect.height) * 100)
    setSeats(prev => prev.map(s => (s.id === draggingId ? { ...s, position_x: x, position_y: y } : s)))
  }

  const handlePointerUp = async () => {
    if (!draggingId) return
    const seatId = draggingId
    setDraggingId(null)
    const seat = seats.find(s => s.id === seatId)
    if (!seat) return
    try {
      const res = await fetch(`/api/venues/${id}/seats`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seat_id: seat.id, position_x: seat.position_x, position_y: seat.position_y }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setActionError('좌석 위치 저장에 실패했습니다')
      loadSeats()
    }
  }

  if (loadError) {
    return <ErrorScreen message={loadError} />
  }

  return (
    <main className="flex flex-col min-h-dvh px-6" style={{ paddingTop: 56, paddingBottom: 60 }}>
      <BackButton onClick={() => router.back()} />

      <PageEyebrowHeader
        eyebrow="OPERATOR"
        title={`${venueName} 좌석 배치`}
        subtitle="좌석을 드래그해서 실제 매장 구조에 맞게 배치하세요"
        marginBottom={24} titleSize={24} subtitleSize={12}
      />

      {actionError && <InlineMessage type="error" style={{ marginBottom: 16 }}>{actionError}</InlineMessage>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input className="input" value={newSeatLabel} onChange={e => setNewSeatLabel(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAddSeat()} placeholder="예: 1번 테이블" maxLength={20} style={{ flex: 1 }} />
        <button className="btn btn-secondary" onClick={handleAddSeat} disabled={addingSeat || !newSeatLabel.trim()} style={{ minHeight: 'auto', padding: '0 16px' }}>추가</button>
      </div>

      <div
        ref={canvasRef}
        style={{
          position: 'relative', width: '100%', height: CANVAS_HEIGHT, borderRadius: 16,
          background: 'var(--card2)', border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 16,
        }}
      >
        {seats.length === 0 && (
          <p style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--muted2)' }}>
            위에서 좌석을 추가해주세요
          </p>
        )}
        {seats.map(seat => {
          const occupant = participants.find(p => p.seat_id === seat.id)
          const occupantHot = occupant ? isOccupantHot(occupant.id, hotReactions, now) : false
          return (
            <div
              key={seat.id}
              onPointerDown={e => handlePointerDown(e, seat.id)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              className="card"
              style={{
                position: 'absolute',
                left: `${seat.position_x}%`,
                top: `${seat.position_y}%`,
                transform: 'translate(-50%, -50%)',
                width: 92,
                padding: '10px 12px',
                textAlign: 'left',
                cursor: draggingId === seat.id ? 'grabbing' : 'grab',
                touchAction: 'none',
                userSelect: 'none',
                border: draggingId === seat.id ? '2px solid var(--accent)' : '1px solid var(--border)',
                zIndex: draggingId === seat.id ? 10 : 1,
              }}
            >
              <SeatBoxContent seat={seat} occupant={occupant} occupantHot={occupantHot} now={now} />
              <button
                type="button"
                aria-label={`${seat.label} 삭제`}
                onPointerDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); handleDeleteSeat(seat.id) }}
                style={{
                  position: 'absolute', top: -8, right: -8, width: 20, height: 20, borderRadius: '50%',
                  background: 'var(--card)', border: '1px solid var(--border)', color: '#ff6b6b',
                  fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', lineHeight: 1, padding: 0,
                }}
              >
                ×
              </button>
            </div>
          )
        })}
      </div>

      {session?.status !== 'active' && (
        <p style={{ fontSize: 12, color: 'var(--muted2)' }}>영업 중이 아니라 실시간 좌석 현황은 표시되지 않습니다</p>
      )}
    </main>
  )
}
