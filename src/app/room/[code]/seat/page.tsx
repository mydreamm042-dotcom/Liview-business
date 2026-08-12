'use client'

import { useEffect, useState, useRef, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import { getRoomData, getSessionToken, isPreviewingAsGuest, clearPreviewAsGuest } from '@/lib/session'
import { useRoom } from '@/hooks/useRoom'
import SeatMap from '@/components/SeatMap'
import SeatMiniMap from '@/components/SeatMiniMap'
import LoadingScreen from '@/components/LoadingScreen'
import InlineMessage from '@/components/InlineMessage'

// 좌석 선택 화면 확대 배율 범위/미니맵 크기 (ADR-0007, VARIABLES.md "Seating" 참고)
const ZOOM_MIN = 1
const ZOOM_MAX = 2.5
const ZOOM_STEP = 0.5
const MINIMAP_WIDTH = 104

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

// 전용 좌석 선택 화면 (ADR-0001). QR 입장 직후 참여자는 방 화면으로 바로 가지 않고 이 화면을
// 먼저 거친다. 좌석 탭 = 가선택(하이라이트), 화면 하단 "선택완료" 버튼 = 확정의 2단계 흐름이다
// (ADR-0007로 ADR-0001의 "탭 즉시 확정"에서 변경) — 버튼을 눌러야 비로소 "방 입장"이 완료
// 처리되고, 그 다음에야 방 화면(4탭)이 열린다. 확정 전엔 다른 좌석을 다시 탭해 가선택을 바꿀
// 수 있다. 자리배치도를 화면 대부분에 크게 그려서, 손님이 실제 매장 구조를 보고 자기 자리를
// 찾게 한다. 우측 상단 미니맵은 배치 규모와 무관하게 항상 떠 있어, 확대/스크롤 중에도 전체
// 배치에서의 위치 감을 잃지 않게 한다.
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

  // ---------- 스크롤/확대 뷰포트 (ADR-0007 미니맵) ----------
  // 메인 캔버스를 감싸는 스크롤 컨테이너. 확대 배율만큼 내부 콘텐츠를 실제로 키워서
  // overflow:auto가 자연스럽게 스크롤(패닝)을 처리하게 한다 — 별도 제스처 핸들러 없이도
  // 미니맵의 뷰포트 사각형을 scrollLeft/Top으로 그대로 계산할 수 있다.
  // ref 대신 state로 DOM 노드를 들고 있는다 — 이 화면은 로딩 중엔 <LoadingScreen/>만 그리다가
  // (state.initialLoaded==false) 나중에야 실제 캔버스가 마운트되므로, 마운트 시 한 번만 도는
  // 빈 deps 배열의 useEffect+useRef 조합으로는 그 늦은 마운트를 놓친다. state로 들면 노드가
  // 실제로 붙는 순간 컴포넌트가 다시 렌더되어 아래 effect가 정확히 그 시점에 잡힌다.
  const [viewportEl, setViewportEl] = useState<HTMLDivElement | null>(null)
  const [baseSize, setBaseSize] = useState({ width: 0, height: 0 })
  const [zoom, setZoom] = useState(1)
  const [viewportRect, setViewportRect] = useState({ x: 0, y: 0, w: 100, h: 100 })
  const zoomCenterRef = useRef<{ fracX: number; fracY: number } | null>(null)
  const scrollFrameRef = useRef<number | null>(null)

  useEffect(() => {
    if (!viewportEl) return
    const measure = () => setBaseSize({ width: viewportEl.clientWidth, height: viewportEl.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(viewportEl)
    return () => ro.disconnect()
  }, [viewportEl])

  const contentWidth = baseSize.width * zoom
  const contentHeight = baseSize.height * zoom

  const updateViewportRect = useCallback(() => {
    if (!viewportEl || contentWidth === 0 || contentHeight === 0) return
    setViewportRect({
      x: (viewportEl.scrollLeft / contentWidth) * 100,
      y: (viewportEl.scrollTop / contentHeight) * 100,
      w: Math.min(100, (viewportEl.clientWidth / contentWidth) * 100),
      h: Math.min(100, (viewportEl.clientHeight / contentHeight) * 100),
    })
  }, [viewportEl, contentWidth, contentHeight])

  // 줌이 바뀌면(혹은 화면 크기가 바뀌면), 줌 버튼을 누르기 전 보고 있던 중심점을 유지하며
  // 스크롤 위치를 다시 잡고 뷰포트 사각형을 새로 계산한다.
  useEffect(() => {
    const center = zoomCenterRef.current
    if (viewportEl && center && contentWidth > 0 && contentHeight > 0) {
      viewportEl.scrollLeft = clamp(center.fracX * contentWidth - viewportEl.clientWidth / 2, 0, Math.max(0, contentWidth - viewportEl.clientWidth))
      viewportEl.scrollTop = clamp(center.fracY * contentHeight - viewportEl.clientHeight / 2, 0, Math.max(0, contentHeight - viewportEl.clientHeight))
      zoomCenterRef.current = null
    }
    updateViewportRect()
  }, [viewportEl, contentWidth, contentHeight, updateViewportRect])

  const handleScroll = () => {
    if (scrollFrameRef.current != null) return
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null
      updateViewportRect()
    })
  }

  const handleZoom = (delta: number) => {
    const next = clamp(Math.round((zoom + delta) * 10) / 10, ZOOM_MIN, ZOOM_MAX)
    if (next === zoom) return
    if (viewportEl && contentWidth > 0 && contentHeight > 0) {
      zoomCenterRef.current = {
        fracX: (viewportEl.scrollLeft + viewportEl.clientWidth / 2) / contentWidth,
        fracY: (viewportEl.scrollTop + viewportEl.clientHeight / 2) / contentHeight,
      }
    }
    setZoom(next)
  }

  // ---------- 좌석 가선택 / 확정 (ADR-0007) ----------
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
  // 미니맵이 메인 캔버스와 같은 가로세로 비율을 갖도록 계산 — 그래야 뷰포트 사각형의 크기/
  // 위치가 실제 화면과 어긋나지 않는다. 측정 전(첫 렌더)엔 4:3 정도로 대충 맞춰둔다.
  const minimapHeight = baseSize.width > 0
    ? Math.round(clamp(MINIMAP_WIDTH * (baseSize.height / baseSize.width), 60, 160))
    : Math.round(MINIMAP_WIDTH * 0.75)

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
          방 화면(상단에 작게 얹는 방식)과 달리 화면을 다 내준다. 확대 중엔 이 안에서 스크롤한다. */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <div
          ref={setViewportEl}
          onScroll={handleScroll}
          style={{ width: '100%', height: '100%', overflow: 'auto', position: 'relative', touchAction: 'pan-x pan-y' }}
        >
          <div style={{ width: contentWidth || '100%', height: contentHeight || '100%' }}>
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
        </div>

        {/* 미니맵 — 배치 규모와 무관하게 항상 표시(ADR-0007). 뷰포트 사각형이 현재 확대/스크롤
            범위를 보여준다. 이 오버레이 영역 밑에 실제 좌석이 깔려 있을 수 있어(캔버스 우상단
            근처 좌석) 감싸는 박스 자체는 클릭을 가로채지 않게 하고, 확대/축소 버튼만 다시
            pointerEvents:auto로 켠다. */}
        <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, pointerEvents: 'none' }}>
          <SeatMiniMap
            seats={state.seats}
            layoutItems={state.layoutItems}
            participants={state.participants}
            selectedSeatId={pendingSeatId}
            viewport={viewportRect}
            width={MINIMAP_WIDTH}
            height={minimapHeight}
          />
          <div style={{ display: 'flex', gap: 4, pointerEvents: 'auto' }}>
            <button type="button" onClick={() => handleZoom(-ZOOM_STEP)} disabled={zoom <= ZOOM_MIN} aria-label="지도 축소"
              style={{
                width: 30, height: 30, borderRadius: 999, background: 'var(--card2)', border: '1px solid var(--border)',
                color: 'var(--text2)', fontSize: 16, fontWeight: 700, cursor: zoom <= ZOOM_MIN ? 'default' : 'pointer',
                opacity: zoom <= ZOOM_MIN ? 0.4 : 1, lineHeight: 1,
              }}>
              −
            </button>
            <button type="button" onClick={() => handleZoom(ZOOM_STEP)} disabled={zoom >= ZOOM_MAX} aria-label="지도 확대"
              style={{
                width: 30, height: 30, borderRadius: 999, background: 'var(--card2)', border: '1px solid var(--border)',
                color: 'var(--text2)', fontSize: 16, fontWeight: 700, cursor: zoom >= ZOOM_MAX ? 'default' : 'pointer',
                opacity: zoom >= ZOOM_MAX ? 0.4 : 1, lineHeight: 1,
              }}>
              +
            </button>
          </div>
        </div>
      </div>

      {/* 하단 고정 확정 바 — 가선택된 좌석이 없으면 비활성화(ADR-0007) */}
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
