'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Message } from '@/lib/supabase/types'
import { getSessionToken } from '@/lib/session'

export function useChat(roomId: string) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const fetchMessages = useCallback(async () => {
    const res = await fetch(`/api/messages?room_id=${roomId}`)
    const data = await res.json()
    // 서버 목록으로 "통째로 교체"하지 않고 로컬 상태와 병합한다. 통째 교체 방식은
    // 재조회 요청이 나가 있는 동안 realtime으로 막 도착한 메시지(스냅샷보다 최신)를
    // 덮어써서, 다음 재조회 전까지 그 메시지가 화면에서 사라지는 문제가 있었다.
    //
    // 서버 스냅샷에 없는 로컬 메시지는 전부 유지한다:
    //  - realtime으로 막 도착한 진짜 메시지 → 유실 방지
    //  - 전송 중인 임시(temp-) 메시지 → 아직 서버 응답 전이라 유지
    // 임시 메시지의 정리는 내용 추측이 아니라 sendMessage가 응답을 받을 때 정확한
    // tempId로 처리한다. 그때까지 잠깐 같은 메시지가 겹쳐 보여도, 응답 즉시 그 tempId가
    // 제거되며 한 줄이 된다. (여기서 내용으로 매칭해 지우면 "같은 말 두 번" 같은
    // 정상 메시지까지 잘못 지워짐)
    //
    // 정렬하지 않고 뒤에 이어붙인다: 서버 목록은 이미 시간순이고, 스냅샷에 없는 로컬
    // 메시지는 모두 스냅샷 이후에 생긴 "가장 최근" 것들이라 맨 뒤가 올바른 위치다.
    // 매번 전체를 재정렬하면 임시 메시지의 클라이언트 시각과 서버 시각이 어긋날 때
    // 위치가 튀어 보일 수 있으므로 append로 안정적인 순서를 유지한다.
    setMessages(prev => {
      const server: Message[] = data.messages ?? []
      const serverIds = new Set(server.map(m => m.id))
      const localOnly = prev.filter(m => !serverIds.has(m.id))
      return [...server, ...localOnly]
    })
    setLoading(false)
  }, [roomId])

  // 모바일에서 화면을 끄거나 다른 앱에 다녀오면 OS가 realtime 소켓을 끊어서 그 사이
  // 메시지를 놓친다. 화면에 복귀하는 순간 전체 재조회로 놓친 메시지를 복구한다.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchMessages()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [fetchMessages])

  useEffect(() => {
    fetchMessages()

    const channel = supabase
      .channel(`messages:${roomId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const incoming = payload.new as Message
          setMessages(prev => prev.some(m => m.id === incoming.id) ? prev : [...prev, incoming])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  const sendMessage = useCallback(async (
    content: string,
    optimistic: { participantId: string; nickname: string }
  ) => {
    // 서버 응답을 기다리지 않고 누르는 즉시 내 화면에 먼저 표시한다 (체감 전송 속도 개선).
    // 실패하면 이 임시 메시지를 지우고, 성공하면 실제 저장된 메시지로 교체한다.
    const tempId = `temp-${Math.random().toString(36).slice(2)}`
    const optimisticMessage: Message = {
      id: tempId,
      room_id: roomId,
      sender_participant_id: optimistic.participantId,
      sender_nickname: optimistic.nickname,
      content,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, optimisticMessage])

    const session_token = getSessionToken()
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: roomId, session_token, content }),
      })
      const data = await res.json()
      if (data?.message) {
        // 임시 메시지를 실제 저장본으로 교체. 그 사이 재조회/realtime으로 이미
        // 실제 메시지가 들어와 있으면 임시본만 제거해 중복을 막는다.
        setMessages(prev => {
          const withoutTemp = prev.filter(m => m.id !== tempId)
          if (withoutTemp.some(m => m.id === data.message.id)) return withoutTemp
          return [...withoutTemp, data.message]
        })
      } else {
        setMessages(prev => prev.filter(m => m.id !== tempId))
      }
      return data
    } catch (err) {
      setMessages(prev => prev.filter(m => m.id !== tempId))
      throw err
    }
  }, [roomId])

  return { messages, loading, sendMessage }
}
