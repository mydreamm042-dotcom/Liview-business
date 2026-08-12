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
const MINIMAP_WIDTH = 104
// 드래그가 아니라 탭이라고 판단할 포인터 이동 허용 오차(px)
const DRAG_THRESHOLD_PX = 6

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

  // ---------- 스크롤/확대 뷰포트 (ADR-0007 미니맵, 제스처는 2026-08-12 갱신) ----------
  // 메인 캔버스를 감싸는 컨테이너. 확대 배율만큼 내부 콘텐츠를 실제로 키우고, 이동/확대는
  // 브라우저 기본 스크롤이 아니라 Pointer Events로 직접 구현한다 — 한 손가락(혹은 마우스)
  // 드래그로 이동, 두 손가락 핀치로 확대/축소. 그래야 확대 중에도 핀치 중심점을 고정할 수
  // 있고, 마우스 드래그 이동(터치 없는 데스크톱)까지 같은 코드로 처리된다.
  // ref 대신 state로 DOM 노드를 들고 있는다 — 이 화면은 로딩 중엔 <LoadingScreen/>만 그리다가
  // (state.initialLoaded==false) 나중에야 실제 캔버스가 마운트되므로, 마운트 시 한 번만 도는
  // 빈 deps 배열의 useEffect+useRef 조합으로는 그 늦은 마운트를 놓친다. state로 들면 노드가
  // 실제로 붙는 순간 컴포넌트가 다시 렌더되어 아래 effect가 정확히 그 시점에 잡힌다.
  const [viewportEl, setViewportEl] = useState<HTMLDivElement | null>(null)
  const [baseSize, setBaseSize] = useState({ width: 0, height: 0 })
  const [zoom, setZoom] = useState(1)
  const [viewportRect, setViewportRect] = useState({ x: 0, y: 0, w: 100, h: 100 })
  const [isPanning, setIsPanning] = useState(false)
  const zoomFocusRef = useRef<{ fracX: number; fracY: number } | null>(null)
  const scrollFrameRef = useRef<number | null>(null)
  // 활성 포인터(터치/마우스) 위치 — 개수로 "드래그 이동"(1개)과 "핀치 확대"(2개)를 구분한다
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map())
  const dragStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null)
  const pinchStartRef = useRef<{ distance: number; zoom: number } | null>(null)
  // 이번 제스처가 임계값을 넘는 드래그/핀치로 판정됐는지 — true면 포인터를 뗄 때 발생하는
  // click을 좌석 탭으로 오인하지 않게 막아야 한다(안 그러면 스크롤된 위치의 다른 좌석이
  // 실수로 선택된다).
  const draggedRef = useRef(false)

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

  // 줌이 바뀌면(핀치/휠 확대 또는 화면 크기 변화), 제스처 중심점을 유지하며 스크롤 위치를
  // 다시 잡고 뷰포트 사각형을 새로 계산한다. 콘텐츠 크기는 zoom state가 반영된 다음 렌더에서만
  // 실제 px로 바뀌므로, "어디를 중심으로 확대했는지"를 미리 fraction으로 저장해뒀다가 여기서
  // 새 크기 기준으로 스크롤을 계산한다.
  useEffect(() => {
    const focus = zoomFocusRef.current
    if (viewportEl && focus && contentWidth > 0 && contentHeight > 0) {
      viewportEl.scrollLeft = clamp(focus.fracX * contentWidth - viewportEl.clientWidth / 2, 0, Math.max(0, contentWidth - viewportEl.clientWidth))
      viewportEl.scrollTop = clamp(focus.fracY * contentHeight - viewportEl.clientHeight / 2, 0, Math.max(0, contentHeight - viewportEl.clientHeight))
      zoomFocusRef.current = null
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

  // 클라이언트 좌표(px)를 "콘텐츠 기준 0~1 비율"로 바꾼다 — 핀치/휠 확대의 중심점을 잡을 때 쓴다.
  const clientPointToContentFrac = (clientX: number, clientY: number) => {
    if (!viewportEl || contentWidth === 0 || contentHeight === 0) return null
    const rect = viewportEl.getBoundingClientRect()
    return {
      fracX: (viewportEl.scrollLeft + (clientX - rect.left)) / contentWidth,
      fracY: (viewportEl.scrollTop + (clientY - rect.top)) / contentHeight,
    }
  }

  const setZoomAroundClientPoint = (nextZoom: number, clientX: number, clientY: number) => {
    const clamped = clamp(Math.round(nextZoom * 100) / 100, ZOOM_MIN, ZOOM_MAX)
    if (clamped === zoom) return
    const focus = clientPointToContentFrac(clientX, clientY)
    if (focus) zoomFocusRef.current = focus
    setZoom(clamped)
  }

  const pinchInfo = () => {
    const pts = Array.from(pointersRef.current.values())
    if (pts.length < 2) return null
    const [a, b] = pts
    return { distance: Math.hypot(b.x - a.x, b.y - a.y), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2 }
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    // 일부러 setPointerCapture를 안 쓴다 — 캡처를 걸면 이후 이 포인터의 click까지 캡처한
    // 요소로 강제 리타겟되어(스펙 동작), 정작 손가락 밑에 있던 좌석 버튼은 이벤트 경로에서
    // 아예 빠지고 onClick이 영영 안 불린다(좌석 탭 자체가 막히는 심각한 부작용이라 캡처보다
    // 손해가 크다). 캔버스가 화면 대부분을 차지해서, 캡처 없이도 화면 밖으로 손가락이
    // 나가는 흔치 않은 경우 정도만 이동이 멈추는 수준의 사소한 손실이다.
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointersRef.current.size === 2) {
      const info = pinchInfo()
      if (info) pinchStartRef.current = { distance: info.distance, zoom }
      dragStartRef.current = null
    } else if (pointersRef.current.size === 1 && viewportEl) {
      dragStartRef.current = { x: e.clientX, y: e.clientY, scrollLeft: viewportEl.scrollLeft, scrollTop: viewportEl.scrollTop }
      setIsPanning(true)
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    // 두 손가락 = 핀치 확대/축소. 두 점의 거리 변화 비율만큼 배율을 바꾸고, 두 손가락의
    // 중점이 화면에서 그대로 유지되도록 스크롤을 보정한다.
    if (pointersRef.current.size === 2 && pinchStartRef.current && viewportEl) {
      const info = pinchInfo()
      if (!info || pinchStartRef.current.distance === 0) return
      draggedRef.current = true
      const ratio = info.distance / pinchStartRef.current.distance
      setZoomAroundClientPoint(pinchStartRef.current.zoom * ratio, info.midX, info.midY)
      return
    }

    // 한 손가락(또는 마우스 버튼을 누른 채) 이동 = 화면 이동(패닝)
    if (pointersRef.current.size === 1 && dragStartRef.current && viewportEl) {
      const dx = e.clientX - dragStartRef.current.x
      const dy = e.clientY - dragStartRef.current.y
      if (!draggedRef.current && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) draggedRef.current = true
      if (draggedRef.current) {
        const maxScrollX = Math.max(0, contentWidth - viewportEl.clientWidth)
        const maxScrollY = Math.max(0, contentHeight - viewportEl.clientHeight)
        viewportEl.scrollLeft = clamp(dragStartRef.current.scrollLeft - dx, 0, maxScrollX)
        viewportEl.scrollTop = clamp(dragStartRef.current.scrollTop - dy, 0, maxScrollY)
      }
    }
  }

  const endPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(e.pointerId)
    if (pointersRef.current.size < 2) pinchStartRef.current = null
    if (pointersRef.current.size === 0) {
      dragStartRef.current = null
      setIsPanning(false)
      // 한 손가락(또는 마우스) 드래그 뒤엔 브라우저가 곧바로 click을 발생시키므로 그때
      // draggedRef를 읽어서 지워야(handleClickCapture) 그 click을 좌석 탭으로 오인하지 않는다.
      // 반면 두 손가락 핀치는 손을 떼도 click이 아예 발생하지 않아 그 경로로는 절대
      // draggedRef가 지워지지 않는다 — setTimeout(0)으로 "이번 인터랙션에서 올 수 있는 click은
      // 이미 다 처리됐다" 시점까지 미뤄서 안전망으로 한 번 더 지운다(click이 먼저 왔다면 이미
      // false라 아무 효과 없음).
      setTimeout(() => { draggedRef.current = false }, 0)
    }
  }

  // 방금 드래그/핀치를 했다면 그 직후에 브라우저가 발생시키는 click은 좌석 탭이 아니라
  // 제스처의 잔여물이다 — 캡처 단계에서 막아 실제 좌석 버튼까지 전파되지 않게 한다.
  const handleClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggedRef.current) {
      e.stopPropagation()
      e.preventDefault()
      draggedRef.current = false
    }
  }

  // 트랙패드: 두 손가락 스크롤 = 패닝, (브라우저가 합성하는) Ctrl+휠 = 핀치 확대와 동일하게 처리
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!viewportEl) return
    if (e.ctrlKey) {
      e.preventDefault()
      setZoomAroundClientPoint(zoom - e.deltaY * 0.01, e.clientX, e.clientY)
      return
    }
    const maxScrollX = Math.max(0, contentWidth - viewportEl.clientWidth)
    const maxScrollY = Math.max(0, contentHeight - viewportEl.clientHeight)
    viewportEl.scrollLeft = clamp(viewportEl.scrollLeft + e.deltaX, 0, maxScrollX)
    viewportEl.scrollTop = clamp(viewportEl.scrollTop + e.deltaY, 0, maxScrollY)
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
          방 화면(상단에 작게 얹는 방식)과 달리 화면을 다 내준다. 한 손가락/마우스 드래그로
          이동, 두 손가락 핀치로 확대/축소한다(브라우저 기본 스크롤 대신 직접 구현 — 핀치 중심점
          고정과 마우스 드래그를 같은 코드로 처리하기 위해). */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <div
          ref={setViewportEl}
          onScroll={handleScroll}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onClickCapture={handleClickCapture}
          onWheel={handleWheel}
          style={{
            width: '100%', height: '100%', overflow: 'hidden', position: 'relative',
            touchAction: 'none', cursor: isPanning ? 'grabbing' : zoom > ZOOM_MIN ? 'grab' : 'default',
          }}
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

        {/* 미니맵 — 배치 규모와 무관하게 항상 표시(ADR-0007). 뷰포트 사각형이 현재 확대/이동
            범위를 보여준다. 순수 표시용이라 pointerEvents:none — 이 오버레이 밑에 실제 좌석이
            깔려 있어도(캔버스 우상단 근처 좌석) 탭/드래그가 그대로 통과한다. */}
        <div style={{ position: 'absolute', top: 12, right: 12, pointerEvents: 'none' }}>
          <SeatMiniMap
            seats={state.seats}
            layoutItems={state.layoutItems}
            participants={state.participants}
            selectedSeatId={pendingSeatId}
            viewport={viewportRect}
            width={MINIMAP_WIDTH}
            height={minimapHeight}
          />
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
