import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

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

async function verifyOwner(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  venueId: string,
  operatorToken: string,
) {
  const { data: venue } = await supabase
    .from('venues')
    .select('id, operator_owner_token')
    .eq('id', venueId)
    .maybeSingle()

  if (!venue) return { ok: false as const, status: 404, error: '매장을 찾을 수 없습니다' }
  if (venue.operator_owner_token !== operatorToken) {
    return { ok: false as const, status: 403, error: '매장 운영자만 좌석을 관리할 수 있습니다' }
  }
  return { ok: true as const }
}

// 좌석 추가. 정렬 순서는 뒤에 이어붙인다 (기존 좌석 수를 세어 다음 순번을 부여).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { operator_token, label } = await req.json()

  if (!operator_token || !label?.trim()) {
    return NextResponse.json({ error: '운영자 세션과 좌석 이름이 필요합니다' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const owner = await verifyOwner(supabase, id, operator_token)
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status })

  const { count } = await supabase
    .from('venue_seats')
    .select('id', { count: 'exact', head: true })
    .eq('venue_id', id)

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
  const owner = await verifyOwner(supabase, id, operator_token)
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
  const owner = await verifyOwner(supabase, id, operator_token)
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
