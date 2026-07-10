import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// 운영자의 좌석 강제 이동 (Seating 도메인, BUSINESS_RULES.md §2.8). 참여자 화면은 3초
// 폴링으로 참여자 목록을 다시 받아오므로, 새 realtime 채널 없이도 곧 반영된다.
// 좌석 이동은 착석 타이머를 리셋한다 — §2.8 "좌석 이동 시 타이머 처리" 항목은 아직
// 미확정이라고 문서에 명시돼있고, 이건 그중 "리셋" 해석을 임시로 채택한 것뿐이다.
// 다르게 확정되면 이 한 줄만 바꾸면 되도록 리셋 시점을 이 update 한 곳에 모아뒀다.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const { operator_token, participant_id, seat_id } = await req.json()

  if (!operator_token || !participant_id || !seat_id) {
    return NextResponse.json({ error: '운영자 세션, 참여자, 좌석 id가 필요합니다' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()

  const { data: room } = await supabase
    .from('rooms')
    .select('id, venue_id, host_session')
    .eq('code', code.toUpperCase())
    .maybeSingle()

  if (!room) {
    return NextResponse.json({ error: '방을 찾을 수 없습니다' }, { status: 404 })
  }
  if (room.host_session !== operator_token) {
    return NextResponse.json({ error: '운영자만 좌석을 옮길 수 있습니다' }, { status: 403 })
  }

  const { data: seat } = await supabase
    .from('venue_seats')
    .select('id, venue_id')
    .eq('id', seat_id)
    .maybeSingle()

  if (!seat || seat.venue_id !== room.venue_id) {
    return NextResponse.json({ error: '잘못된 좌석입니다' }, { status: 400 })
  }

  const { data: occupant } = await supabase
    .from('participants')
    .select('id')
    .eq('room_id', room.id)
    .eq('seat_id', seat_id)
    .is('left_at', null)
    .neq('id', participant_id)
    .maybeSingle()

  if (occupant) {
    return NextResponse.json({ error: '이미 다른 손님이 앉은 좌석입니다' }, { status: 409 })
  }

  const { data: updated, error } = await supabase
    .from('participants')
    .update({ seat_id, seat_assigned_at: new Date().toISOString() })
    .eq('id', participant_id)
    .eq('room_id', room.id)
    .select()
    .single()

  if (error) {
    // occupant 체크는 사전 확인일 뿐이라 동시 요청(예: 참여자 셀프 선택과 동시에 발생한
    // 이동)까지는 못 막는다 — 최종 방어는 idx_participants_seat_unique(DB 유니크 인덱스).
    if (error.code === '23505') {
      return NextResponse.json({ error: '이미 다른 손님이 앉은 좌석입니다' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ participant: updated })
}
