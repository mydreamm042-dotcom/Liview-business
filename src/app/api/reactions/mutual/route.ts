import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { checkMutualHeart } from '@/lib/server/mutual'

// 수신자 입장에서 쌍방 여부 확인
// just_received_from: 방금 하트를 보낸 상대의 participant_id
// my_session: 나의 session_token (서버에서 participant_id 검증)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const room_id = searchParams.get('room_id')
  const just_received_from = searchParams.get('just_received_from')
  const my_session = searchParams.get('my_session')

  if (!room_id || !just_received_from || !my_session) {
    return NextResponse.json({ error: '필수 파라미터 누락' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()

  // session_token으로 실제 participant 조회 (my_participant_id 클라이언트 신뢰 제거)
  const { data: me } = await supabase
    .from('participants')
    .select('id')
    .eq('room_id', room_id)
    .eq('session_token', my_session)
    .limit(1)
    .maybeSingle()

  if (!me) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 })
  }

  // 상대가 방금 보낸 쪽이므로 justSentById = just_received_from, 받은 쪽 = 나
  const isNewMutual = await checkMutualHeart(supabase, room_id, just_received_from, me.id)

  return NextResponse.json({ isNewMutual })
}
