import { createServerSupabaseClient } from '@/lib/supabase/server'

type ServerSupabase = Awaited<ReturnType<typeof createServerSupabaseClient>>

// 기존 코드 기반 입장(src/app/api/rooms/[code]/join/route.ts)의 "이미 참여자면 복귀,
// 아니면 새로 생성 + 레이스 처리" 로직을 그대로 뽑아낸 것. PERSONAL 방의 기존 동작은
// 원본 라우트가 그대로 담당하므로 변경 없음 — 이 헬퍼는 신규 매장 기반 입장(venue join)이
// 같은 규칙을 중복 구현하지 않고 재사용하기 위한 것이다.
export async function joinOrReviveParticipant(
  supabase: ServerSupabase,
  roomId: string,
  nickname: string,
  sessionToken: string,
  // 이 참여자 행이 "그 매장의 실제 운영자"인지 여부(participants.is_operator). 오직
  // operator-join API(Supabase Auth + venues.owner_id로 이미 신원을 검증한 경로)만
  // true를 넘긴다 — 손님이 거치는 join 경로들은 이 인자를 아예 쓰지 않으므로 항상
  // false로 남는다. 방 화면의 HOST 표시가 도착 순서가 아니라 이 플래그를 근거로
  // 삼도록 하기 위한 값이다 (닉네임 문자열 비교는 손님이 같은 문자열을 쓰면 무너짐).
  isOperator = false,
) {
  const { data: existing } = await supabase
    .from('participants')
    .select('*')
    .eq('room_id', roomId)
    .eq('session_token', sessionToken)
    .limit(1)
    .maybeSingle()

  if (existing) {
    const { data: revived } = await supabase
      .from('participants')
      .update({ left_at: null, nickname, is_operator: isOperator })
      .eq('id', existing.id)
      .select()
      .single()
    return { participant: revived ?? existing, error: null }
  }

  const { data: participant, error } = await supabase
    .from('participants')
    .insert({ room_id: roomId, nickname, session_token: sessionToken, is_operator: isOperator })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      const { data: raced } = await supabase
        .from('participants')
        .select('*')
        .eq('room_id', roomId)
        .eq('session_token', sessionToken)
        .limit(1)
        .maybeSingle()
      if (raced) return { participant: raced, error: null }
    }
    return { participant: null, error }
  }

  return { participant, error: null }
}
