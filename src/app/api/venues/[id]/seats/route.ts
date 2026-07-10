import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { verifyVenueOwner } from '@/lib/server/venueAuth'

// 매장 좌석 마스터 목록 (Seating 도메인, BUSINESS_RULES.md §2.8). 세션(오늘 영업)이 몇 번
// 바뀌어도 유지되는 Venue 소유 데이터라 venue_id 하나로만 관리한다.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { data: seats, error } = await supabase
    .from('venue_seats')
    .select('id, venue_id, label, sort_order, created_at')
    .eq('venue_id', id)
    .order('sort_order', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ seats: seats ?? [] })
}

// 좌석 추가. 정렬 순서는 뒤에 이어붙인다 (기존 좌석 수를 세어 다음 순번을 부여).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { operator_token, label } = await req.json()

  if (!operator_token || !label?.trim()) {
    return NextResponse.json({ error: '운영자 세션과 좌석 이름이 필요합니다' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()

  // 소유자 확인과 "기존 좌석 몇 개인지"는 서로 결과를 필요로 하지 않으므로 병렬로 보낸다
  // (직렬로 하면 왕복 시간이 그대로 두 배로 더해짐 — INSERT만 둘 다 끝난 뒤 실행).
  const [owner, countResult] = await Promise.all([
    verifyVenueOwner(supabase, id, operator_token, '좌석을 관리할 수 있습니다'),
    supabase.from('venue_seats').select('id', { count: 'exact', head: true }).eq('venue_id', id),
  ])
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status })
  const { count } = countResult

  const { data: seat, error } = await supabase
    .from('venue_seats')
    .insert({ venue_id: id, label: label.trim(), sort_order: count ?? 0 })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ seat })
}

// 좌석 이름 수정.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { operator_token, seat_id, label } = await req.json()

  if (!operator_token || !seat_id || !label?.trim()) {
    return NextResponse.json({ error: '운영자 세션, 좌석 id, 좌석 이름이 필요합니다' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const owner = await verifyVenueOwner(supabase, id, operator_token, '좌석을 관리할 수 있습니다')
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status })

  const { data: seat, error } = await supabase
    .from('venue_seats')
    .update({ label: label.trim() })
    .eq('id', seat_id)
    .eq('venue_id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ seat })
}

// 좌석 삭제. participants.seat_id는 ON DELETE SET NULL이라, 그 좌석에 앉아있던 손님은
// 좌석 미배정 상태로 돌아간다 (강퇴되지 않음).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { operator_token, seat_id } = await req.json()

  if (!operator_token || !seat_id) {
    return NextResponse.json({ error: '운영자 세션과 좌석 id가 필요합니다' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const owner = await verifyVenueOwner(supabase, id, operator_token, '좌석을 관리할 수 있습니다')
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status })

  const { error } = await supabase
    .from('venue_seats')
    .delete()
    .eq('id', seat_id)
    .eq('venue_id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
