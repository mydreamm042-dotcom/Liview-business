'use client'

import { useEffect, useState, useCallback, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import { getSessionToken } from '@/lib/session'
import { Participant, VenueSeat, Reaction } from '@/lib/supabase/types'
import { fmtSeatElapsed, isOccupantHot } from '@/lib/seatDisplay'

const LONG_PRESS_MS = 2000

interface SessionInfo { id: string; code?: string; status: string }

// 운영자 좌석 관리 + 실시간 자리배치도 (Seating/Guest Care 도메인, BUSINESS_RULES.md §2.8~2.9).
// 좌석 이동은 "길게 누르면(2초) 이동 모드로 들어가고, 다른 좌석을 눌러 완료"하는 방식으로
// 통일했다 — 데스크톱 마우스와 모바일 터치 모두 같은 포인터 이벤트로 동작한다.
// 우클릭(데스크톱)/짧은 터치(모바일)는 손님 케어 메뉴(경고 메시지)를 연다.
export default function OperatorSeatsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  // 운영자 자신의 참여자 신원용 익명 세션 토큰 (Operator 도메인 §2.11 전환 이후 API 인증
  // 자체는 로그인 쿠키가 담당하고, 이 값은 방 참여자 조회 시 쓰는 별개 개념이다).
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

  const [armedSeatId, setArmedSeatId] = useState<string | null>(null)
  const [menuTarget, setMenuTarget] = useState<Participant | null>(null)
  const [alertMessage, setAlertMessage] = useState('')
  const [sendingAlert, setSendingAlert] = useState(false)
  const [actionError, setActionError] = useState('')

  // 눌린 좌석과 시작 시각만 기록해두고, "2초 이상 눌렀는지"는 뗄 때(pointerUp) 딱 한 번만
  // 판정한다 — 누르는 도중 setTimeout으로 상태를 바꾸면, 그 직후 이어지는 pointerUp이
  // "방금 무장된 좌석을 다시 탭한 것"으로 해석돼 무장 상태가 같은 제스처 안에서 바로
  // 풀려버리는 문제가 있었다 (길게 눌렀다 떼는 순간 무장 배너가 뜨자마자 사라짐).
  const pressStartRef = useRef<{ seatId: string; startedAt: number } | null>(null)

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

  const loadRoomState = useCallback(async (code: string) => {
    const [rRes] = await Promise.all([
      fetch(`/api/rooms/${code}?session_token=${encodeURIComponent(sessionToken)}`),
    ])
    const rData = await rRes.json()
    if (!rRes.ok) return
    const active = (rData.participants ?? []).filter((p: Participant) => !p.left_at)
    setParticipants(active)
    const hRes = await fetch(`/api/reactions?room_id=${rData.room.id}&type=hot`)
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
      // 응답에 이미 새 좌석 전체가 들어있으니, 목록을 처음부터 다시 조회하지 않고 그대로 붙인다.
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

  const handleMove = async (targetSeatId: string) => {
    if (!armedSeatId || !session?.code) return
    const occupant = participants.find(p => p.seat_id === armedSeatId)
    setArmedSeatId(null)
    if (!occupant) return
    try {
      const res = await fetch(`/api/rooms/${session.code}/seats`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participant_id: occupant.id, seat_id: targetSeatId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      loadRoomState(session.code)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '좌석 이동에 실패했습니다')
    }
  }

  const handleSendAlert = async () => {
    if (!menuTarget || !alertMessage.trim() || !session?.code) return
    setSendingAlert(true)
    try {
      const res = await fetch(`/api/rooms/${session.code}/alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participant_id: menuTarget.id, message: alertMessage.trim() }),
      })
      if (!res.ok) throw new Error()
      setMenuTarget(null)
      setAlertMessage('')
    } catch {
      setActionError('메시지 전송에 실패했습니다')
    } finally {
      setSendingAlert(false)
    }
  }

  const startPress = (seat: VenueSeat, occupant: Participant | undefined) => {
    if (!occupant) return
    pressStartRef.current = { seatId: seat.id, startedAt: Date.now() }
  }
  const cancelPress = () => { pressStartRef.current = null }

  // 이미 무장된 상태에서의 탭은 "이동 완료/취소"고, 무장되지 않은 상태에서의 탭은
  // 눌린 시간에 따라 "무장 시작"(2초 이상) 또는 "손님 케어 메뉴"(짧게)로 갈린다.
  const handleSeatRelease = (seat: VenueSeat, occupant: Participant | undefined) => {
    if (armedSeatId) {
      if (armedSeatId !== seat.id) handleMove(seat.id)
      else setArmedSeatId(null)
      pressStartRef.current = null
      return
    }
    const press = pressStartRef.current
    pressStartRef.current = null
    if (press?.seatId === seat.id && Date.now() - press.startedAt >= LONG_PRESS_MS) {
      if (occupant) setArmedSeatId(seat.id)
      return
    }
    if (occupant) setMenuTarget(occupant)
  }

  if (loadError) {
    return (
      <main className="flex flex-col min-h-dvh px-6" style={{ paddingTop: 56 }}>
        <p style={{ color: '#ff6b6b', fontSize: 14 }}>{loadError}</p>
        <button className="btn btn-primary" onClick={() => router.push('/operator/login')} style={{ marginTop: 16 }}>로그인하러 가기</button>
        <button className="btn btn-ghost" onClick={() => router.push('/')} style={{ marginTop: 8 }}>홈으로</button>
      </main>
    )
  }

  return (
    <main className="flex flex-col min-h-dvh px-6" style={{ paddingTop: 56, paddingBottom: 60 }}>
      <button onClick={() => router.back()}
        style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--card2)', border: '1px solid var(--border)', color: 'var(--text2)', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginBottom: 24 }}>
        ←
      </button>

      <div style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700, marginBottom: 6, letterSpacing: '0.05em' }}>OPERATOR</p>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>{venueName} 좌석 관리</h1>
      </div>

      {actionError && <p style={{ fontSize: 12, color: '#ff6b6b', marginBottom: 16 }}>{actionError}</p>}

      <div className="card" style={{ padding: 16, marginBottom: 24 }}>
        <p style={{ fontSize: 13, fontWeight: 800, marginBottom: 12 }}>좌석 목록</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {seats.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted2)' }}>등록된 좌석이 없습니다</p>}
          {seats.map(seat => (
            <div key={seat.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 10, background: 'var(--card2)' }}>
              <span style={{ fontSize: 13 }}>{seat.label}</span>
              <button onClick={() => handleDeleteSeat(seat.id)} style={{ color: '#ff6b6b', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer' }}>삭제</button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" value={newSeatLabel} onChange={e => setNewSeatLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddSeat()} placeholder="예: 1번 테이블" maxLength={20} style={{ flex: 1 }} />
          <button className="btn btn-secondary" onClick={handleAddSeat} disabled={addingSeat || !newSeatLabel.trim()} style={{ minHeight: 'auto', padding: '0 16px' }}>추가</button>
        </div>
      </div>

      {session?.status === 'active' && session.code ? (
        <div>
          <p style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>실시간 좌석 현황</p>
          <p style={{ fontSize: 12, color: 'var(--muted2)', marginBottom: 14 }}>
            좌석을 2초 길게 누르면 이동 모드, 짧게 누르면(우클릭) 손님 케어 메뉴가 열려요
          </p>
          {armedSeatId && (
            <div className="card-sm" style={{ padding: '10px 14px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>이동할 좌석을 선택하세요</span>
              <button onClick={() => setArmedSeatId(null)} style={{ fontSize: 12, color: 'var(--muted2)', background: 'none', border: 'none', cursor: 'pointer' }}>취소</button>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {seats.map(seat => {
              const occupant = participants.find(p => p.seat_id === seat.id)
              const occupantHot = occupant ? isOccupantHot(occupant.id, hotReactions, now) : false
              return (
                <div
                  key={seat.id}
                  className="card"
                  onPointerDown={() => startPress(seat, occupant)}
                  onPointerUp={() => handleSeatRelease(seat, occupant)}
                  onPointerLeave={cancelPress}
                  onContextMenu={e => { e.preventDefault(); if (occupant) setMenuTarget(occupant) }}
                  style={{
                    padding: 16, cursor: 'pointer', userSelect: 'none',
                    border: armedSeatId === seat.id ? '2px solid var(--accent)' : '1px solid var(--border)',
                  }}
                >
                  <p style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>{seat.label}</p>
                  {occupant ? (
                    <div>
                      <p style={{ fontSize: 12, color: 'var(--text2)' }}>{occupant.nickname} {occupantHot && '🔥'}</p>
                      {occupant.seat_assigned_at && (
                        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{fmtSeatElapsed(occupant.seat_assigned_at, now)}</p>
                      )}
                    </div>
                  ) : (
                    <p style={{ fontSize: 12, color: 'var(--muted2)' }}>빈 자리</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--muted2)' }}>영업 중이 아니라 실시간 현황은 표시되지 않습니다</p>
      )}

      {menuTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 24 }}>
          <div className="card" style={{ padding: 20, width: '100%', maxWidth: 380 }}>
            <p style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>{menuTarget.nickname}님에게 메시지 보내기</p>
            <textarea
              value={alertMessage}
              onChange={e => setAlertMessage(e.target.value)}
              placeholder="예: 목소리를 조금만 낮춰주세요"
              maxLength={200}
              rows={3}
              className="input"
              style={{ width: '100%', resize: 'none', marginBottom: 12 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => { setMenuTarget(null); setAlertMessage('') }} style={{ flex: 1 }}>취소</button>
              <button className="btn btn-primary" onClick={handleSendAlert} disabled={sendingAlert || !alertMessage.trim()} style={{ flex: 1, opacity: sendingAlert || !alertMessage.trim() ? 0.5 : 1 }}>
                {sendingAlert ? '전송 중...' : '보내기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
