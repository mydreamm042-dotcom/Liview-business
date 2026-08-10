import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// 참여자 본인의 좌석 선택/변경 (Seating 도메인, BUSINESS_RULES.md §2.8). BUSINESS 방은
// 입장 직후 좌석 선택이 필수이므로, 이 API가 실패하면 참여자는 방 화면으로 넘어가지 못한다.
export async function PATCH(req: NextRequest) {
  const { participant_id, session_token, seat_id } = await req.json()

  if (!participant_id || !session_token || !seat_id) {
    return NextResponse.json({ error: '참여자 정보와 좌석 id가 필요합니다' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()

  const { data: participant } = await supabase
    .from('participants')
    .select('id, room_id')
    .eq('id', participant_id)
    .eq('session_token', session_token)
    .maybeSingle()

  if (!participant) {
    return NextResponse.json({ error: '참여자를 찾을 수 없습니다' }, { status: 404 })
  }

  const { data: room } = await supabase
    .from('rooms')
    .select('id, venue_id')
    .eq('id', participant.room_id)
    .maybeSingle()

  if (!room?.venue_id) {
    return NextResponse.json({ error: '이 방은 좌석 개념이 없습니다' }, { status: 400 })
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
    .select()
    .single()

  if (error) {
    // 위의 occupant 체크는 동시 요청 사이의 틈을 못 막는 사전 확인일 뿐이고, 최종 방어는
    // idx_participants_seat_unique(DB 유니크 인덱스)다 — 두 참여자가 거의 동시에 같은
    // 좌석을 선택하면 하나는 여기서 23505로 걸린다.
    if (error.code === '23505') {
      return NextResponse.json({ error: '이미 다른 손님이 앉은 좌석입니다' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ participant: updated })
}
