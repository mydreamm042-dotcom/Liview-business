import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireOperator } from '@/lib/server/venueAuth'

// 직원 교대(출근/퇴근) — Staff 도메인, BUSINESS_RULES.md §2.4 "교대 트리거 위치". 방
// 화면에서 실시간으로 처리하며, 이 GET은 (1) 방 화면의 "현재 근무 중" 표시와 (2) 참여자
// 친절도 투표의 후보 목록(그 영업일에 실제로 근무한 직원) 양쪽에서 쓴다 — 그래서
// 운영자 권한 없이 누구나 조회 가능하다.
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

  const { data: shifts, error } = await supabase
    .from('staff_shifts')
    .select('id, staff_id, started_at, ended_at')
    .eq('room_id', room.id)
    .order('started_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ shifts: shifts ?? [] })
}

async function verifyRoomOwner(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  code: string,
  userId: string,
) {
  const { data: room } = await supabase
    .from('rooms')
    .select('id, venue_id')
    .eq('code', code.toUpperCase())
    .maybeSingle()

  if (!room) return { ok: false as const, status: 404, error: '방을 찾을 수 없습니다' }

  const { data: venue } = await supabase
    .from('venues')
    .select('owner_id')
    .eq('id', room.venue_id)
    .maybeSingle()

  if (venue?.owner_id !== userId) {
    return { ok: false as const, status: 403, error: '운영자만 교대를 처리할 수 있습니다' }
  }
  return { ok: true as const, room }
}

// 교대 시작(출근). 이미 진행 중인 교대가 있으면 idx_staff_shifts_one_active(유니크
// 인덱스)가 최종적으로 막아준다 — 출근 버튼 연타/동시 요청 방지.
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const { staff_id } = await req.json()

  if (!staff_id) {
    return NextResponse.json({ error: '직원 id가 필요합니다' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const auth = await requireOperator(supabase)
  if (!auth.ok) return auth.response

  const owner = await verifyRoomOwner(supabase, code, auth.user.id)
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status })

  const { data: shift, error } = await supabase
    .from('staff_shifts')
    .insert({ room_id: owner.room.id, staff_id })
    .select('id, staff_id, started_at, ended_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '이미 근무 중인 직원입니다' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ shift })
}

// 교대 종료(퇴근). 그 방에서 아직 진행 중인 해당 직원의 교대를 마감한다.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const { staff_id } = await req.json()

  if (!staff_id) {
    return NextResponse.json({ error: '직원 id가 필요합니다' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const auth = await requireOperator(supabase)
  if (!auth.ok) return auth.response

  const owner = await verifyRoomOwner(supabase, code, auth.user.id)
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status })

  const { data: shift, error } = await supabase
    .from('staff_shifts')
    .update({ ended_at: new Date().toISOString() })
    .eq('room_id', owner.room.id)
    .eq('staff_id', staff_id)
    .is('ended_at', null)
    .select('id, staff_id, started_at, ended_at')
    .single()

  if (error) {
    return NextResponse.json({ error: '진행 중인 교대를 찾을 수 없습니다' }, { status: 404 })
  }

  return NextResponse.json({ shift })
}
