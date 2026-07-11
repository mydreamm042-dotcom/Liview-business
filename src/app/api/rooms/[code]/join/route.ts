import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { joinOrReviveParticipant } from '@/lib/server/joinParticipant'

// 이 경로는 참여자가 방 코드를 직접 입력해 들어오는 PERSONAL 전용 입장이다(Part 1, 변경 금지).
// BUSINESS 방은 코드를 참여자에게 요구/노출하지 않는 고정 QR 입장만 허용한다
// (BUSINESS_RULES.md §2.1 "고정 QR 입장"). 코드로 여기 직접 들어오면 그 전용 입장이
// 강제하는 입장 비밀번호·위치 반경 검사(§2.2~2.3)를 전부 우회하게 되므로 여기서 막는다 —
// 참여자는 반드시 `/v/[venueId]` 경로로 들어와야 한다.
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const { nickname, session_token } = await req.json()

  if (!nickname || !session_token) {
    return NextResponse.json({ error: '닉네임과 세션이 필요합니다' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()

  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('code', code.toUpperCase())
    .single()

  if (!room) {
    return NextResponse.json({ error: '방을 찾을 수 없습니다' }, { status: 404 })
  }

  if (room.room_type === 'BUSINESS') {
    return NextResponse.json({ error: '이 매장은 매장에 비치된 QR로만 입장할 수 있어요' }, { status: 400 })
  }

  // ended(PERSONAL 종료)와 closed(BUSINESS 마감) 모두 입장 불가.
  // active가 아닌 상태를 통째로 막아, 향후 상태가 추가돼도 기본 동작이 차단이 되게 한다.
  if (room.status !== 'active') {
    const message = room.status === 'closed' ? '오늘 영업이 마감된 방입니다' : '이미 종료된 방입니다'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  // host_session은 서버 인증용 비밀값이라 클라이언트 응답에 담지 않는다
  const { host_session: _hs, ...safeRoom } = room
  void _hs

  // 재입장 복귀/신규 생성/동시 요청 레이스 처리는 공통 헬퍼로 위임한다
  // (src/app/api/venues/[id]/join/route.ts의 고정 QR 입장과 동일한 규칙을 공유).
  const { participant, error } = await joinOrReviveParticipant(supabase, room.id, nickname, session_token)

  if (error || !participant) {
    return NextResponse.json({ error: error?.message ?? '입장에 실패했습니다' }, { status: 500 })
  }

  return NextResponse.json({ room: safeRoom, participant })
}
