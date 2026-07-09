import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { joinOrReviveParticipant } from '@/lib/server/joinParticipant'
import { distanceMeters } from '@/lib/geo'

// 고정 QR 기반 입장 (BUSINESS 전용). 참여자는 방 코드를 모르고/입력하지 않는다 — 스캔한
// venue_id로 "지금 진행 중인 세션"에 들어간다. 두 가지 악용 방지 장치를 함께 검사한다
// (BUSINESS_RULES.md §2.2, §1.2 확장): 운영자가 켠 경우에만 검사하는 입장 비밀번호,
// 그리고 참여자 위치가 매장 반경 이내인지 (항상 검사).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { nickname, session_token, password, lat, lng } = await req.json()

  if (!nickname || !session_token) {
    return NextResponse.json({ error: '닉네임과 세션이 필요합니다' }, { status: 400 })
  }
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return NextResponse.json({ error: '위치 정보가 필요합니다' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()

  const { data: venue } = await supabase
    .from('venues')
    .select('id, latitude, longitude, join_password_enabled, join_password, geofence_radius_m')
    .eq('id', id)
    .maybeSingle()

  if (!venue) {
    return NextResponse.json({ error: '매장을 찾을 수 없습니다' }, { status: 404 })
  }

  if (venue.join_password_enabled) {
    if (!password || password !== venue.join_password) {
      return NextResponse.json({ error: '입장 비밀번호가 올바르지 않습니다' }, { status: 403 })
    }
  }

  if (venue.latitude != null && venue.longitude != null) {
    const distance = distanceMeters(lat, lng, venue.latitude, venue.longitude)
    if (distance > venue.geofence_radius_m) {
      return NextResponse.json({ error: '매장 위치에서 너무 멀리 떨어져 있습니다' }, { status: 403 })
    }
  }

  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('venue_id', id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!room) {
    return NextResponse.json({ error: '아직 영업을 시작하지 않았습니다' }, { status: 400 })
  }

  const { participant, error } = await joinOrReviveParticipant(supabase, room.id, nickname, session_token)

  if (error || !participant) {
    return NextResponse.json({ error: error?.message ?? '입장에 실패했습니다' }, { status: 500 })
  }

  const { host_session: _hs, ...safeRoom } = room
  void _hs
  return NextResponse.json({ room: safeRoom, participant })
}
