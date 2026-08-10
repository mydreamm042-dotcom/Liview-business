import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// 실시간 공개 채팅 (Public Transparency 도메인, BUSINESS_RULES.md §2.5).
// 기본 비활성화, 매장이 opt-in(public_chat_enabled)한 경우에만 노출.
// 응답에는 sender_nickname/content/created_at만 포함 — 개인 식별 정보는 절대 포함하지 않는다.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { data: venue } = await supabase
    .from('venues')
    .select('id, public_chat_enabled')
    .eq('id', id)
    .maybeSingle()

  if (!venue) {
    return NextResponse.json({ error: '매장을 찾을 수 없습니다' }, { status: 404 })
  }

  if (!venue.public_chat_enabled) {
    return NextResponse.json({ error: '이 매장은 채팅을 공개하지 않습니다' }, { status: 403 })
  }

  // 오직 현재 active 상태인 방의 채팅만 공개한다. closed 방의 과거 채팅은 공개하지 않는다.
  const { data: room } = await supabase
    .from('rooms')
    .select('id')
    .eq('venue_id', id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!room) {
    return NextResponse.json({ messages: [] })
  }

  const { data: messages, error } = await supabase
    .from('messages')
    .select('sender_nickname, content, created_at')
    .eq('room_id', room.id)
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ messages: messages ?? [] })
}
