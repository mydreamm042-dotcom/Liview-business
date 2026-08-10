import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type ServerSupabase = Awaited<ReturnType<typeof createServerSupabaseClient>>

// 운영자 API 라우트 공통 진입점 (Operator 도메인, BUSINESS_RULES.md §2.11). 더 이상
// operator_token을 요청 본문에서 받지 않고, Supabase Auth 세션(쿠키)에서 신원을 읽는다 —
// 클라이언트가 값을 조작하거나 XSS로 훔쳐낼 여지가 없다.
export async function requireOperator(supabase: ServerSupabase) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 }) }
  }
  return { ok: true as const, user }
}

// "이 로그인한 사용자가 이 매장의 진짜 소유자인가" 체크. venues/[id]/route.ts(PATCH)와
// venues/[id]/seats/route.ts가 각자 따로 갖고 있던 로직을 하나로 모은 것. actionLabel만
// 라우트별 에러 문구에 끼워 넣는다 (예: "설정을 변경할 수 있습니다" vs "좌석을 관리할 수 있습니다").
export async function verifyVenueOwner(
  supabase: ServerSupabase,
  venueId: string,
  userId: string,
  actionLabel: string,
) {
  const { data: venue } = await supabase
    .from('venues')
    .select('id, owner_id')
    .eq('id', venueId)
    .maybeSingle()

  if (!venue) return { ok: false as const, status: 404, error: '매장을 찾을 수 없습니다' }
  if (venue.owner_id !== userId) {
    return { ok: false as const, status: 403, error: `매장 운영자만 ${actionLabel}` }
  }
  return { ok: true as const }
}
