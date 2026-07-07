import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

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

  if (room.status === 'ended') {
    return NextResponse.json({ error: '이미 종료된 방입니다' }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from('participants')
    .select('*')
    .eq('room_id', room.id)
    .eq('session_token', session_token)
    .limit(1)
    .maybeSingle()

  // host_session은 서버 인증용 비밀값이라 클라이언트 응답에 담지 않는다
  const { host_session: _hs, ...safeRoom } = room
  void _hs

  if (existing) {
    // 나갔다 재입장(또는 닉네임 바꿔 재입장)한 경우: 같은 참여자로 복귀시킨다.
    // left_at을 비우고 새로 입력한 닉네임을 반영하되, 기존 id를 유지하므로
    // 받은 하트/매칭 이력/HOT 기여분이 그대로 이어진다.
    const { data: revived } = await supabase
      .from('participants')
      .update({ left_at: null, nickname })
      .eq('id', existing.id)
      .select()
      .single()
    return NextResponse.json({ room: safeRoom, participant: revived ?? existing })
  }

  const { data: participant, error } = await supabase
    .from('participants')
    .insert({ room_id: room.id, nickname, session_token })
    .select()
    .single()

  if (error) {
    // 같은 세션이 거의 동시에 두 번 입장 요청을 보내면 둘 다 위의 "이미 있는지" 확인을
    // 통과할 수 있다. 그 경우 (room_id, session_token) 유니크 제약에 한쪽이 걸리는데,
    // 실패로 처리하지 않고 먼저 만들어진 참여자를 그대로 돌려준다.
    if (error.code === '23505') {
      const { data: raced } = await supabase
        .from('participants')
        .select('*')
        .eq('room_id', room.id)
        .eq('session_token', session_token)
        .limit(1)
        .maybeSingle()
      if (raced) {
        return NextResponse.json({ room: safeRoom, participant: raced })
      }
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ room: safeRoom, participant })
}
