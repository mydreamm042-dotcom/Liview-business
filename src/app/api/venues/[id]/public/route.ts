import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// 매장 상세 바텀시트용 공개 데이터 (Discovery 도메인, BUSINESS_RULES.md §2.7 "매장 상세 화면 v4").
// 지도 마커/지역 랭킹/장소 검색 어느 경로로 들어와도 이 라우트로 상세를 채운다.
// 방 코드/QR·sender/개인식별 정보는 포함하지 않는다(§2.6 무결성 규칙).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase.rpc('get_venue_public_detail', { p_venue_id: id })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data || !data.venue) {
    return NextResponse.json({ error: '매장을 찾을 수 없습니다' }, { status: 404 })
  }

  return NextResponse.json(data)
}
