'use client'

import { Participant, VenueLayoutItem, VenueSeat } from '@/lib/supabase/types'
import { ViewportRect } from '@/hooks/useZoomPan'
import { shapeStyle, lineStyle } from './LayoutItemShape'

// 자리배치도 미니맵 (ADR-0007/0008). 메인 캔버스와 동일한 0~100% 좌표를 그대로 재사용해 배치를
// 점/도형으로 축소해 그리고, 지금 보고 있는 범위를 사각형으로 겹쳐 표시한다. 배치 규모와 무관하게
// 항상 표시한다(ADR-0007 "미니맵 항상 표시").
//
// 순수 표시용이라 pointerEvents:none — 이 오버레이 밑에 실제 좌석이 깔려 있어도 탭/드래그가
// 그대로 통과한다. 배경도 반투명이라 가려진 좌석이 비쳐 보인다.
export default function CanvasMiniMap({
  seats, layoutItems, participants = [], highlightSeatId, viewport, width, height,
}: {
  seats: VenueSeat[]
  layoutItems: VenueLayoutItem[]
  participants?: Participant[]
  /** 가선택/선택 중인 좌석 — 메인 캔버스와 같은 강조색으로 표시 */
  highlightSeatId?: string | null
  viewport: ViewportRect
  width: number
  height: number
}) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'relative', width, height, borderRadius: 10, overflow: 'hidden',
        background: 'rgba(28,28,28,0.82)', border: '1px solid var(--border)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.35)', pointerEvents: 'none',
      }}
    >
      {layoutItems.map(item => (
        <div
          key={item.id}
          style={{
            position: 'absolute',
            left: `${item.position_x}%`,
            top: `${item.position_y}%`,
            width: `${item.width}%`,
            height: item.kind === 'line' ? 2 : `${item.height}%`,
            transform: `translate(-50%, -50%) rotate(${item.rotation ?? 0}deg)`,
            opacity: 0.6,
            ...(item.kind === 'line' ? lineStyle() : shapeStyle(item.kind)),
          }}
        />
      ))}

      {seats.map(seat => {
        const occupied = participants.some(p => p.seat_id === seat.id)
        const highlighted = highlightSeatId === seat.id
        return (
          <span
            key={seat.id}
            style={{
              position: 'absolute',
              left: `${seat.position_x}%`,
              top: `${seat.position_y}%`,
              width: highlighted ? 6 : 4,
              height: highlighted ? 6 : 4,
              borderRadius: 999,
              transform: 'translate(-50%, -50%)',
              background: highlighted ? 'var(--accent)' : occupied ? 'var(--muted)' : 'var(--muted2)',
              boxShadow: highlighted ? '0 0 0 3px rgba(225,6,0,0.35)' : undefined,
            }}
          />
        )
      })}

      {/* 지금 화면에 보이는 범위 */}
      <div
        style={{
          position: 'absolute',
          left: `${viewport.x}%`,
          top: `${viewport.y}%`,
          width: `${viewport.w}%`,
          height: `${viewport.h}%`,
          border: '1.5px solid var(--accent)',
          background: 'rgba(225,6,0,0.12)',
          borderRadius: 3,
        }}
      />
    </div>
  )
}

/** 미니맵 높이를 메인 캔버스와 같은 비율로 맞춘다 — 뷰포트 사각형이 실제 화면과 어긋나지 않게 */
export function miniMapHeight(width: number, baseW: number, baseH: number) {
  if (baseW <= 0 || baseH <= 0) return Math.round(width * 0.75)
  return Math.round(Math.max(56, Math.min(160, width * (baseH / baseW))))
}
