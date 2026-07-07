import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function DELETE(req: NextRequest) {
  const text = await req.text()
  let participant_id: string, session_token: string
  try {
    const parsed = JSON.parse(text)
    participant_id = parsed.participant_id
    session_token = parsed.session_token
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  }

  if (!participant_id || !session_token) {
    return NextResponse.json({ error: '필수 파라미터 누락' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()

  // 행을 삭제하지 않고 left_at만 채운다 (soft leave). 삭제하면 이 사람이 받은 하트,
  // 누른 HOT 탭, 별점, 투표가 연쇄 삭제되어 재입장 시 전부 초기화되기 때문.
  const { error } = await supabase
    .from('participants')
    .update({ left_at: new Date().toISOString() })
    .eq('id', participant_id)
    .eq('session_token', session_token)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

const VIEW_EVENT_COLUMNS = {
  result_viewed: 'result_viewed_at',
  chat_opened: 'chat_opened_at',
} as const

// 베타 참여도 분석용: 결과 화면/채팅창을 "열어봤는지, 언제 처음"만 기록한다.
// 이미 기록돼 있으면 덮어쓰지 않는다 (몇 번 열었는지는 관심사가 아님 + 매번 여닫을
// 때마다 쓰기가 발생하지 않도록).
export async function PATCH(req: NextRequest) {
  const { participant_id, session_token, event } = await req.json()

  if (!participant_id || !session_token || !event) {
    return NextResponse.json({ error: '필수 파라미터 누락' }, { status: 400 })
  }

  const column = VIEW_EVENT_COLUMNS[event as keyof typeof VIEW_EVENT_COLUMNS]
  if (!column) {
    return NextResponse.json({ error: '유효하지 않은 이벤트' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase
    .from('participants')
    .update({ [column]: new Date().toISOString() })
    .eq('id', participant_id)
    .eq('session_token', session_token)
    .is(column, null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
