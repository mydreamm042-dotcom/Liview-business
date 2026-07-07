import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const room_id = searchParams.get('room_id')

  if (!room_id) {
    return NextResponse.json({ error: 'room_id가 필요합니다' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  // 최신순으로 500개만 가져온 뒤 시간순으로 뒤집어 반환한다. 오름차순 + 무제한으로
  // 가져오면 PostgREST 기본 상한(1000행)에 걸렸을 때 "오래된 쪽 1000개"만 내려와
  // 정작 최신 대화가 잘려나가기 때문.
  const { data, error } = await supabase
    .from('messages')
    .select('id, room_id, sender_participant_id, sender_nickname, content, created_at')
    .eq('room_id', room_id)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ messages: (data ?? []).reverse() })
}

export async function POST(req: NextRequest) {
  const { room_id, session_token, content } = await req.json()

  if (!room_id || !session_token || !content?.trim()) {
    return NextResponse.json({ error: '필수 파라미터가 누락됐습니다' }, { status: 400 })
  }

  const trimmed = content.trim().slice(0, 300)
  const supabase = await createServerSupabaseClient()

  const { data: sender } = await supabase
    .from('participants')
    .select('id, nickname')
    .eq('room_id', room_id).eq('session_token', session_token)
    .limit(1).maybeSingle()

  if (!sender) {
    return NextResponse.json({ error: '참여자 정보를 찾을 수 없습니다' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('messages')
    .insert({
      room_id,
      sender_participant_id: sender.id,
      sender_nickname: sender.nickname,
      content: trimmed,
    })
    .select('id, room_id, sender_participant_id, sender_nickname, content, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ message: data })
}
