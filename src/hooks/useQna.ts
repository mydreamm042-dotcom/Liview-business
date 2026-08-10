'use client'

import { useState, useEffect, useCallback } from 'react'
import { QnaMessage } from '@/lib/supabase/types'
import { getSessionToken } from '@/lib/session'

// 외부 QnA 채널 (Phase 9). messages(입장 손님 전용, realtime 구독)와 달리 외부인도 쓰는
// 별도 테이블이라 훅을 분리했다. 채팅 탭이 열려 있을 때만 폴링해 불필요한 요청을 줄인다.
export function useQna(venueId: string | undefined, active: boolean) {
  const [messages, setMessages] = useState<QnaMessage[]>([])
  const [loading, setLoading] = useState(true)

  const fetchQna = useCallback(() => {
    if (!venueId) return
    fetch(`/api/venues/${venueId}/qna`)
      .then(res => res.ok ? res.json() : { messages: [] })
      .then(data => setMessages(data.messages ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [venueId])

  useEffect(() => {
    if (!venueId || !active) return
    fetchQna()
    const interval = setInterval(fetchQna, 3_000)
    return () => clearInterval(interval)
  }, [venueId, active, fetchQna])

  const sendQna = useCallback(async (content: string): Promise<{ error?: string }> => {
    if (!venueId) return { error: '매장 정보를 찾을 수 없어요' }
    try {
      const res = await fetch(`/api/venues/${venueId}/qna`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_token: getSessionToken(), content }),
      })
      const data = await res.json()
      if (!res.ok) return { error: data.error ?? '질문을 남기지 못했어요' }
      fetchQna()
      return {}
    } catch {
      return { error: '질문을 남기지 못했어요. 잠시 후 다시 시도해주세요' }
    }
  }, [venueId, fetchQna])

  return { messages, loading, sendQna }
}
