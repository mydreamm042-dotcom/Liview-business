import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { VenueBranding } from '@/lib/supabase/types'

type VenueWithOwner = VenueBranding & { owner_id: string | null }

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const { searchParams } = new URL(req.url)
  const session_token = searchParams.get('session_token')
  const supabase = await createServerSupabaseClient()

  const { data: room, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('code', code.toUpperCase())
    .single()

  if (error || !room) {
    return NextResponse.json({ error: '방을 찾을 수 없습니다' }, { status: 404 })
  }

  // left_at이 채워진(나간) 참여자도 함께 내려준다 — 결과 페이지 집계에는 필요하고,
  // 방 화면의 참여자 목록은 클라이언트(useRoom)에서 left_at 없는 사람만 걸러 쓴다.
  // seat_id/seat_assigned_at: Seating 도메인(§2.8) — PERSONAL 방은 항상 null
  const { data: participants } = await supabase
    .from('participants')
    .select('id, room_id, joined_at, nickname, left_at, seat_id, seat_assigned_at')
    .eq('room_id', room.id)
    .order('joined_at', { ascending: true })

  // host_session은 호스트 권한 판정용 비밀값이라 클라이언트에 그대로 보내지 않는다
  // (그대로 보내면 참여자가 devtools로 값을 읽어 호스트인 척 방을 종료시킬 수 있음).
  // 대신 서버가 여기서 판정한 boolean만 내려준다.
  const { host_session, ...safeRoom } = room
  void host_session

  // BUSINESS 방이면 매장 브랜딩 + 좌석 목록을 함께 내려준다. 참여자 화면이 방 이름보다
  // 매장 브랜딩을 우선 노출하는 데 쓴다. PERSONAL 방은 둘 다 null/빈 배열.
  let venue = null
  let seats: unknown[] = []
  let isHost: boolean
  if (room.room_type === 'BUSINESS' && room.venue_id) {
    const { data: venueData } = await supabase
      .from('venues')
      .select(
        'id, name, category, logo_url, hero_image_url, primary_color, secondary_color, ' +
        'naver_review_url, google_review_url, kakao_review_url, latitude, longitude, geofence_radius_m, owner_id'
      )
      .eq('id', room.venue_id)
      .maybeSingle<VenueWithOwner>()

    // Operator 도메인(§2.11) 전환 이후 BUSINESS 방의 호스트 판정은 host_session 문자열
    // 비교가 아니라 "로그인한 이 계정이 이 매장의 owner_id인가"로 한다 — session_token
    // 쿼리 파라미터는 원래 익명 참여자 세션용이라 실제 로그인 신원과 무관하다.
    const { data: { user } } = await supabase.auth.getUser()
    isHost = !!user && venueData?.owner_id === user.id

    if (venueData) {
      const { owner_id: _ownerId, ...safeVenue } = venueData
      void _ownerId
      venue = safeVenue
    }

    const { data: seatData } = await supabase
      .from('venue_seats')
      .select('id, venue_id, label, sort_order, position_x, position_y, created_at')
      .eq('venue_id', room.venue_id)
      .order('sort_order', { ascending: true })
    seats = seatData ?? []
  } else {
    // PERSONAL 방은 기존 그대로 — 익명 session_token과 host_session을 직접 비교한다.
    isHost = session_token != null && room.host_session === session_token
  }

  return NextResponse.json({ room: safeRoom, participants, isHost, venue, seats })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const { host_session, status, name } = await req.json()
  const supabase = await createServerSupabaseClient()

  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('code', code.toUpperCase())
    .single()

  if (!room) {
    return NextResponse.json({ error: '방을 찾을 수 없습니다' }, { status: 404 })
  }

  if (room.room_type === 'BUSINESS' && room.venue_id) {
    // BUSINESS 방은 로그인 세션 + venues.owner_id로 권한을 판정한다 (host_session
    // 문자열은 더 이상 권한 판정에 쓰이지 않는다 — Operator 도메인 §2.11 전환).
    const { data: { user } } = await supabase.auth.getUser()
    const { data: venue } = await supabase
      .from('venues')
      .select('owner_id')
      .eq('id', room.venue_id)
      .maybeSingle()

    if (!user || venue?.owner_id !== user.id) {
      return NextResponse.json({ error: '운영자만 이 방을 변경할 수 있습니다' }, { status: 403 })
    }
  } else if (room.host_session !== host_session) {
    // PERSONAL 방은 기존 그대로 — 익명 host_session 문자열 비교.
    return NextResponse.json({ error: '호스트만 이 방을 변경할 수 있습니다' }, { status: 403 })
  }

  const updatePayload: Record<string, unknown> = {}

  // 세션(오늘 영업) 표시 이름 변경 — 매장명(venues.name)과 달리 그날그날 자유롭게 바꿀 수
  // 있다 (BUSINESS_RULES.md §2.2 "매장명 변경 금지"). status와 독립적으로 보낼 수 있다.
  if (typeof name === 'string') {
    if (!name.trim()) {
      return NextResponse.json({ error: '방 이름이 필요합니다' }, { status: 400 })
    }
    updatePayload.name = name.trim()
  }

  if (status) {
    // BUSINESS 방은 "종료(ended)"가 아니라 "마감(closed)"으로 전이한다. closed 방은
    // cleanup 삭제 대상이 아니어서 매장 이력으로 영구 보존된다 (BUSINESS_RULES 2.1).
    // 기존 UI가 보내는 status='ended'를 서버가 매핑하므로 클라이언트 수정 없이도 규칙이 지켜진다.
    const resolvedStatus = room.room_type === 'BUSINESS' && status === 'ended' ? 'closed' : status
    updatePayload.status = resolvedStatus
    if (resolvedStatus === 'ended' || resolvedStatus === 'closed') {
      updatePayload.ended_at = new Date().toISOString()
    }
  }

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ error: '변경할 항목이 없습니다' }, { status: 400 })
  }

  const { data: updated, error } = await supabase
    .from('rooms')
    .update(updatePayload)
    .eq('id', room.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { host_session: _hs, ...safeUpdated } = updated
  void _hs
  return NextResponse.json({ room: safeUpdated })
}
