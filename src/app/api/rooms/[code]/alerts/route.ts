import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// 운영자가 특정 손님에게 보내는 경고 메시지 (Guest Care 도메인, BUSINESS_RULES.md §2.9).
// reactions.warning(참여자 간 익명 자제 시그널)과는 별개 개념이라 operator_alerts에 남긴다.
// 삭제되지 않는 감사 이력이라 이 라우트엔 DELETE가 없다.
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const { operator_token, participant_id, message } = await req.json()

  if (!operator_token || !participant_id || !message?.trim()) {
    return NextResponse.json({ error: '운영자 세션, 손님, 메시지가 필요합니다' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()

  const { data: room } = await supabase
    .from('rooms')
    .select('id, host_session')
    .eq('code', code.toUpperCase())
    .maybeSingle()

  if (!room) {
    return NextResponse.json({ error: '방을 찾을 수 없습니다' }, { status: 404 })
  }
  if (room.host_session !== operator_token) {
    return NextResponse.json({ error: '운영자만 메시지를 보낼 수 있습니다' }, { status: 403 })
  }

  const { data: participant } = await supabase
    .from('participants')
    .select('id')
    .eq('id', participant_id)
    .eq('room_id', room.id)
    .maybeSingle()

  if (!participant) {
    return NextResponse.json({ error: '이 방의 손님이 아닙니다' }, { status: 404 })
  }

  const { data: alert, error } = await supabase
    .from('operator_alerts')
    .insert({ room_id: room.id, participant_id, message: message.trim() })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ alert })
}
