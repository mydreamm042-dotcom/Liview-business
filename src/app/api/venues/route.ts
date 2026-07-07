import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { VenueCategory } from '@/lib/supabase/types'

const VALID_CATEGORIES: VenueCategory[] = ['bar', 'pub', 'pocha', 'wine_bar', 'cafe', 'event_hall', 'etc']

// operator_owner_token은 운영자 권한 판정용 비밀값이라 응답에 담지 않는다
// (rooms API가 host_session을 숨기는 것과 동일한 원칙).
function sanitizeVenue<T extends { operator_owner_token?: string }>(venue: T) {
  const { operator_owner_token: _t, ...safe } = venue
  void _t
  return safe
}

export async function POST(req: NextRequest) {
  const { name, category, address, operator_token } = await req.json()

  if (!name?.trim() || !operator_token) {
    return NextResponse.json({ error: '매장 이름과 운영자 세션이 필요합니다' }, { status: 400 })
  }

  if (category && !VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: '유효하지 않은 매장 분류입니다' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()

  const { data: venue, error } = await supabase
    .from('venues')
    .insert({
      name: name.trim(),
      category: category ?? null,
      address: address ?? null,
      operator_owner_token: operator_token,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ venue: sanitizeVenue(venue) })
}

// 내 매장 목록 조회 (운영자 토큰 기준)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const operator_token = searchParams.get('operator_token')

  if (!operator_token) {
    return NextResponse.json({ error: '운영자 세션이 필요합니다' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()

  const { data: venues, error } = await supabase
    .from('venues')
    .select('*')
    .eq('operator_owner_token', operator_token)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ venues: (venues ?? []).map(sanitizeVenue) })
}
