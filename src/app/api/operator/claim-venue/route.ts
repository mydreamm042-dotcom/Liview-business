import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireOperator } from '@/lib/server/venueAuth'

// 전환 기간 한정 API (Operator 도메인, BUSINESS_RULES.md §2.11). operator_owner_token으로
// 만들어졌던 매장을, 방금 로그인한 Supabase Auth 계정의 소유(owner_id)로 옮겨준다.
// 이미 owner_id가 채워진 매장(다른 사람이 먼저 가져간 경우 등)은 대상에서 제외한다.
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const auth = await requireOperator(supabase)
  if (!auth.ok) return auth.response

  const { operator_owner_token } = await req.json()
  if (!operator_owner_token) {
    return NextResponse.json({ error: '기존 매장 토큰이 필요합니다' }, { status: 400 })
  }

  const { data: venues, error } = await supabase
    .from('venues')
    .update({ owner_id: auth.user.id })
    .eq('operator_owner_token', operator_owner_token)
    .is('owner_id', null)
    .select('id, name')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ venues: venues ?? [] })
}
