import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { QNA_EXTERNAL_COOLDOWN_MS } from '@/lib/cooldown'

// 외부 QnA 채널 — 매장에 입장하지 않은 외부인과 입장한 손님이 함께 쓰는 대화 채널
// (방 화면 채팅 탭의 "외부 QnA"). 기존 messages(입장 손님 전용)와는 별개 테이블이다.
// author_session은 쿨타임 판정/본인 표시 용도로만 쓰고 응답에는 절대 포함하지 않는다.

// 이 매장의 현재 영업(active room) QnA를 가져온다. 영업 중이 아니면 빈 목록.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { data: room } = await supabase
    .from('rooms')
    .select('id')
    .eq('venue_id', id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!room) return NextResponse.json({ messages: [] })

  const { data, error } = await supabase
    .from('venue_qna')
    .select('id, room_id, author_nickname, author_participant_id, is_external, content, created_at')
    .eq('room_id', room.id)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ messages: (data ?? []).reverse() })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { session_token, nickname, content } = await req.json()

  if (!session_token || !content?.trim()) {
    return NextResponse.json({ error: '필수 파라미터가 누락됐습니다' }, { status: 400 })
  }

  const trimmed = String(content).trim().slice(0, 300)
  const supabase = await createServerSupabaseClient()

  const { data: room } = await supabase
    .from('rooms')
    .select('id')
    .eq('venue_id', id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!room) {
    return NextResponse.json({ error: '지금은 영업 중이 아니에요' }, { status: 400 })
  }

  // 같은 session_token으로 이 방에 입장해 있으면 "내부 손님"으로 본다 — 쿨타임이 면제되고
  // 좌석 번호 아바타를 그릴 수 있게 참여자 id를 함께 저장한다.
  const { data: participant } = await supabase
    .from('participants')
    .select('id, nickname')
    .eq('room_id', room.id)
    .eq('session_token', session_token)
    .is('left_at', null)
    .maybeSingle()

  const isExternal = !participant
  const authorNickname = (participant?.nickname ?? String(nickname ?? '').trim() ?? '').slice(0, 20)

  if (isExternal && !authorNickname) {
    return NextResponse.json({ error: '닉네임을 입력해주세요' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('submit_venue_qna', {
    p_venue_id: id,
    p_room_id: room.id,
    p_author_session: session_token,
    p_author_nickname: authorNickname,
    p_author_participant_id: participant?.id ?? null,
    p_is_external: isExternal,
    p_content: trimmed,
    p_cooldown_seconds: Math.round(QNA_EXTERNAL_COOLDOWN_MS / 1000),
  })

  if (error) {
    console.error('[venue qna POST] rpc error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (data?.cooldown) {
    return NextResponse.json(
      { error: `외부 질문은 ${Math.round(QNA_EXTERNAL_COOLDOWN_MS / 1000)}초마다 남길 수 있어요`, retry_after_seconds: data.retry_after_seconds },
      { status: 429 },
    )
  }

  return NextResponse.json({ message: data?.message })
}
