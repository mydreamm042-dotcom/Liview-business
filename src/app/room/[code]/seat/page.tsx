'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { getRoomData, getSessionToken, isPreviewingAsGuest, clearPreviewAsGuest } from '@/lib/session'
import { useRoom } from '@/hooks/useRoom'
import SeatMap from '@/components/SeatMap'
import LoadingScreen from '@/components/LoadingScreen'
import InlineMessage from '@/components/InlineMessage'

// 전용 좌석 선택 화면 (ADR-0001). QR 입장 직후 참여자는 방 화면으로 바로 가지 않고 이 화면을
// 먼저 거친다. 좌석 탭 = 가선택(하이라이트), 화면 하단 "선택완료" 버튼 = 확정의 2단계 흐름이다
// (ADR-0007로 ADR-0001의 "탭 즉시 확정"에서 변경) — 버튼을 눌러야 비로소 "방 입장"이 완료
// 처리되고, 그 다음에야 방 화면(4탭)이 열린다. 확정 전엔 다른 좌석을 다시 탭해 가선택을 바꿀
// 수 있다. 자리배치도를 화면 대부분에 크게 그려서, 손님이 실제 매장 구조를 보고 자기 자리를
// 찾게 한다 — 확대/이동과 미니맵은 `SeatMap`에 내장돼 있다(ADR-0008).
export default function SeatSelectPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  const router = useRouter()
  const roomData = getRoomData()

  const [pendingSeatId, setPendingSeatId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!roomData || roomData.roomCode !== code) router.replace(`/room/${code}`)
  }, [code, roomData, router])

  const { state } = useRoom(roomData?.roomId ?? '', code)

  const myParticipantId = roomData?.participantId
  const me = state.participants.find(p => p.id === myParticipantId)
  // 개발자 미리보기(/dev/rooms) 중이면 실제로 운영자여도 손님 취급한다 — 방 화면과 동일한
  // 원칙(src/app/room/[code]/page.tsx의 effectiveIsHost 주석 참고).
  const previewingAsGuest = isPreviewingAsGuest()
  const effectiveIsHost = state.isHost && !previewingAsGuest

  // 이미 좌석이 있거나(재입장 등), 운영자이거나, 매장이 좌석을 아예 등록 안 했으면 이 화면은
  // 지나칠 단계가 없다 — 방 화면으로 곧장 보낸다. 방 화면 쪽 게이트와 정확히 반대 조건이라
  // 둘 사이에서 리다이렉트가 무한히 왕복하지 않는다. 첫 로딩이 끝나기 전에는 판단하지
  // 않는다(좌석 목록이 아직 비어 있는 것과 "좌석이 없는 매장"을 구분해야 한다).
  const passesGate = state.initialLoaded && (!!me?.seat_id || effectiveIsHost || state.seats.length === 0)
  useEffect(() => {
    if (passesGate) router.replace(`/room/${code}`)
  }, [passesGate, code, router])

  // 좌석 탭은 가선택만 바꾼다 — 서버 호출은 "선택완료"에서만 (ADR-0007)
  const handleTapSeat = (seatId: string) => {
    if (confirming) return
    setError('')
    setPendingSeatId(prev => (prev === seatId ? null : seatId))
  }

  const handleConfirm = async () => {
    if (!myParticipantId || !pendingSeatId || confirming) return
    setConfirming(true)
    setError('')
    try {
      const res = await fetch('/api/participants/seat', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participant_id: myParticipantId, session_token: getSessionToken(), seat_id: pendingSeatId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      // 좌석 확정 = 방 입장 완료 (ADR-0007). 폴링이 내 좌석을 반영할 때까지 기다리지 않고
      // 바로 넘긴다 — 방 화면도 같은 조건으로 게이트하므로 도착 시점엔 이미 통과 상태다.
      router.replace(`/room/${code}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '좌석 선택에 실패했습니다')
      setConfirming(false)
    }
  }

  if (!roomData) return <LoadingScreen />
  if (!state.initialLoaded) return <LoadingScreen />
  if (passesGate) return <LoadingScreen />

  const pendingSeat = state.seats.find(s => s.id === pendingSeatId)

  return (
    <main style={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      {previewingAsGuest && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 10, padding: '8px 16px',
          background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span>👁 손님 화면 미리보기 중 (실제로는 운영자)</span>
          <button onClick={() => { clearPreviewAsGuest(); window.location.reload() }}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 6, color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 10px', cursor: 'pointer' }}>
            미리보기 종료
          </button>
        </div>
      )}
      <header style={{ padding: '52px 20px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 20 }}>
          <span style={{ width: 9, height: 9, borderRadius: 999, background: 'var(--accent)' }} />
          <span style={{ fontSize: 15, fontWeight: 800 }}>LIview</span>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>
          {state.venue?.name ?? '매장'}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--muted2)' }}>
          앉으신 자리를 선택한 뒤 아래 &quot;선택완료&quot;를 눌러주세요
        </p>
      </header>

      {error && <div style={{ padding: '8px 20px 0' }}><InlineMessage type="error">{error}</InlineMessage></div>}

      {/* 자리배치도를 남은 세로 공간 전체에 크게 그린다 — 이 화면의 목적 자체가 좌석 선택이라
          방 화면(상단에 작게 얹는 방식)과 달리 화면을 다 내준다. */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <SeatMap
          seats={state.seats}
          participants={state.participants}
          hotReactions={state.reactions.filter(r => r.type === 'hot')}
          now={Date.now()}
          myParticipantId={myParticipantId}
          height="100%"
          layoutItems={state.layoutItems}
          onSeatClick={seat => handleTapSeat(seat.id)}
          seatDisabled={(seat, occupant) => !!occupant || confirming}
          selectedSeatId={pendingSeatId}
        />
      </div>

      {/* 하단 고정 확정 바 — 가선택된 좌석이 없으면 비활성화 (ADR-0007) */}
      <div style={{ padding: '12px 20px max(16px, env(safe-area-inset-bottom))', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginBottom: 10 }}>
          {pendingSeat
            ? `${pendingSeat.label}번 좌석을 선택했어요 — 다른 자리를 다시 눌러 바꿀 수 있어요`
            : '어두운 자리는 이미 다른 손님이 앉아 있어요'}
        </p>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!pendingSeatId || confirming}
          onClick={handleConfirm}
          style={{ opacity: pendingSeatId ? 1 : 0.4 }}
        >
          {confirming ? '입장하는 중…' : '선택완료'}
        </button>
      </div>
    </main>
  )
}
