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
}) {
  const sorted = [...snapPoints].sort((a, b) => a - b)
  const maxSnap = sorted[sorted.length - 1]
  const minSnap = sorted[0]

  const [visible, setVisible] = useState(sorted[Math.min(initialSnap, sorted.length - 1)])
  const [dragging, setDragging] = useState(false)
  const dragState = useRef<{ startY: number; startVisible: number } | null>(null)

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

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragState.current = { startY: e.clientY, startVisible: visible }
    setDragging(true)
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return
    const delta = e.clientY - dragState.current.startY
    // 아래로 끌면(delta>0) 보이는 높이가 줄고, 위로 끌면 늘어난다
    const next = Math.max(minSnap, Math.min(maxSnap, dragState.current.startVisible - delta))
    setVisible(next)
  }

  const endDrag = () => {
    if (!dragState.current) return
    dragState.current = null
    setDragging(false)
    snapTo(visible)
  }

  // 화면 리사이즈 등으로 스냅 배열이 바뀌면 현재 값을 범위 안으로 다시 보정
  useEffect(() => {
    setVisible(v => Math.max(minSnap, Math.min(maxSnap, v)))
  }, [minSnap, maxSnap])

  return (
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
        touchAction: 'none',
        overflow: 'hidden',
      }}
    >
      {/* 드래그 핸들 + 고정 헤더 — 이 영역에서만 제스처를 받는다 (내부 스크롤과 충돌 방지) */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{ padding: '10px 20px 0', cursor: 'grab', flexShrink: 0 }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 999, background: 'var(--muted)', margin: '0 auto 12px' }} />
        {header}
      </div>

      {/* 스크롤 가능한 본문 */}
      <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', padding: '0 0 24px' }}>
        {children}
      </div>
    </div>
  )
}
