import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { generateRoomCode } from '@/lib/session'

export async function POST(req: NextRequest) {
  const { name, host_session, room_type, venue_id } = await req.json()

  if (!name || !host_session) {
    return NextResponse.json({ error: '방 이름과 세션이 필요합니다' }, { status: 400 })
  }

  // room_type 미지정 = PERSONAL. 기존 B2C 클라이언트는 이 파라미터를 보내지 않으므로
  // 기존 호출은 전부 지금까지와 동일하게 동작한다.
  const resolvedType = room_type ?? 'PERSONAL'
  if (resolvedType !== 'PERSONAL' && resolvedType !== 'BUSINESS') {
    return NextResponse.json({ error: '유효하지 않은 방 타입입니다' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()

  // BUSINESS 방은 반드시 매장(venue)에 소속되며, 그 매장의 운영자만 만들 수 있다.
  // 방의 host_session = 매장의 operator_owner_token이 되므로, 기존 호스트 권한
  // 검증(방 마감 등)이 그대로 "운영자 권한 검증"으로 동작한다.
  if (resolvedType === 'BUSINESS') {
    if (!venue_id) {
      return NextResponse.json({ error: 'BUSINESS 방은 매장(venue) 지정이 필요합니다' }, { status: 400 })
    }
    const { data: venue } = await supabase
      .from('venues')
      .select('id, operator_owner_token')
      .eq('id', venue_id)
      .maybeSingle()
    if (!venue) {
      return NextResponse.json({ error: '매장을 찾을 수 없습니다' }, { status: 404 })
    }
    if (venue.operator_owner_token !== host_session) {
      return NextResponse.json({ error: '매장 운영자만 BUSINESS 방을 만들 수 있습니다' }, { status: 403 })
    }
  }

  let code = ''
  let attempts = 0
  while (attempts < 10) {
    code = generateRoomCode()
    const { data } = await supabase.from('rooms').select('id').eq('code', code).maybeSingle()
    if (!data) break
    attempts++
  }

  const { data: room, error } = await supabase
    .from('rooms')
    .insert({
      code,
      name,
      host_session,
      status: 'active',
      room_type: resolvedType,
      venue_id: resolvedType === 'BUSINESS' ? venue_id : null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: participant, error: pError } = await supabase
    .from('participants')
    .insert({ room_id: room.id, nickname: '호스트', session_token: host_session })
    .select()
    .single()

  if (pError) {
    return NextResponse.json({ error: pError.message }, { status: 500 })
  }

  // host_session은 서버 인증용 비밀값이라 응답에 그대로 담지 않는다 (devtools로
  // 값을 읽어 남이 호스트인 척 방을 종료시키는 걸 막기 위함). 만든 사람은 이미
  // 자기 세션 토큰을 알고 있으니 돌려받을 필요도 없다.
  const { host_session: _hs, ...safeRoom } = room
  void _hs
  return NextResponse.json({ room: safeRoom, participant })
}
