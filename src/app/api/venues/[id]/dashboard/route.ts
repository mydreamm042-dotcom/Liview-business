import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireOperator, verifyVenueOwner } from '@/lib/server/venueAuth'

// 운영자 대시보드 (Operator Analytics 도메인, BUSINESS_RULES.md §2.10 "Phase 5"). 매장의
// 지난 영업일(마감된 BUSINESS 방)을 get_operator_dashboard() RPC 한 번으로 집계해 받는다 —
// 여러 테이블을 API 서버에서 따로 조회해 합치면 영업일이 쌓일수록 왕복/전송량이 늘어난다.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const daysParam = searchParams.get('days')
  const days = daysParam ? Math.min(365, Math.max(1, parseInt(daysParam, 10) || 90)) : 90

  const supabase = await createServerSupabaseClient()
  const auth = await requireOperator(supabase)
  if (!auth.ok) return auth.response

  const owner = await verifyVenueOwner(supabase, id, auth.user.id, '운영 리포트를 볼 수 있습니다')
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status })

  const { data, error } = await supabase.rpc('get_operator_dashboard', {
    p_venue_id: id,
    p_days: days,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ dashboard: data })
}
