'use client'

import { useCallback, useEffect, useRef, useState, PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent, WheelEvent as ReactWheelEvent } from 'react'

// 자리배치도 캔버스 공용 확대/이동 제스처 (ADR-0008). 한 손가락(또는 마우스) 드래그로 이동,
// 두 손가락 핀치로 확대/축소, 트랙패드는 Ctrl+휠=확대·일반 휠=이동. **확대/축소 버튼은 두지
// 않는다**(ADR-0008 "제스처 전용" 확정).
//
// 손님용 `SeatMap`과 운영자 좌석 관리 툴이 각자 캔버스를 그리지만 조작감은 같아야 해서, 제스처
// 계산만 이 훅에 모으고 렌더링은 각 화면이 담당한다.
export const ZOOM_MIN = 1
export const ZOOM_MAX = 4
// 이보다 적게 움직였으면 드래그가 아니라 탭으로 본다(px)
const DRAG_THRESHOLD_PX = 6

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

export interface ViewportRect {
  x: number
  y: number
  w: number
  h: number
}

export function useZoomPan() {
  // ref 대신 state로 DOM 노드를 들고 있는다 — 이 캔버스들은 로딩 중엔 렌더되지 않다가 나중에
  // 마운트되는 경우가 있어서, 빈 deps `useEffect`+`useRef` 조합으로는 그 늦은 마운트를 놓친다.
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [baseSize, setBaseSize] = useState({ width: 0, height: 0 })
  const [zoom, setZoom] = useState(1)
  const [viewport, setViewport] = useState<ViewportRect>({ x: 0, y: 0, w: 100, h: 100 })
  const [isPanning, setIsPanning] = useState(false)

  const zoomFocusRef = useRef<{ fracX: number; fracY: number } | null>(null)
  const frameRef = useRef<number | null>(null)
  // 활성 포인터 위치 — 개수로 "드래그 이동"(1개)과 "핀치 확대"(2개)를 구분한다
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map())
  const dragStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null)
  const pinchStartRef = useRef<{ distance: number; zoom: number } | null>(null)
  // 이번 제스처가 임계값을 넘는 드래그/핀치였는지 — true면 포인터를 뗄 때 따라오는 click을
  // 좌석 탭으로 오인하면 안 된다(이동한 위치의 엉뚱한 좌석이 선택되는 걸 막는다).
  const draggedRef = useRef(false)

  useEffect(() => {
    if (!container) return
    const measure = () => setBaseSize({ width: container.clientWidth, height: container.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(container)
    return () => ro.disconnect()
  }, [container])

  const contentWidth = baseSize.width * zoom
  const contentHeight = baseSize.height * zoom

  const syncViewport = useCallback(() => {
    if (!container || contentWidth === 0 || contentHeight === 0) return
    setViewport({
      x: (container.scrollLeft / contentWidth) * 100,
      y: (container.scrollTop / contentHeight) * 100,
      w: Math.min(100, (container.clientWidth / contentWidth) * 100),
      h: Math.min(100, (container.clientHeight / contentHeight) * 100),
    })
  }, [container, contentWidth, contentHeight])

  // 배율이 바뀌면 제스처 중심점을 유지하도록 스크롤을 다시 잡는다. 콘텐츠 실제 크기는 zoom이
  // 반영된 다음 렌더에서야 px로 바뀌므로, "어디를 중심으로 확대했는지"를 미리 비율로 저장해뒀다가
  // 여기서 새 크기 기준으로 환산한다.
  useEffect(() => {
    const focus = zoomFocusRef.current
    if (container && focus && contentWidth > 0 && contentHeight > 0) {
      container.scrollLeft = clamp(focus.fracX * contentWidth - container.clientWidth / 2, 0, Math.max(0, contentWidth - container.clientWidth))
      container.scrollTop = clamp(focus.fracY * contentHeight - container.clientHeight / 2, 0, Math.max(0, contentHeight - container.clientHeight))
      zoomFocusRef.current = null
    }
    syncViewport()
  }, [container, contentWidth, contentHeight, syncViewport])

  const zoomAroundPoint = useCallback((nextZoom: number, clientX: number, clientY: number) => {
    const clamped = clamp(Math.round(nextZoom * 100) / 100, ZOOM_MIN, ZOOM_MAX)
    setZoom(prev => {
      if (clamped === prev) return prev
      if (container && contentWidth > 0 && contentHeight > 0) {
        const rect = container.getBoundingClientRect()
        zoomFocusRef.current = {
          fracX: (container.scrollLeft + (clientX - rect.left)) / contentWidth,
          fracY: (container.scrollTop + (clientY - rect.top)) / contentHeight,
        }
      }
      return clamped
    })
  }, [container, contentWidth, contentHeight])

  const pinchInfo = () => {
    const pts = Array.from(pointersRef.current.values())
    if (pts.length < 2) return null
    const [a, b] = pts
    return { distance: Math.hypot(b.x - a.x, b.y - a.y), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2 }
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    // setPointerCapture는 일부러 쓰지 않는다 — 캡처를 걸면 스펙상 이후 이 포인터의 click까지
    // 캡처한 요소로 리타겟되어, 손가락 밑에 있던 좌석 버튼의 onClick이 영영 안 불린다.
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointersRef.current.size === 2) {
      const info = pinchInfo()
      if (info) pinchStartRef.current = { distance: info.distance, zoom }
      dragStartRef.current = null
    } else if (pointersRef.current.size === 1 && container) {
      dragStartRef.current = { x: e.clientX, y: e.clientY, scrollLeft: container.scrollLeft, scrollTop: container.scrollTop }
      setIsPanning(true)
    }
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointersRef.current.size === 2 && pinchStartRef.current && container) {
      const info = pinchInfo()
      if (!info || pinchStartRef.current.distance === 0) return
      draggedRef.current = true
      zoomAroundPoint(pinchStartRef.current.zoom * (info.distance / pinchStartRef.current.distance), info.midX, info.midY)
      return
    }

    if (pointersRef.current.size === 1 && dragStartRef.current && container) {
      const dx = e.clientX - dragStartRef.current.x
      const dy = e.clientY - dragStartRef.current.y
      if (!draggedRef.current && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) draggedRef.current = true
      if (draggedRef.current) {
        container.scrollLeft = clamp(dragStartRef.current.scrollLeft - dx, 0, Math.max(0, contentWidth - container.clientWidth))
        container.scrollTop = clamp(dragStartRef.current.scrollTop - dy, 0, Math.max(0, contentHeight - container.clientHeight))
        syncViewport()
      }
    }
  }

  const endPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(e.pointerId)
    if (pointersRef.current.size < 2) pinchStartRef.current = null
    if (pointersRef.current.size === 0) {
      dragStartRef.current = null
      setIsPanning(false)
      // 한 손가락 드래그 뒤엔 브라우저가 곧 click을 발생시키므로 onClickCapture가 그걸 읽고
      // 지운다. 반면 두 손가락 핀치 뒤엔 click이 아예 발생하지 않아 그 경로로는 절대 안 지워진다
      // — 여기서 한 박자 뒤에 안전망으로 지워야 다음 진짜 탭이 막히지 않는다.
      setTimeout(() => { draggedRef.current = false }, 0)
    }
  }

  const onClickCapture = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (draggedRef.current) {
      e.stopPropagation()
      e.preventDefault()
      draggedRef.current = false
    }
  }

  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    if (!container) return
    if (e.ctrlKey) {
      // 트랙패드 핀치는 브라우저가 Ctrl+휠로 합성해서 보낸다
      zoomAroundPoint(zoom - e.deltaY * 0.01, e.clientX, e.clientY)
      return
    }
    container.scrollLeft = clamp(container.scrollLeft + e.deltaX, 0, Math.max(0, contentWidth - container.clientWidth))
    container.scrollTop = clamp(container.scrollTop + e.deltaY, 0, Math.max(0, contentHeight - container.clientHeight))
    syncViewport()
  }

  const onScroll = () => {
    if (frameRef.current != null) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      syncViewport()
    })
  }

  return {
    /** 스크롤 컨테이너에 붙일 ref (콜백 ref) */
    setContainer,
    /** 스크롤 컨테이너에 펼쳐 넣을 이벤트 핸들러 */
    handlers: { onPointerDown, onPointerMove, onPointerUp: endPointer, onPointerCancel: endPointer, onClickCapture, onWheel, onScroll },
    /** 확대 배율이 반영된 내부 콘텐츠 크기(px). 0이면 아직 측정 전이라 '100%'로 두면 된다 */
    contentWidth,
    contentHeight,
    /** 미니맵에 그릴 현재 보이는 영역 (캔버스 대비 0~100%) */
    viewport,
    zoom,
    isPanning,
    /**
     * 방금 제스처가 화면 이동/확대였는지. 캔버스 위 요소가 pointerup으로 자체 동작(예: 운영자
     * 롱프레스 메뉴)을 하는 경우, 이게 true면 그 동작을 건너뛰어야 한다 — 이동하려고 끈 것이지
     * 그 요소를 누른 게 아니기 때문.
     */
    wasDragged: () => draggedRef.current,
  }
}
