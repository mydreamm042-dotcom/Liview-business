import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireOperator, verifyVenueOwner } from '@/lib/server/venueAuth'
import { normalizeDay, validateDay, BusinessHoursDay } from '@/lib/businessHours'

// 요일별 영업시간 조회 — 공개(참여자/향후 Discovery 화면도 쓸 수 있도록). 설정 안 된
// 매장은 빈 배열을 반환한다.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('venue_business_hours')
    .select('weekday, is_closed, is_24h, open_time, close_time, last_order_time')
    .eq('venue_id', id)
    .order('weekday', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ hours: data ?? [] })
}

// 요일별 영업시간 저장. 7개 요일을 한 번에 통째로 덮어쓴다 — 부분 수정 API가 아니라
// 설정 화면에서 항상 7일 전체를 편집/저장하는 흐름과 맞춘다.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { hours } = await req.json()

  if (!Array.isArray(hours) || hours.length !== 7) {
    return NextResponse.json({ error: '7개 요일 전부의 영업시간이 필요합니다' }, { status: 400 })
  }

  const seenWeekdays = new Set<number>()
  for (const day of hours) {
    if (typeof day?.weekday !== 'number' || day.weekday < 0 || day.weekday > 6 || seenWeekdays.has(day.weekday)) {
      return NextResponse.json({ error: '요일 값이 올바르지 않습니다' }, { status: 400 })
    }
    seenWeekdays.add(day.weekday)
  }

  const normalized: BusinessHoursDay[] = hours.map(normalizeDay)
  for (const day of normalized) {
    const err = validateDay(day)
    if (err) return NextResponse.json({ error: err }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const auth = await requireOperator(supabase)
  if (!auth.ok) return auth.response

  const owner = await verifyVenueOwner(supabase, id, auth.user.id, '영업시간을 설정할 수 있습니다')
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status })

  const { error } = await supabase
    .from('venue_business_hours')
    .upsert(
      normalized.map(day => ({ venue_id: id, ...day })),
      { onConflict: 'venue_id,weekday' },
    )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
