import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireOperator } from '@/lib/server/venueAuth'

// 운영자가 방 화면에서 남기는 타임스탬프 메모 (operation_events, BUSINESS_RULES.md §2.10
// "이벤트 기록 예외, 갱신 확정"). 사전 정의된 이벤트 타입이 아니라 자유 텍스트다.
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const supabase = await createServerSupabaseClient()

  const { data: room } = await supabase
    .from('rooms')
    .select('id')
    .eq('code', code.toUpperCase())
    .maybeSingle()

  if (!room) {
    return NextResponse.json({ error: '방을 찾을 수 없습니다' }, { status: 404 })
  }

  const { data: events, error } = await supabase
    .from('operation_events')
    .select('id, content, created_at')
    .eq('room_id', room.id)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ events: events ?? [] })
}

// 메모 추가. 방 화면에서 운영자만 남길 수 있다 (Seating/Guest Care와 같은 "트리거 화면
// 위치" 판정 방식 — room_id -> venue_id -> owner_id 로그인 확인).
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const { content } = await req.json()

  if (typeof content !== 'string' || !content.trim()) {
    return NextResponse.json({ error: '메모 내용이 필요합니다' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const auth = await requireOperator(supabase)
  if (!auth.ok) return auth.response

  const { data: room } = await supabase
    .from('rooms')
    .select('id, venue_id')
    .eq('code', code.toUpperCase())
    .maybeSingle()

  if (!room) {
    return NextResponse.json({ error: '방을 찾을 수 없습니다' }, { status: 404 })
  }

  const { data: venue } = await supabase
    .from('venues')
    .select('owner_id')
    .eq('id', room.venue_id)
    .maybeSingle()

  if (venue?.owner_id !== auth.user.id) {
    return NextResponse.json({ error: '운영자만 메모를 남길 수 있습니다' }, { status: 403 })
  }

  const { data: event, error } = await supabase
    .from('operation_events')
    .insert({ room_id: room.id, content: content.trim() })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ event })
}
