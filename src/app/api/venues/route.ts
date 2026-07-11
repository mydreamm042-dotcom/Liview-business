import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireOperator } from '@/lib/server/venueAuth'
import { VenueCategory } from '@/lib/supabase/types'

const VALID_CATEGORIES: VenueCategory[] = ['bar', 'pub', 'pocha', 'wine_bar', 'cafe', 'event_hall', 'etc']

// operator_owner_token은 전환 기간 한정 필드라 응답에 담지 않는다 (host_session을
// 숨기는 것과 동일 원칙 — Operator 도메인, BUSINESS_RULES.md §2.11).
function sanitizeVenue<T extends { operator_owner_token?: string }>(venue: T) {
  const { operator_owner_token: _t, ...safe } = venue
  void _t
  return safe
}

// 매장 등록. 로그인한 운영자 계정(owner_id) 소유로 만들어진다.
export async function POST(req: NextRequest) {
  const { name, category, address } = await req.json()

  if (!name?.trim()) {
    return NextResponse.json({ error: '매장 이름이 필요합니다' }, { status: 400 })
  }
  if (category && !VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: '유효하지 않은 매장 분류입니다' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const auth = await requireOperator(supabase)
  if (!auth.ok) return auth.response

  const { data: venue, error } = await supabase
    .from('venues')
    .insert({
      name: name.trim(),
      category: category ?? null,
      address: address ?? null,
      owner_id: auth.user.id,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ venue: sanitizeVenue(venue) })
}

// 내 매장 목록 조회 (로그인한 운영자 계정 기준)
export async function GET() {
  const supabase = await createServerSupabaseClient()
  const auth = await requireOperator(supabase)
  if (!auth.ok) return auth.response

  const { data: venues, error } = await supabase
    .from('venues')
    .select('*')
    .eq('owner_id', auth.user.id)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ venues: (venues ?? []).map(sanitizeVenue) })
}
