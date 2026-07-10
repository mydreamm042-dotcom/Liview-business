import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { verifyVenueOwner } from '@/lib/server/venueAuth'

// 공개 조회용 브랜딩 필드. operator_owner_token은 물론 public_chat_enabled 같은
// 운영 설정도 굳이 외부에 노출할 필요가 없어 화이트리스트 방식으로 고른다.
const PUBLIC_FIELDS =
  'id, name, category, logo_url, hero_image_url, primary_color, secondary_color, ' +
  'naver_review_url, google_review_url, kakao_review_url'

// 운영자가 수정할 수 있는 필드 화이트리스트. 이 밖의 키는 무시된다
// (operator_owner_token 탈취 시도, created_at 조작 등 방지).
const UPDATABLE_FIELDS = [
  'name', 'category', 'address', 'latitude', 'longitude',
  'logo_url', 'hero_image_url', 'primary_color', 'secondary_color',
  'naver_review_url', 'google_review_url', 'kakao_review_url',
  'public_chat_enabled',
  'join_password_enabled', 'join_password', 'geofence_radius_m',
] as const

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const operator_token = searchParams.get('operator_token')
  const supabase = await createServerSupabaseClient()

  // 운영자 본인 조회면 전체 필드(토큰 제외), 아니면 공개 브랜딩 필드만
  if (operator_token) {
    const { data: venue } = await supabase
      .from('venues')
      .select('*')
      .eq('id', id)
      .eq('operator_owner_token', operator_token)
      .maybeSingle()

    if (venue) {
      const { operator_owner_token: _t, ...safe } = venue
      void _t
      return NextResponse.json({ venue: safe, isOwner: true })
    }
    // 토큰이 틀린 경우에도 존재 여부를 숨기지 않고 공개 필드 조회로 넘어간다
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
  const { operator_token } = body

  if (!operator_token) {
    return NextResponse.json({ error: '운영자 세션이 필요합니다' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()

  const owner = await verifyVenueOwner(supabase, id, operator_token, '설정을 변경할 수 있습니다')
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
