import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const { searchParams } = new URL(req.url)
  const session_token = searchParams.get('session_token')
  const supabase = await createServerSupabaseClient()

  const { data: room, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('code', code.toUpperCase())
    .single()

  if (error || !room) {
    return NextResponse.json({ error: '방을 찾을 수 없습니다' }, { status: 404 })
  }

  // left_at이 채워진(나간) 참여자도 함께 내려준다 — 결과 페이지 집계에는 필요하고,
  // 방 화면의 참여자 목록은 클라이언트(useRoom)에서 left_at 없는 사람만 걸러 쓴다.
  const { data: participants } = await supabase
    .from('participants')
    .select('id, room_id, joined_at, nickname, left_at')
    .eq('room_id', room.id)
    .order('joined_at', { ascending: true })

  // host_session은 호스트 권한 판정용 비밀값이라 클라이언트에 그대로 보내지 않는다
  // (그대로 보내면 참여자가 devtools로 값을 읽어 호스트인 척 방을 종료시킬 수 있음).
  // 대신 서버가 여기서 판정한 boolean만 내려준다.
  const { host_session, ...safeRoom } = room
  void host_session
  const isHost = session_token != null && room.host_session === session_token

  return NextResponse.json({ room: safeRoom, participants, isHost })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const { host_session, status } = await req.json()
  const supabase = await createServerSupabaseClient()

  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('code', code.toUpperCase())
    .single()

  if (!room) {
    return NextResponse.json({ error: '방을 찾을 수 없습니다' }, { status: 404 })
  }

  if (room.host_session !== host_session) {
    return NextResponse.json({ error: '호스트만 방을 종료할 수 있습니다' }, { status: 403 })
  }

  const updatePayload: Record<string, unknown> = { status }
  if (status === 'ended') {
    updatePayload.ended_at = new Date().toISOString()
  }

  const { data: updated, error } = await supabase
    .from('rooms')
    .update(updatePayload)
    .eq('id', room.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { host_session: _hs, ...safeUpdated } = updated
  void _hs
  return NextResponse.json({ room: safeUpdated })
}
