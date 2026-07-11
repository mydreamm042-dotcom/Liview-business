'use client'

import { Participant, Reaction, VenueSeat } from '@/lib/supabase/types'
import { isOccupantHot } from '@/lib/seatDisplay'
import SeatBoxContent from './SeatBoxContent'

// 읽기 전용(+선택적 단순 클릭) 자리배치 캔버스. 좌석의 position_x/position_y(0~100%)를
// 그대로 절대 위치로 렌더링해, 운영자가 배치 편집 화면에서 구성한 좌표를 참여자/방 화면도
// 동일하게 본다 (BUSINESS_RULES.md §2.8 "좌석 배치 자유 구성"). 드래그 편집은 하지 않는다 —
// 그건 운영자 전용 배치 편집 화면(operator/settings/[id]/seats)만의 기능이다.
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
      position: 'relative', width: '100%', height, borderRadius: 16,
      background: 'var(--card2)', border: '1px solid var(--border)', overflow: 'hidden',
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

        return (
          <button
            key={seat.id}
            type="button"
            disabled={!clickable}
            onClick={clickable ? () => onSeatClick!(seat, occupant) : undefined}
            className="card"
            style={{
              position: 'absolute',
              left: `${seat.position_x}%`,
              top: `${seat.position_y}%`,
              transform: 'translate(-50%, -50%)',
              width: 92,
              padding: '10px 12px',
              textAlign: 'left',
              cursor: clickable ? 'pointer' : 'default',
              opacity: disabled ? 0.55 : 1,
              borderColor: isMe ? 'rgba(255,107,107,0.3)' : undefined,
              background: isMe ? 'rgba(255,107,107,0.06)' : undefined,
            }}
          >
            <SeatBoxContent seat={seat} occupant={occupant} occupantHot={occupantHot} now={now} isMe={isMe} />
          </button>
        )
      })}
    </div>
  )
}
