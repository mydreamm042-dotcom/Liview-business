import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireOperator, verifyVenueOwner } from '@/lib/server/venueAuth'
import { joinOrReviveParticipant } from '@/lib/server/joinParticipant'

// 개발/테스트 전용 입장 — 손님용 QR 랜딩(/v/[id])과 동일하게 참여자로 입장시키지만,
// 비밀번호/위치 반경 검사를 건너뛴다. PC 등 카메라·GPS가 없는 환경에서 사장님이 직접
// 손님 화면(좌석 선택/HOT/채팅 등)을 확인해볼 수 있게 하기 위한 것이다.
// 공개 API가 아니다 — 반드시 로그인한 운영자 본인 소유 매장에만 쓸 수 있다(§2.11과
// 동일한 권한 판정). is_operator는 항상 false로 만든다 — "사장님"이 아니라 실제
// 손님이 보는 화면을 그대로 재현해야 하기 때문이다.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { nickname } = await req.json().catch(() => ({ nickname: undefined }))

  const supabase = await createServerSupabaseClient()
  const auth = await requireOperator(supabase)
  if (!auth.ok) return auth.response

  const owner = await verifyVenueOwner(supabase, id, auth.user.id, '테스트 입장을 할 수 있습니다')
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status })

  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('venue_id', id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!room) {
    return NextResponse.json({ error: '아직 영업을 시작하지 않았습니다' }, { status: 400 })
  }

  // 매번 새 익명 세션으로 입장시킨다 — 운영자 본인 브라우저에 이미 저장된 operator-join
  // 세션 토큰과 절대 겹치지 않게 하기 위함(겹치면 그 참여자 행의 is_operator가 뒤바뀜).
  const sessionToken = randomUUID()
  const testNickname = (nickname?.trim() || `테스트손님${Math.floor(Math.random() * 900 + 100)}`).slice(0, 10)

  const { participant, error } = await joinOrReviveParticipant(supabase, room.id, testNickname, sessionToken)

  if (error || !participant) {
    return NextResponse.json({ error: error?.message ?? '입장에 실패했습니다' }, { status: 500 })
  }

  const { host_session: _hs, ...safeRoom } = room
  void _hs
  return NextResponse.json({ room: safeRoom, participant, session_token: sessionToken })
}
