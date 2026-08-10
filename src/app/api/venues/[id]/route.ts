import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { verifyVenueOwner } from '@/lib/server/venueAuth'

// 공개 조회용 브랜딩 필드. operator_owner_token은 물론 public_chat_enabled 같은
// 운영 설정도 굳이 외부에 노출할 필요가 없어 화이트리스트 방식으로 고른다.
// join_password_enabled는 예외적으로 공개 — "비밀번호가 필요한지" 여부만 알려주는
// boolean이고 실제 비밀번호(join_password)는 절대 포함하지 않는다. 이 값이 없으면
// /v/[id] 랜딩 화면이 비밀번호가 필요한지 미리 알 수 없어, 참여자가 일단 제출해서
// 틀렸다는 응답을 받고서야 입력창이 뜨는 혼란스러운 흐름이 된다.
const PUBLIC_FIELDS =
  'id, name, category, logo_url, hero_image_url, description, primary_color, secondary_color, ' +
  'naver_review_url, google_review_url, kakao_review_url, join_password_enabled'

// 운영자가 수정할 수 있는 필드 화이트리스트. 이 밖의 키는 무시된다
// (owner_id 위조 시도, created_at 조작 등 방지). name은 의도적으로 제외한다 —
// 등록 이후 매장명은 변경 불가(BUSINESS_RULES.md §2.2 "매장명 변경 금지") —
// 향후 매장 실재 검증 시스템이 이 이름을 근거로 판정할 예정이기 때문이다.
const UPDATABLE_FIELDS = [
  'category', 'address', 'latitude', 'longitude',
  'logo_url', 'hero_image_url', 'description', 'primary_color', 'secondary_color',
  'naver_review_url', 'google_review_url', 'kakao_review_url',
  'public_chat_enabled',
  'join_password_enabled', 'join_password', 'geofence_radius_m',
] as const

// 로그인 세션이 쿠키로 오므로 별도 파라미터 없이도 "본인 소유 매장인지"를 서버가 안다
// (Operator 도메인, BUSINESS_RULES.md §2.11). 로그인 안 했거나 남의 매장이면 공개
// 필드만 내려준다 — 존재 여부 자체는 숨기지 않는다(참여자 랜딩 화면도 이 응답을 쓰므로).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: venue } = await supabase
      .from('venues')
      .select('*')
      .eq('id', id)
      .eq('owner_id', user.id)
      .maybeSingle()

    if (venue) {
      const { operator_owner_token: _t, ...safe } = venue
      void _t
      return NextResponse.json({ venue: safe, isOwner: true })
    }
  }

  const { data: venue, error } = await supabase
    .from('venues')
    .select(PUBLIC_FIELDS)
    .eq('id', id)
    .maybeSingle()

  if (error || !venue) {
    return NextResponse.json({ error: '매장을 찾을 수 없습니다' }, { status: 404 })
  }

  return NextResponse.json({ venue, isOwner: false })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const owner = await verifyVenueOwner(supabase, id, user.id, '설정을 변경할 수 있습니다')
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status })

  const updatePayload: Record<string, unknown> = {}
  for (const field of UPDATABLE_FIELDS) {
    if (field in body) updatePayload[field] = body[field]
  }

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ error: '변경할 항목이 없습니다' }, { status: 400 })
  }

  updatePayload.updated_at = new Date().toISOString()

  const { data: updated, error } = await supabase
    .from('venues')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { operator_owner_token: _t, ...safe } = updated
  void _t
  return NextResponse.json({ venue: safe })
}
