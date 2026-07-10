import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { joinOrReviveParticipant } from '@/lib/server/joinParticipant'

// 운영자가 자기 매장의 진행 중인 방에 참여자처럼 입장한다. host_session 비교만으로도
// "방을 종료할 권한이 있는지"는 이미 판정되지만, 반응/채팅 등 참여자 기능(HOT 탭, 하트,
// 채팅)을 실제로 쓰려면 participants 행이 있어야 한다 — 손님과 동일한 방 화면·로직을
// 그대로 재사용하기 위해 새 화면을 만들지 않고 이 경로로 참여자 등록만 시켜준다.
// 손님 입장과 달리 비밀번호/위치 반경 검사는 하지 않는다 — 이미 이 매장의 운영자임을
// host_session 일치로 확인했으므로 물리적 방문 검증이 필요 없다.
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const { operator_token } = await req.json()

  if (!operator_token) {
    return NextResponse.json({ error: '운영자 세션이 필요합니다' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()

  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('code', code.toUpperCase())
    .maybeSingle()

  if (!room) {
    return NextResponse.json({ error: '방을 찾을 수 없습니다' }, { status: 404 })
  }
  if (room.host_session !== operator_token) {
    return NextResponse.json({ error: '이 방의 운영자만 입장할 수 있습니다' }, { status: 403 })
  }
  if (room.status !== 'active') {
    return NextResponse.json({ error: '영업 중인 방이 아닙니다' }, { status: 400 })
  }

  const { participant, error } = await joinOrReviveParticipant(supabase, room.id, '사장님', operator_token)

  if (error || !participant) {
    return NextResponse.json({ error: error?.message ?? '입장에 실패했습니다' }, { status: 500 })
  }

  const { host_session: _hs, ...safeRoom } = room
  void _hs
  return NextResponse.json({ room: safeRoom, participant })
}
