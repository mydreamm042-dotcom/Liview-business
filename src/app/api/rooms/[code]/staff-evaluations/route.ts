import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// 직원 친절도 투표 (Staff 도메인, BUSINESS_RULES.md §2.4 "친절도 투표 방식"). 별점이
// 아니라 "가장 친절했던 직원 1명"을 고르는 단일 선택 투표다. 후보는 이 Room에 실제로
// 교대(staff_shifts) 기록이 있는 직원으로 한정한다 — "투표 대상 직원 범위".
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const supabase = await createServerSupabaseClient()

  const { data: room } = await supabase
    .from('rooms')
    .select('id')
    .eq('code', code.toUpperCase())
    .maybeSingle()

  if (!room) {
    return NextResponse.json({ error: '방을 찾을 수 없습니다' }, { status: 404 })
  }

  const { data: shifts } = await supabase
    .from('staff_shifts')
    .select('staff_id')
    .eq('room_id', room.id)

  const staffIds = [...new Set((shifts ?? []).map(s => s.staff_id))]
  if (staffIds.length === 0) {
    return NextResponse.json({ candidates: [] })
  }

  const { data: members, error } = await supabase
    .from('staff_members')
    .select('id, name')
    .in('id', staffIds)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ candidates: (members ?? []).map(m => ({ staff_id: m.id, name: m.name })) })
}

// 투표 제출. 1인 1표(Room당) — UNIQUE(room_id, participant_id)가 중복 투표를 최종
// 방어한다. 스킵은 그냥 이 API를 호출하지 않는 것으로 표현한다 (별도 skip 파라미터 없음).
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const { participant_id, session_token, staff_id } = await req.json()

  if (!participant_id || !session_token || !staff_id) {
    return NextResponse.json({ error: '참여자 정보와 직원 id가 필요합니다' }, { status: 400 })
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
    .select('id')
    .eq('code', code.toUpperCase())
    .maybeSingle()

  if (!room || room.id !== participant.room_id) {
    return NextResponse.json({ error: '이 방의 참여자가 아닙니다' }, { status: 403 })
  }

  // 후보 검증 — 그 방에서 실제로 교대한 직원에게만 투표할 수 있다.
  const { data: shift } = await supabase
    .from('staff_shifts')
    .select('id')
    .eq('room_id', room.id)
    .eq('staff_id', staff_id)
    .maybeSingle()

  if (!shift) {
    return NextResponse.json({ error: '이 영업일에 근무하지 않은 직원입니다' }, { status: 400 })
  }

  const { data: evaluation, error } = await supabase
    .from('staff_evaluations')
    .insert({ room_id: room.id, participant_id, staff_id })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '이미 투표했습니다' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ evaluation })
}
