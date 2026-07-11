import { Participant, VenueSeat } from '@/lib/supabase/types'
import { fmtSeatElapsed } from '@/lib/seatDisplay'

// 좌석 박스 내부 표시(라벨/닉네임/HOT/착석 경과시간)만 담당하는 순수 표시 컴포넌트.
// 좌석 캔버스를 쓰는 화면(참여자 선택/방 화면/운영자 배치 편집)이 모두 같은 정보를
// 보여주지만 각자 다른 포인터 제스처를 씌우므로, 바깥 박스(위치/드래그/탭 핸들러)는
// 각 화면이 직접 만들고 안쪽 내용만 공용화한다.
export default function SeatBoxContent({
  seat, occupant, occupantHot, now, isMe,
}: {
  seat: VenueSeat
  occupant: Participant | undefined
  occupantHot?: boolean
  now: number
  isMe?: boolean
}) {
  return (
    <>
      <p style={{
        fontSize: 12, fontWeight: 800, marginBottom: occupant ? 2 : 0,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {seat.label}
      </p>
      {occupant ? (
        <>
          <p style={{
            fontSize: 11, color: isMe ? 'var(--accent)' : 'var(--text2)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {occupant.nickname}{isMe ? ' (나)' : ''} {occupantHot && '🔥'}
          </p>
          {occupant.seat_assigned_at && (
            <p style={{ fontSize: 10, color: 'var(--muted)' }}>{fmtSeatElapsed(occupant.seat_assigned_at, now)}</p>
          )}
        </>
      ) : (
        <p style={{ fontSize: 11, color: 'var(--muted2)' }}>빈 자리</p>
      )}
    </>
  )
}
