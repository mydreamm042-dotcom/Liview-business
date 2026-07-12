import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireOperator, verifyVenueOwner } from '@/lib/server/venueAuth'

// 매장 직원 명부 (Staff 도메인, BUSINESS_RULES.md §2.4). 명부 자체의 추가/삭제는 운영자
// 설정 화면에서 사전에 구성한다 — 좌석 배치 구성과 같은 패턴(구조 설정은 설정 화면,
// 실시간 개입(교대 시작/종료)은 방 화면). 공개 조회는 활성(is_active) 직원만 내려준다 —
// 방 화면에서 "교대 시작" 대상 목록으로도 이 GET을 그대로 쓴다.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { data: staff, error } = await supabase
    .from('staff_members')
    .select('id, venue_id, name, is_active, created_at')
    .eq('venue_id', id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ staff: staff ?? [] })
}

// 직원 추가.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { name } = await req.json()

  if (!name?.trim()) {
    return NextResponse.json({ error: '직원 이름이 필요합니다' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const auth = await requireOperator(supabase)
  if (!auth.ok) return auth.response

  const owner = await verifyVenueOwner(supabase, id, auth.user.id, '직원을 관리할 수 있습니다')
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status })

  const { data: staff, error } = await supabase
    .from('staff_members')
    .insert({ venue_id: id, name: name.trim() })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ staff })
}

// 직원 삭제. 하드 삭제 대신 is_active=false로 소프트 삭제한다 — 과거 교대 기록/친절도
// 투표가 이 직원을 참조하므로, 하드 삭제하면 지난 영업일 리포트가 깨진다 (§2.4 "직원
// 삭제 방식").
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { staff_id } = await req.json()

  if (!staff_id) {
    return NextResponse.json({ error: '직원 id가 필요합니다' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const auth = await requireOperator(supabase)
  if (!auth.ok) return auth.response

  const owner = await verifyVenueOwner(supabase, id, auth.user.id, '직원을 관리할 수 있습니다')
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status })

  const { error } = await supabase
    .from('staff_members')
    .update({ is_active: false })
    .eq('id', staff_id)
    .eq('venue_id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
