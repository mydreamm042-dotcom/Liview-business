import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// 위치 기반 실시간 HOT 매장 목록. Discovery 도메인의 핵심 무결성 규칙(BUSINESS_RULES.md §2.6):
// 이 응답은 방 코드/QR을 절대 포함하지 않는다. 참여는 반드시 실제 방문 + QR 스캔으로만 가능.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const latParam = searchParams.get('lat')
  const lngParam = searchParams.get('lng')
  const category = searchParams.get('category')
  const radiusKm = Number(searchParams.get('radius_km') ?? 10)

  // Number(null)이 0으로 평가돼 "위치 없음"이 (0, 0)으로 통과해버리는 것을 막기 위해
  // 파라미터 존재 여부를 먼저 확인한 뒤에만 숫자로 변환한다.
  if (latParam === null || lngParam === null) {
    return NextResponse.json({ error: '위치 정보(lat, lng)가 필요합니다' }, { status: 400 })
  }

  const lat = Number(latParam)
  const lng = Number(lngParam)

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: '위치 정보(lat, lng)가 필요합니다' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase.rpc('get_live_hot_venues', {
    p_lat: lat,
    p_lng: lng,
    p_radius_km: radiusKm,
    p_category: category || null,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ venues: data ?? [] })
}
