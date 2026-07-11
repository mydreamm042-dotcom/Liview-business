import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireOperator, verifyVenueOwner } from '@/lib/server/venueAuth'

// 매장 좌석 마스터 목록 (Seating 도메인, BUSINESS_RULES.md §2.8). 세션(오늘 영업)이 몇 번
// 바뀌어도 유지되는 Venue 소유 데이터라 venue_id 하나로만 관리한다.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { data: seats, error } = await supabase
    .from('venue_seats')
    .select('id, venue_id, label, sort_order, position_x, position_y, created_at')
    .eq('venue_id', id)
    .order('sort_order', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ seats: seats ?? [] })
}

// 한 좌석당 배치 가능한 열 수 — 새 좌석의 기본 위치를 겹치지 않게 격자로 흩뿌리는 데만 쓴다.
// 운영자가 어차피 바로 드래그로 원하는 위치에 옮길 것이므로 정교할 필요는 없다.
const DEFAULT_GRID_COLS = 4

// 좌석 추가. 정렬 순서는 뒤에 이어붙이고, 위치는 지정하지 않으면 격자로 기본 배치한다
// (운영자가 이후 자유 배치 캔버스에서 드래그로 원하는 자리에 옮긴다, §2.8 "좌석 배치 자유 구성").
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { label, position_x, position_y } = await req.json()

  if (!label?.trim()) {
    return NextResponse.json({ error: '좌석 이름이 필요합니다' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const auth = await requireOperator(supabase)
  if (!auth.ok) return auth.response

  // 소유자 확인과 "기존 좌석 몇 개인지"는 서로 결과를 필요로 하지 않으므로 병렬로 보낸다
  // (직렬로 하면 왕복 시간이 그대로 두 배로 더해짐 — INSERT만 둘 다 끝난 뒤 실행).
  const [owner, countResult] = await Promise.all([
    verifyVenueOwner(supabase, id, auth.user.id, '좌석을 관리할 수 있습니다'),
    supabase.from('venue_seats').select('id', { count: 'exact', head: true }).eq('venue_id', id),
  ])
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status })
  const { count } = countResult

  const index = count ?? 0
  const col = index % DEFAULT_GRID_COLS
  const row = Math.floor(index / DEFAULT_GRID_COLS)

  const { data: seat, error } = await supabase
    .from('venue_seats')
    .insert({
      venue_id: id,
      label: label.trim(),
      sort_order: index,
      position_x: typeof position_x === 'number' ? position_x : 15 + col * 25,
      position_y: typeof position_y === 'number' ? position_y : 20 + row * 30,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ seat })
}

// 좌석 이름/위치 수정. label과 position_x/position_y는 각각 독립적으로 보낼 수 있다 —
// 드래그로 위치만 옮길 때마다 이름까지 다시 보낼 필요가 없게 하기 위함.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { seat_id, label, position_x, position_y } = await req.json()

  if (!seat_id) {
    return NextResponse.json({ error: '좌석 id가 필요합니다' }, { status: 400 })
  }

  const updatePayload: Record<string, unknown> = {}
  if (typeof label === 'string') {
    if (!label.trim()) {
      return NextResponse.json({ error: '좌석 이름이 필요합니다' }, { status: 400 })
    }
    updatePayload.label = label.trim()
  }
  if (typeof position_x === 'number') updatePayload.position_x = position_x
  if (typeof position_y === 'number') updatePayload.position_y = position_y

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ error: '변경할 항목이 없습니다' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const auth = await requireOperator(supabase)
  if (!auth.ok) return auth.response

  const owner = await verifyVenueOwner(supabase, id, auth.user.id, '좌석을 관리할 수 있습니다')
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status })

  const { data: seat, error } = await supabase
    .from('venue_seats')
    .update(updatePayload)
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
  const { seat_id } = await req.json()

  if (!seat_id) {
    return NextResponse.json({ error: '좌석 id가 필요합니다' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const auth = await requireOperator(supabase)
  if (!auth.ok) return auth.response

  const owner = await verifyVenueOwner(supabase, id, auth.user.id, '좌석을 관리할 수 있습니다')
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
