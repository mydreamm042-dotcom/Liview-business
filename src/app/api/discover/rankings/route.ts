import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// 지역별 TOP10 랭킹 (Discovery 도메인, BUSINESS_RULES.md §2.7 "지역별 TOP10 랭킹"). 손님 전용.
// HOT/실시간 별점/헌팅(하트) 세 지표로 각각 상위 10개 매장을 반환한다. 방 코드/QR은 포함하지
// 않는다(§2.6). get_live_hot_venues와 같은 무결성 규칙을 따른다.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const latParam = searchParams.get('lat')
  const lngParam = searchParams.get('lng')
  const radiusKm = Number(searchParams.get('radius_km') ?? 10)

  if (latParam === null || lngParam === null) {
    return NextResponse.json({ error: '위치 정보(lat, lng)가 필요합니다' }, { status: 400 })
  }

  const lat = Number(latParam)
  const lng = Number(lngParam)

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: '위치 정보(lat, lng)가 필요합니다' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase.rpc('get_regional_rankings', {
    p_lat: lat,
    p_lng: lng,
    p_radius_km: radiusKm,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? { hot: [], star: [], heart: [] })
}
