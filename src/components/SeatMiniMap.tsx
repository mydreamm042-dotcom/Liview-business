'use client'

import { Participant, VenueLayoutItem, VenueSeat } from '@/lib/supabase/types'
import { shapeStyle } from './LayoutItemShape'

// 좌석 선택 화면 전용 미니맵 (ADR-0007). 메인 캔버스와 동일한 0~100% 좌표를 그대로 재사용해
// 배치를 축소된 점/도형으로 그리고, 메인 뷰가 지금 보여주는 스크롤/확대 범위를 사각형(뷰포트)
// 으로 겹쳐 표시한다. 좌석 배치 규모와 무관하게 항상 렌더링한다 — 라벨/HOT 같은 상세 표시는
// 다 생략한다(위치 감만 주는 게 목적이라 정보가 많으면 오히려 이 작은 크기에서 읽기 어렵다).
export default function SeatMiniMap({
  seats, layoutItems, participants, selectedSeatId, viewport, width = 104, height = 78,
}: {
  seats: VenueSeat[]
  layoutItems: VenueLayoutItem[]
  participants: Participant[]
  // 아직 서버에 확정되지 않은 가선택 좌석 — 메인 캔버스와 동일한 강조색으로 표시한다.
  selectedSeatId?: string | null
  // 메인 캔버스 대비 현재 보이는 범위 (0~100%, 캔버스와 동일 좌표계)
  viewport: { x: number; y: number; w: number; h: number }
  width?: number
  height?: number
}) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'relative', width, height, borderRadius: 10, overflow: 'hidden',
        // 반투명 배경 — 캔버스 우상단에 실제 좌석이 깔려 있어도(예: 이 화면처럼 좁은 화면에서
        // 좌석이 모서리 쪽에 배치된 경우) 완전히 가리지 않고 비쳐 보이게 한다.
        background: 'rgba(28,28,28,0.82)', border: '1px solid var(--border)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
        // 메인 캔버스 위에 떠 있는 순수 표시용 오버레이라 클릭을 가로채면 안 된다 — 미니맵
        // 밑에 실제 좌석이 깔려 있으면(예: 우상단 근처 좌석) 탭이 그 좌석까지 그대로
        // 통과해야 한다.
        pointerEvents: 'none',
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
            height: `${item.height}%`,
            transform: 'translate(-50%, -50%)',
            opacity: 0.6,
            ...shapeStyle(item.kind),
          }}
        />
      ))}

      {seats.map(seat => {
        const occupied = participants.some(p => p.seat_id === seat.id)
        const pending = selectedSeatId === seat.id
        return (
          <span
            key={seat.id}
            style={{
              position: 'absolute',
              left: `${seat.position_x}%`,
              top: `${seat.position_y}%`,
              width: pending ? 6 : 4,
              height: pending ? 6 : 4,
              borderRadius: 999,
              transform: 'translate(-50%, -50%)',
              background: pending ? 'var(--accent)' : occupied ? 'var(--muted)' : 'var(--muted2)',
              boxShadow: pending ? '0 0 0 3px rgba(225,6,0,0.35)' : undefined,
            }}
          />
        )
      })}

      {/* 뷰포트 — 메인 캔버스가 지금 보여주는 스크롤/확대 범위 */}
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
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}
