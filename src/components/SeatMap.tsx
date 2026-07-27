'use client'

import { Participant, Reaction, VenueSeat } from '@/lib/supabase/types'
import { isOccupantHot } from '@/lib/seatDisplay'

// 자리배치 캔버스 (Phase 9 리디자인). 좌석을 카드 상자가 아니라 디자인대로 "번호 원형"으로
// 그린다 — 선택 가능한 빈 좌석은 밝게(빨간 테두리), 이미 누가 앉은 좌석은 어둡게, 지금 HOT을
// 누르고 있는 좌석에는 불꽃을 얹는다. 좌표는 운영자가 배치 편집 화면에서 지정한
// position_x/position_y(0~100%)를 그대로 절대 위치로 쓴다 (BUSINESS_RULES.md §2.8).
export default function SeatMap({
  seats, participants, hotReactions, now, myParticipantId, height = 320,
  onSeatClick, seatDisabled,
}: {
  seats: VenueSeat[]
  participants: Participant[]
  hotReactions: Reaction[]
  now: number
  myParticipantId?: string
  height?: number
  onSeatClick?: (seat: VenueSeat, occupant: Participant | undefined) => void
  seatDisabled?: (seat: VenueSeat, occupant: Participant | undefined) => boolean
}) {
  return (
    <div style={{
      position: 'relative', width: '100%', height,
      background: 'var(--bg2)', overflow: 'hidden',
    }}>
      {seats.length === 0 && (
        <p style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 12, color: 'var(--muted2)',
        }}>
          등록된 좌석이 없습니다
        </p>
      )}
      {seats.map(seat => {
        const occupant = participants.find(p => p.seat_id === seat.id)
        const isMe = occupant?.id === myParticipantId
        const occupantHot = occupant ? isOccupantHot(occupant.id, hotReactions, now) : false
        const disabled = seatDisabled ? seatDisabled(seat, occupant) : false
        const clickable = !!onSeatClick && !disabled

        // 착석 여부에 따라 명암을 나눈다 — 빈 좌석(선택 가능)은 밝은 빨간 테두리,
        // 이미 앉은 좌석은 어둡게 눌러 대비를 준다. 내 좌석은 채워서 확실히 구분.
        const border = isMe ? 'var(--accent)' : occupant ? 'var(--muted)' : 'var(--accent)'
        const bg = isMe ? 'var(--accent)' : occupant ? 'var(--card)' : 'transparent'
        const fg = isMe ? '#fff' : occupant ? 'var(--muted)' : 'var(--accent)'

        return (
          <div
            key={seat.id}
            style={{
              position: 'absolute',
              left: `${seat.position_x}%`,
              top: `${seat.position_y}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            {/* HOT 불꽃 — 좌석 원 뒤에 겹쳐 타오르는 느낌을 준다 */}
            {occupantHot && (
              <span style={{
                position: 'absolute', left: '50%', top: -14, transform: 'translateX(-50%)',
                fontSize: 26, lineHeight: 1, pointerEvents: 'none', zIndex: 0,
              }} className="fire-pulse">
                🔥
              </span>
            )}
            <button
              type="button"
              disabled={!clickable}
              onClick={clickable ? () => onSeatClick!(seat, occupant) : undefined}
              aria-label={`${seat.label}번 좌석${occupant ? ' (사용 중)' : ''}`}
              style={{
                position: 'relative', zIndex: 1,
                width: 38, height: 38, borderRadius: 999,
                border: `2px solid ${border}`,
                background: bg,
                color: fg,
                fontSize: 13, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: clickable ? 'pointer' : 'default',
                opacity: occupant && !isMe ? 0.5 : 1,
                padding: 0,
              }}
            >
              {seat.label}
            </button>
          </div>
        )
      })}
    </div>
  )
}
