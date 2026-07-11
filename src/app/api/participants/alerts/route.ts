import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// 참여자가 자신에게 온 운영자 경고 메시지를 확인하는 API (Guest Care 도메인,
// BUSINESS_RULES.md §2.9). 확인 전 메시지가 여러 개 쌓여도 한 번에 하나씩(가장 오래된
// 것부터) 모달로 보여준다 — 화면을 가리는 모달이 여러 개 겹치지 않도록.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const participant_id = searchParams.get('participant_id')
  const session_token = searchParams.get('session_token')

  if (!participant_id || !session_token) {
    return NextResponse.json({ error: '참여자 정보가 필요합니다' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()

  const { data: participant } = await supabase
    .from('participants')
    .select('id')
    .eq('id', participant_id)
    .eq('session_token', session_token)
    .maybeSingle()

  if (!participant) {
    return NextResponse.json({ error: '참여자를 찾을 수 없습니다' }, { status: 404 })
  }

  const { data: alert } = await supabase
    .from('operator_alerts')
    .select('id, message, created_at')
    .eq('participant_id', participant_id)
    .is('acknowledged_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ alert: alert ?? null })
}

// 참여자가 모달을 확인(닫기) 처리. 행을 삭제하지 않고 acknowledged_at만 채운다 —
// 운영자 개입 이력은 감사 목적으로 계속 보존된다.
//
// "이 세션이 진짜 이 참여자인지" 확인과 실제 업데이트를 서버에서 별도의 두 쿼리로
// 순차 실행하면 왕복이 두 번 걸려 확인 버튼을 눌렀을 때 체감 지연이 생긴다.
// operator_alerts에는 session_token이 없어 participants와의 조인 없이는 update() 필터
// 하나로 합칠 수 없으므로(Supabase JS 클라이언트는 update 필터에서 조인 미지원),
// 검증+업데이트를 acknowledge_operator_alert RPC로 묶어 왕복을 한 번으로 줄인다.
export async function PATCH(req: NextRequest) {
  const { alert_id, participant_id, session_token } = await req.json()

  if (!alert_id || !participant_id || !session_token) {
    return NextResponse.json({ error: '필수 파라미터 누락' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase.rpc('acknowledge_operator_alert', {
    p_alert_id: alert_id,
    p_participant_id: participant_id,
    p_session_token: session_token,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data?.ok) {
    // participant_not_found(세션 불일치)와 alert_not_found(스테일 id 등) 모두 참여자
    // 입장에서는 "메시지를 찾을 수 없다"는 동일한 404로 보여도 무방하다 — 조용히 성공
    // 처리하면 클라이언트는 확인됐다고 믿지만 서버는 여전히 미확인 상태로 남는다.
    const message = data?.error === 'participant_not_found' ? '참여자를 찾을 수 없습니다' : '메시지를 찾을 수 없습니다'
    return NextResponse.json({ error: message }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
