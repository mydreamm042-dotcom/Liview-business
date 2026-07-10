import { createServerSupabaseClient } from '@/lib/supabase/server'

type ServerSupabase = Awaited<ReturnType<typeof createServerSupabaseClient>>

// venues/[id]/route.ts(PATCH)와 venues/[id]/seats/route.ts가 각자 따로 갖고 있던
// "이 operator_token이 이 매장의 진짜 소유자인가" 체크를 하나로 모은 것. actionLabel만
// 라우트별 에러 문구에 끼워 넣는다 (예: "설정을 변경할 수 있습니다" vs "좌석을 관리할 수 있습니다").
export async function verifyVenueOwner(
  supabase: ServerSupabase,
  venueId: string,
  operatorToken: string,
  actionLabel: string,
) {
  const { data: venue } = await supabase
    .from('venues')
    .select('id, operator_owner_token')
    .eq('id', venueId)
    .maybeSingle()

  if (!venue) return { ok: false as const, status: 404, error: '매장을 찾을 수 없습니다' }
  if (venue.operator_owner_token !== operatorToken) {
    return { ok: false as const, status: 403, error: `매장 운영자만 ${actionLabel}` }
  }
  return { ok: true as const }
}
