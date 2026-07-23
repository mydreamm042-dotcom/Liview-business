'use client'

import { useEffect, useRef, useState, ReactNode, PointerEvent as ReactPointerEvent } from 'react'

// 제스처 기반 드래그 바텀시트 (Phase 9, 홈 지도). snapPoints는 "바닥에서부터 보이는 높이(px)"의
// 오름차순 배열이다. 손가락으로 끌어올리면 더 큰 스냅으로, 내리면 더 작은 스냅으로 붙는다.
// 사용자 요구: "다 올리면 (지도가) 사라지고, 내려가 있으면 계속 있어" — 가장 큰 스냅이 전체
// 화면을 덮는 랭킹 뷰(지도 가려짐), 기본 스냅은 지도 위에 살짝 걸친 peek 상태다.
export default function DraggableBottomSheet({
  snapPoints,
  initialSnap = 0,
  snapIndex,
  onSnapChange,
  children,
  header,
  bottomOffset = 0,
  floating,
}: {
  snapPoints: number[]
  initialSnap?: number
  // 외부(탭바 등)에서 스냅을 제어할 때 사용하는 목표 인덱스. 값이 바뀌면 그 스냅으로 애니메이션.
  snapIndex?: number
  onSnapChange?: (index: number) => void
  children: ReactNode
  // 드래그 핸들 아래 항상 보이는 고정 헤더(peek 상태에서도 보이는 제목 영역)
  header?: ReactNode
  // 하단 탭바 등에 가리지 않도록 시트 바닥을 그만큼 띄운다
  bottomOffset?: number
  // 시트 우상단(시트 top 바로 위)에 붙어 시트와 함께 움직이는 버튼 — 현위치 버튼 등.
  // 시트가 거의 full로 올라가면 자동으로 숨긴다(상단 검색바와 겹침 방지).
  floating?: ReactNode
}) {
  const sorted = [...snapPoints].sort((a, b) => a - b)
  const maxSnap = sorted[sorted.length - 1]
  const minSnap = sorted[0]

  const [visible, setVisible] = useState(sorted[Math.min(initialSnap, sorted.length - 1)])
  const [dragging, setDragging] = useState(false)
  const dragState = useRef<{ startY: number; startVisible: number } | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const atFull = visible >= maxSnap - 1

  // 외부 제어: snapIndex prop이 바뀌면 해당 스냅으로 이동한다 (드래그와 별개 경로).
  useEffect(() => {
    if (snapIndex === undefined) return
    const target = sorted[Math.max(0, Math.min(snapIndex, sorted.length - 1))]
    setVisible(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapIndex])

  const snapTo = (height: number) => {
    // 가장 가까운 스냅 포인트로 붙인다
    let nearest = sorted[0]
    let best = Infinity
    for (const s of sorted) {
      const d = Math.abs(s - height)
      if (d < best) { best = d; nearest = s }
    }
    setVisible(nearest)
    onSnapChange?.(sorted.indexOf(nearest))
  }

  const beginDrag = (clientY: number) => {
    dragState.current = { startY: clientY, startVisible: visible }
    setDragging(true)
  }
  const moveSheet = (clientY: number) => {
    if (!dragState.current) return
    const delta = clientY - dragState.current.startY
    // 아래로 끌면(delta>0) 보이는 높이가 줄고, 위로 끌면 늘어난다
    setVisible(Math.max(minSnap, Math.min(maxSnap, dragState.current.startVisible - delta)))
  }
  const endDrag = () => {
    if (!dragState.current) return
    dragState.current = null
    setDragging(false)
    snapTo(visible)
  }

  // 핸들/헤더 영역 — 항상 시트를 드래그한다 (포인터 캡처로 안정적으로).
  const onHandleDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    beginDrag(e.clientY)
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onHandleMove = (e: ReactPointerEvent<HTMLDivElement>) => moveSheet(e.clientY)

  // 본문 영역 — full이 아닐 때는 본문 전체가 드래그 면적이 된다(카카오/네이버처럼 넓게).
  // full일 때만 본문이 스크롤되고, 스크롤 최상단에서 아래로 끌면 시트가 접힌다.
  const onBodyDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    beginDrag(e.clientY)
    if (!atFull) (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onBodyMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return
    const delta = e.clientY - dragState.current.startY
    if (atFull) {
      const st = bodyRef.current?.scrollTop ?? 0
      // full 상태에서 내용이 스크롤돼 있거나 위로 끌어올리는 중이면 네이티브 스크롤에 맡긴다
      if (st > 0 || delta < 0) return
    }
    moveSheet(e.clientY)
  }

  // 화면 리사이즈 등으로 스냅 배열이 바뀌면 현재 값을 범위 안으로 다시 보정
  useEffect(() => {
    setVisible(v => Math.max(minSnap, Math.min(maxSnap, v)))
  }, [minSnap, maxSnap])

  const floatingHidden = visible > maxSnap * 0.82

  return (
    <>
      {/* 시트 top 바로 위에 붙어 시트와 함께 움직이는 플로팅 버튼 (overflow:hidden 시트 바깥에
          별도 렌더해야 잘리지 않는다). full 근처에서는 숨긴다. */}
      {floating && (
        <div style={{
          position: 'absolute', right: 16, bottom: bottomOffset + visible + 12, zIndex: 29,
          transition: dragging ? 'none' : 'bottom 0.32s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s',
          opacity: floatingHidden ? 0 : 1, pointerEvents: floatingHidden ? 'none' : 'auto',
        }}>
          {floating}
        </div>
      )}
    <div
      style={{
        position: 'absolute', left: 0, right: 0, bottom: bottomOffset, zIndex: 30,
        height: maxSnap,
        transform: `translateY(${maxSnap - visible}px)`,
        transition: dragging ? 'none' : 'transform 0.32s cubic-bezier(0.16, 1, 0.3, 1)',
        background: 'var(--bg)',
        borderRadius: '20px 20px 0 0',
        boxShadow: '0 -12px 32px rgba(0,0,0,0.5)',
        border: '1px solid var(--border)',
        borderBottom: 'none',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* 드래그 핸들 — 항상 시트를 드래그하는 확실한 손잡이. 이 좁은 영역만 touchAction:none
          (안에 스크롤할 콘텐츠가 없어 안전). */}
      <div
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{ padding: header ? '10px 20px 0' : '10px 20px 6px', cursor: 'grab', flexShrink: 0, touchAction: 'none' }}
      >
        <div style={{ width: 40, height: 5, borderRadius: 999, background: 'var(--muted)', margin: '0 auto' }} />
      </div>

      {/* 고정 헤더 — 핸들과 동일하게 touchAction:none으로 브라우저 기본 제스처(뷰포트 축소/
          당겨서 새로고침 등)를 완전히 막는다. 헤더 안에 가로 스크롤 콘텐츠(카테고리 칩 등)가
          있으면 그 요소는 네이티브 스크롤 대신 자체 포인터 드래그로 스크롤을 구현해야 한다 —
          touch-action은 조상 중 하나라도 none이면 자식이 pan-x를 선언해도 무시되기 때문
          (CSS Touch Action 스펙: 조상 체인의 교집합). */}
      {header && (
        <div
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{ padding: '12px 20px 0', cursor: 'grab', flexShrink: 0, touchAction: 'none' }}
        >
          {header}
        </div>
      )}

      {/* 본문 — full이 아니면 본문 전체가 드래그 면적(스크롤 잠금), full이면 스크롤 */}
      <div
        ref={bodyRef}
        onPointerDown={onBodyDown}
        onPointerMove={onBodyMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{
          flex: 1, overflowY: atFull ? 'auto' : 'hidden', overscrollBehavior: 'contain',
          padding: '0 0 24px', touchAction: atFull ? 'pan-y' : 'none', cursor: 'grab',
        }}
      >
        {children}
      </div>
    </div>
    </>
  )
}
