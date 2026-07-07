import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ReactionType } from '@/lib/supabase/types'
import { WARNING_COOLDOWN_MS, STAR_COOLDOWN_MS } from '@/lib/cooldown'
import { checkMutualHeart } from '@/lib/server/mutual'

export async function POST(req: NextRequest) {
  const { room_id, sender_session, receiver_id, type, value } = await req.json()

  if (!room_id || !sender_session || !receiver_id || !type) {
    return NextResponse.json({ error: '필수 파라미터가 누락됐습니다' }, { status: 400 })
  }

  const validTypes: ReactionType[] = ['heart', 'warning', 'star', 'hot']
  if (!validTypes.includes(type)) {
    return NextResponse.json({ error: '유효하지 않은 리액션 타입' }, { status: 400 })
  }

  if (type === 'star' && (value < 1 || value > 5)) {
    return NextResponse.json({ error: '별점은 1~5 사이여야 합니다' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()

  if (type !== 'hot' && type !== 'star') {
    const { data: selfCheck } = await supabase
      .from('participants').select('id')
      .eq('id', receiver_id).eq('session_token', sender_session).limit(1).maybeSingle()
    if (selfCheck) {
      return NextResponse.json({ error: '자기 자신에게는 보낼 수 없습니다' }, { status: 400 })
    }
  }

  const { data: senderParticipant } = await supabase
    .from('participants').select('id')
    .eq('room_id', room_id).eq('session_token', sender_session).limit(1).maybeSingle()
  const sender_participant_id = senderParticipant?.id ?? null

  let data: {
    id: string; room_id: string; receiver_id: string
    sender_participant_id: string | null; type: string; value: number | null
    created_at: string
  }

  if (type === 'warning' || type === 'star') {
    // 쿨타임 확인과 저장을 DB 함수 안에서 원자적으로 처리해 레이스 컨디션을 없앤다
    // (같은 발신자가 거의 동시에 두 번 요청해도 하나씩 순서대로 처리됨).
    const cooldownSeconds = Math.round((type === 'warning' ? WARNING_COOLDOWN_MS : STAR_COOLDOWN_MS) / 1000)
    const { data: rpcData, error: rpcError } = await supabase.rpc('submit_cooldown_reaction', {
      p_room_id: room_id,
      p_sender_session: sender_session,
      p_sender_participant_id: sender_participant_id,
      p_receiver_id: receiver_id,
      p_type: type,
      p_value: value ?? null,
      p_cooldown_seconds: cooldownSeconds,
    })

    if (rpcError) {
      console.error('[reactions POST] rpc error:', rpcError)
      return NextResponse.json({ error: rpcError.message }, { status: 500 })
    }

    if (rpcData.cooldown) {
      const message = type === 'warning' ? '자제 시그널은 5분마다 보낼 수 있어요!' : '별점은 30분마다 투표할 수 있어요!'
      return NextResponse.json({ error: message }, { status: 400 })
    }

    data = rpcData
  } else {
    // HOT 탭은 그 순간의 참여자 수를 value에 함께 기록해, 이후 인원이 바뀌어도
    // 이미 반영된 탭의 증가분이 재계산되지 않도록 한다 (탭당 증가율이 인원수에 반비례하기 때문).
    let insertValue = value ?? null
    if (type === 'hot') {
      const { count } = await supabase
        .from('participants').select('id', { count: 'exact', head: true })
        .eq('room_id', room_id)
        .is('left_at', null)
      insertValue = count ?? 1
    }

    const { data: insertedData, error } = await supabase
      .from('reactions')
      .insert({ room_id, sender_session, sender_participant_id, receiver_id, type, value: insertValue })
      .select('id, room_id, receiver_id, sender_participant_id, type, value, created_at')
      .single()

    if (error) {
      console.error('[reactions POST] supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    data = insertedData
  }

  if (type === 'heart') {
    const isMutual = sender_participant_id
      ? await checkMutualHeart(supabase, room_id, sender_participant_id, receiver_id)
      : false

    return NextResponse.json({ reaction: data, isMutual })
  }

  if (type === 'warning') {
    const { count } = await supabase
      .from('reactions').select('id', { count: 'exact' })
      .eq('room_id', room_id).eq('receiver_id', receiver_id).eq('type', 'warning')
    return NextResponse.json({ reaction: data, warningCount: count ?? 0 })
  }

  return NextResponse.json({ reaction: data })
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const room_id = searchParams.get('room_id')
  const type = searchParams.get('type')
  const receiver_id = searchParams.get('receiver_id')
  const since = searchParams.get('since')
  const exclude_type = searchParams.get('exclude_type')

  if (!room_id) {
    return NextResponse.json({ error: 'room_id가 필요합니다' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  let query = supabase
    .from('reactions')
    .select('id, room_id, receiver_id, sender_participant_id, type, value, created_at')
    .eq('room_id', room_id)

  if (type) query = query.eq('type', type as ReactionType)
  if (exclude_type) query = query.neq('type', exclude_type as ReactionType)
  if (receiver_id) query = query.eq('receiver_id', receiver_id)
  if (since) query = query.gte('created_at', since)

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ reactions: data })
}
