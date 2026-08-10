import { Reaction } from '@/lib/supabase/types'
import { simulateHotTaps, hotIndexAt } from '@/lib/hotIndex'

// Seating 도메인(BUSINESS_RULES.md §2.8) 파생 표시값. 참여자용 자리배치도와 운영자용
// 좌석 관리 화면이 동일한 규칙으로 착석 경과시간/좌석별 HOT 여부를 보여줘야 해서 공용화한다.
export function fmtSeatElapsed(seatAssignedAt: string, now: number): string {
  const sec = Math.max(0, Math.floor((now - new Date(seatAssignedAt).getTime()) / 1000))
  const m = Math.floor(sec / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}시간 ${m % 60}분째`
  if (m > 0) return `${m}분째`
  return '방금 앉음'
}

// 특정 참여자가 "지금 HOT을 탭하고 있는지"— HOT 탭의 sender_participant_id로 판정한다
// (Atmosphere Index 도메인의 기존 원본 데이터를 그대로 재사용하는 파생값, 새 신호 아님).
export function isOccupantHot(
  occupantId: string,
  hotReactions: Reaction[],
  now: number,
): boolean {
  const mine = hotReactions.filter(r => r.sender_participant_id === occupantId)
  return hotIndexAt(simulateHotTaps(mine), now) > 0
}
