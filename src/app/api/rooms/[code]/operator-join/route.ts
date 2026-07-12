import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireOperator } from '@/lib/server/venueAuth'
import { joinOrReviveParticipant } from '@/lib/server/joinParticipant'

// 운영자가 자기 매장의 진행 중인 방에 참여자처럼 입장한다. 권한 판정은 로그인 세션 +
// venues.owner_id로 하고(Operator 도메인 §2.11), 실제 참여자 행은 기존 참여자들과 같은
// 방식으로 익명 session_token을 키로 쓴다 — 반응/채팅 등 참여자 기능(HOT 탭, 하트, 채팅)이
// 그대로 동작하려면 participants 행이 있어야 하고, 손님과 동일한 방 화면·로직을 그대로
// 재사용하기 위해 새 화면을 만들지 않고 이 경로로 참여자 등록만 시켜준다.
// 손님 입장과 달리 비밀번호/위치 반경 검사는 하지 않는다 — 이미 이 매장의 운영자임을
// 로그인 세션으로 확인했으므로 물리적 방문 검증이 필요 없다.
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const { session_token } = await req.json()

  if (!session_token) {
    return NextResponse.json({ error: '참여자 세션이 필요합니다' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const auth = await requireOperator(supabase)
  if (!auth.ok) return auth.response

  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('code', code.toUpperCase())
    .maybeSingle()

  if (!room) {
    return NextResponse.json({ error: '방을 찾을 수 없습니다' }, { status: 404 })
  }

  const { data: venue } = await supabase
    .from('venues')
    .select('owner_id')
    .eq('id', room.venue_id)
    .maybeSingle()

  if (venue?.owner_id !== auth.user.id) {
    return NextResponse.json({ error: '이 방의 운영자만 입장할 수 있습니다' }, { status: 403 })
  }
  if (room.status !== 'active') {
    return NextResponse.json({ error: '영업 중인 방이 아닙니다' }, { status: 400 })
  }

  // isOperator=true — 이 API는 이미 위에서 Supabase Auth + venues.owner_id로 신원을
  // 검증했으므로, 이 참여자 행에 실제 운영자 플래그를 심을 수 있는 유일한 경로다.
  const { participant, error } = await joinOrReviveParticipant(supabase, room.id, '사장님', session_token, true)

  if (error || !participant) {
    return NextResponse.json({ error: error?.message ?? '입장에 실패했습니다' }, { status: 500 })
  }

  const { host_session: _hs, ...safeRoom } = room
  void _hs
  return NextResponse.json({ room: safeRoom, participant })
}
