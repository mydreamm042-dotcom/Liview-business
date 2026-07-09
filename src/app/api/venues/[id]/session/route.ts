import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { generateRoomCode } from '@/lib/session'

// 매장의 "현재 진행 중인 오늘 세션" 조회. 운영자 설정 화면이 영업 시작/종료 버튼 상태를
// 결정하는 데 쓴다. code는 운영자가 방 화면(호스트 뷰)에 들어갈 때만 필요하므로, 소유자
// 검증된 operator_token이 있을 때만 포함한다 — 검증 없이는 기존과 동일하게 code를 뺀다
// (BUSINESS_RULES.md §1.1 — 고정 QR 입장은 참여자에게 code를 노출/요구하지 않는다).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const operator_token = searchParams.get('operator_token')
  const supabase = await createServerSupabaseClient()

  let isOwner = false
  if (operator_token) {
    const { data: venue } = await supabase
      .from('venues')
      .select('operator_owner_token')
      .eq('id', id)
      .maybeSingle()
    isOwner = venue?.operator_owner_token === operator_token
  }

  const { data: room } = await supabase
    .from('rooms')
    .select(isOwner ? 'id, code, name, status, created_at' : 'id, name, status, created_at')
    .eq('venue_id', id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ session: room ?? null })
}

// "오늘 영업 시작". 매장 운영자가 방 이름을 직접 짓지 않아도 되도록 자동으로 이름을 붙인다.
// 이미 진행 중인 세션이 있으면 새로 만들지 않고 그 세션을 그대로 반환한다(중복 시작 방지).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { operator_token } = await req.json()

  if (!operator_token) {
    return NextResponse.json({ error: '운영자 세션이 필요합니다' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()

  const { data: venue } = await supabase
    .from('venues')
    .select('id, name, operator_owner_token')
    .eq('id', id)
    .maybeSingle()

  if (!venue) {
    return NextResponse.json({ error: '매장을 찾을 수 없습니다' }, { status: 404 })
  }
  if (venue.operator_owner_token !== operator_token) {
    return NextResponse.json({ error: '매장 운영자만 영업을 시작할 수 있습니다' }, { status: 403 })
  }

  const { data: existingSession } = await supabase
    .from('rooms')
    .select('id, code, name, status, created_at')
    .eq('venue_id', id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (existingSession) {
    return NextResponse.json({ session: existingSession, alreadyOpen: true })
  }

  // rooms.code는 여전히 내부 URL 슬러그로 쓰이므로 계속 생성한다 (BUSINESS_RULES.md §2.2 —
  // 참여자에게 노출/요구하지 않을 뿐, 컬럼 자체를 없애는 건 아니다).
  let code = ''
  let attempts = 0
  while (attempts < 10) {
    code = generateRoomCode()
    const { data } = await supabase.from('rooms').select('id').eq('code', code).maybeSingle()
    if (!data) break
    attempts++
  }

  const todayLabel = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })

  const { data: room, error } = await supabase
    .from('rooms')
    .insert({
      code,
      name: `${venue.name} ${todayLabel}`,
      host_session: operator_token,
      status: 'active',
      room_type: 'BUSINESS',
      venue_id: id,
    })
    .select('id, code, name, status, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ session: room, alreadyOpen: false })
}

// "영업 종료". 기존 방 종료 로직(BUSINESS_RULES.md §2.1)과 동일하게 closed로 전이한다 —
// ended가 아니라 closed이므로 cleanup 대상이 되지 않고 매장 이력으로 영구 보존된다.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const operator_token = searchParams.get('operator_token')

  if (!operator_token) {
    return NextResponse.json({ error: '운영자 세션이 필요합니다' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()

  const { data: venue } = await supabase
    .from('venues')
    .select('id, operator_owner_token')
    .eq('id', id)
    .maybeSingle()

  if (!venue) {
    return NextResponse.json({ error: '매장을 찾을 수 없습니다' }, { status: 404 })
  }
  if (venue.operator_owner_token !== operator_token) {
    return NextResponse.json({ error: '매장 운영자만 영업을 종료할 수 있습니다' }, { status: 403 })
  }

  const { data: session } = await supabase
    .from('rooms')
    .select('id')
    .eq('venue_id', id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (!session) {
    return NextResponse.json({ error: '진행 중인 영업이 없습니다' }, { status: 400 })
  }

  const { data: closed, error } = await supabase
    .from('rooms')
    .update({ status: 'closed', ended_at: new Date().toISOString() })
    .eq('id', session.id)
    .select('id, code, name, status, created_at, ended_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ session: closed })
}
