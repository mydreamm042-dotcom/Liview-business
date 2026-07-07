import { createServerSupabaseClient } from '@/lib/supabase/server'

type ServerSupabase = Awaited<ReturnType<typeof createServerSupabaseClient>>

// 하트 쌍방 매칭 판정. justSentById가 방금 receiverId에게 하트를 보낸 직후를 기준으로,
// "받은 쪽이 보낸 쪽 못지않게(개수 이상) 하트를 보내온 상태"면 매칭 성립으로 본다.
// 전송 API(보낸 사람 화면의 배너)와 수신 확인 API(받은 사람 화면의 배너)가
// 이 하나의 규칙을 공유한다 — 두 곳에 따로 구현하면 기준이 어긋날 수 있다.
export async function checkMutualHeart(
  supabase: ServerSupabase,
  roomId: string,
  justSentById: string,
  receiverId: string,
): Promise<boolean> {
  const [sentBySender, sentByReceiver] = await Promise.all([
    supabase
      .from('reactions')
      .select('id', { count: 'exact', head: true })
      .eq('room_id', roomId)
      .eq('sender_participant_id', justSentById)
      .eq('receiver_id', receiverId)
      .eq('type', 'heart'),
    supabase
      .from('reactions')
      .select('id', { count: 'exact', head: true })
      .eq('room_id', roomId)
      .eq('sender_participant_id', receiverId)
      .eq('receiver_id', justSentById)
      .eq('type', 'heart'),
  ])

  const senderCount = sentBySender.count ?? 0
  const receiverCount = sentByReceiver.count ?? 0
  return receiverCount > 0 && receiverCount >= senderCount
}
