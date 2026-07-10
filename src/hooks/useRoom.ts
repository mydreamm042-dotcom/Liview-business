'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Participant, Reaction, VenueBranding, VenueSeat } from '@/lib/supabase/types'
import { getRoomData, getSessionToken } from '@/lib/session'
import { STAR_COOLDOWN_MS } from '@/lib/cooldown'

// 경고/별점 원본 리액션은 쿨타임 카운트다운 UI(최대 30분)에만 쓰이므로, 그보다 오래된
// 것은 클라이언트 메모리에서 버린다. 안 버리면 파티가 길어질수록 배열이 무한정 자란다.
// (집계 수치는 서버 summary가 전체 기준으로 계속 내려주므로 영향 없음)
const COOLDOWN_REACTION_RETENTION_MS = STAR_COOLDOWN_MS + 5 * 60 * 1000

export interface RoomState {
  participants: Participant[]
  reactions: Reaction[]
  warningCounts: Record<string, number>  // receiver_id → count
  moodAverage: number | null
  heartCounts: Record<string, number>    // receiver_id → count
  totalReactions: number                 // hot 제외 전체 리액션 수 (서버 집계 기준)
  isHost: boolean
  // BUSINESS 방이면 매장 브랜딩, PERSONAL 방이면 null. 서버가 GET /api/rooms/[code]에서 내려준다.
  venue: VenueBranding | null
  // Seating 도메인(§2.8) — BUSINESS 방의 좌석 목록. PERSONAL 방은 항상 빈 배열.
  seats: VenueSeat[]
  initialLoaded: boolean
}

interface ReactionSummary {
  heart_counts: Record<string, number>
  warning_counts: Record<string, number>
  mood_average: number | null
  total_reactions: number
}

export function useRoom(roomId: string, roomCode: string, onRoomEnded?: () => void) {
  const [state, setState] = useState<RoomState>({
    participants: [],
    reactions: [],
    warningCounts: {},
    moodAverage: null,
    heartCounts: {},
    totalReactions: 0,
    isHost: false,
    venue: null,
    seats: [],
    initialLoaded: false,
  })
  const supabase = createClient()
  const roomData = getRoomData()
  const onRoomEndedRef = useRef(onRoomEnded)
  useEffect(() => { onRoomEndedRef.current = onRoomEnded }, [onRoomEnded])

  // 내가 받은 하트 중 로컬에 이미 반영된 것들의 id. 3초 재조회 때 집계치(summary.heart_counts)와
  // 이 크기를 비교해서, 실제로 realtime을 놓친 경우에만 재조회하기 위해 씀.
  const myReceivedHeartIdsRef = useRef<Set<string>>(new Set())

  // 최초 접속 시 1번만 호출되는 전체 데이터 부트스트랩 (원본 reactions 전부 포함).
  // 이후 실시간 갱신은 realtime 구독 + 아래의 가벼운 재조회(fetchSummary)가 담당한다.
  const fetchInitial = useCallback(async () => {
    const [pRes, rRes] = await Promise.all([
      fetch(`/api/rooms/${roomCode}?session_token=${encodeURIComponent(getSessionToken())}`),
      fetch(`/api/reactions?room_id=${roomId}`),
    ])

    const pData = await pRes.json()
    const rData = await rRes.json()

    const reactions: Reaction[] = rData.reactions ?? []

    const warningCounts: Record<string, number> = {}
    const heartCounts: Record<string, number> = {}
    reactions.forEach(r => {
      if (r.type === 'warning') warningCounts[r.receiver_id] = (warningCounts[r.receiver_id] ?? 0) + 1
      if (r.type === 'heart') heartCounts[r.receiver_id] = (heartCounts[r.receiver_id] ?? 0) + 1
    })

    const starValues = reactions.filter(r => r.type === 'star' && r.value).map(r => r.value!)
    const moodAverage = starValues.length > 0 ? starValues.reduce((a, b) => a + b, 0) / starValues.length : null

    const myParticipantId = roomData?.participantId
    if (myParticipantId) {
      myReceivedHeartIdsRef.current = new Set(
        reactions.filter(r => r.type === 'heart' && r.receiver_id === myParticipantId).map(r => r.id)
      )
    }

    setState(prev => ({
      ...prev,
      // left_at이 채워진(나간) 사람은 방 화면 목록/인원수에서 제외
      participants: ((pData.participants ?? []) as Participant[]).filter(p => !p.left_at),
      reactions,
      warningCounts,
      moodAverage,
      heartCounts,
      totalReactions: reactions.filter(r => r.type !== 'hot').length,
      isHost: pData.isHost ?? false,
      venue: pData.venue ?? null,
      seats: pData.seats ?? [],
      initialLoaded: true,
    }))
  }, [roomId, roomCode])

  // 3초마다 도는 가벼운 재조회: 전체 reactions를 다시 받는 대신, DB가 미리 집계한
  // 요약치(하트/경고 수, 평균 별점)와 HOT 원본만 새로 받아온다. 파티가 길어져 reactions가
  // 아무리 쌓여도 이 폴링 비용은 커지지 않는다. (경고/별점 등 나머지 리액션의 세부 내역은
  // realtime 구독으로 실시간 갱신되며, 이 재조회는 realtime이 놓친 참여자/HOT/집계치만 복구한다)
  const fetchSummary = useCallback(async () => {
    const [pRes, sRes, hRes] = await Promise.all([
      fetch(`/api/rooms/${roomCode}?session_token=${encodeURIComponent(getSessionToken())}`),
      fetch(`/api/reactions/summary?room_id=${roomId}`),
      fetch(`/api/reactions?room_id=${roomId}&type=hot`),
    ])

    const pData = await pRes.json()
    const sData = await sRes.json()
    const hData = await hRes.json()

    const summary: ReactionSummary | undefined = sData.summary
    const hotReactions: Reaction[] = hData.reactions ?? []

    // 받은 하트 개수(heartCounts)는 위 summary로 항상 정확하지만, "방금 하트를 받아서
    // 쌍방 매칭 배너를 띄워야 하는지" 판단은 state.reactions에 실제 하트 레코드가 들어와야
    // 동작한다. 매번 room 전체 하트를 재조회하면 파티가 커질수록 이 폴링 비용도 커지므로,
    // 집계된 "내가 받은 하트 수"가 로컬에 반영된 수보다 많을 때(=realtime을 놓쳤을 때)만
    // 내가 받은 하트만 targeted로 재조회한다. 평소엔 추가 쿼리가 전혀 없다.
    const myParticipantId = roomData?.participantId
    let myHeartReactions: Reaction[] | null = null
    if (myParticipantId && summary) {
      const aggregatedCount = summary.heart_counts[myParticipantId] ?? 0
      if (aggregatedCount > myReceivedHeartIdsRef.current.size) {
        const heartRes = await fetch(`/api/reactions?room_id=${roomId}&type=heart&receiver_id=${myParticipantId}`)
        const heartData = await heartRes.json()
        myHeartReactions = heartData.reactions ?? []
        myReceivedHeartIdsRef.current = new Set((myHeartReactions ?? []).map(r => r.id))
      }
    }

    setState(prev => {
      let reactions = prev.reactions
      if (myHeartReactions) {
        const others = prev.reactions.filter(r => !(r.type === 'heart' && r.receiver_id === myParticipantId))
        reactions = [...others, ...myHeartReactions]
      }
      // 쿨타임 UI에 더 이상 필요 없는 오래된 경고/별점은 버려서 무한 누적을 막는다
      const cutoff = Date.now() - COOLDOWN_REACTION_RETENTION_MS
      const nonHotReactions = reactions.filter(r =>
        r.type !== 'hot' &&
        ((r.type !== 'warning' && r.type !== 'star') || new Date(r.created_at).getTime() >= cutoff)
      )
      return {
        ...prev,
        participants: pData.participants
          ? (pData.participants as Participant[]).filter(p => !p.left_at)
          : prev.participants,
        reactions: [...nonHotReactions, ...hotReactions],
        warningCounts: summary?.warning_counts ?? prev.warningCounts,
        heartCounts: summary?.heart_counts ?? prev.heartCounts,
        moodAverage: summary ? summary.mood_average : prev.moodAverage,
        totalReactions: summary ? summary.total_reactions : prev.totalReactions,
        isHost: typeof pData.isHost === 'boolean' ? pData.isHost : prev.isHost,
        seats: pData.seats ?? prev.seats,
      }
    })
  }, [roomId, roomCode])

  // Realtime 구독이 놓친 이벤트를 주기적으로 재조회해 복구한다
  // (예: 참여자가 나갔다 들어왔을 때 그 사이의 소켓 재연결 타이밍에 이벤트가 누락될 수 있음)
  useEffect(() => {
    const reconcileTimer = setInterval(() => { fetchSummary() }, 3_000)
    return () => clearInterval(reconcileTimer)
  }, [fetchSummary])

  // 백그라운드 복귀 시 놓친 최근 리액션 복구. 경고/별점 원본은 realtime으로만 로컬에
  // 쌓이는데, 모바일에서 화면을 끄면 소켓이 죽어 그 사이 것을 놓친다 (쿨타임 카운트다운과
  // "5분 쉬어요" 배너가 안 뜨는 원인). 쿨타임 UI에 필요한 최근 범위만 재조회해 채워넣는다.
  // 놓친 하트도 함께 복구되어 알림 토스트/매칭 확인이 뒤늦게라도 발동한다.
  const recoverRecentReactions = useCallback(async () => {
    const since = new Date(Date.now() - COOLDOWN_REACTION_RETENTION_MS).toISOString()
    // HOT 탭은 제외한다: 연타 특성상 이 요청에서 개수가 가장 많은 타입인데,
    // 복귀 직후 이어서 도는 fetchSummary가 어차피 HOT 전체를 다시 가져오므로
    // 여기서 빼도 손실이 없고 요청 크기만 크게 줄어든다.
    const res = await fetch(`/api/reactions?room_id=${roomId}&since=${encodeURIComponent(since)}&exclude_type=hot`)
    const data = await res.json()
    const recent: Reaction[] = data.reactions ?? []
    if (recent.length === 0) return
    // 내가 받은 하트는 반영 추적 ref에도 기록한다. 이걸 갱신해두면 직후에 도는
    // fetchSummary의 "받은 하트 수 불일치" 감지가 같은 하트를 또 내려받는 중복
    // 요청을 만들지 않는다. (35분 넘게 백그라운드였다면 이 범위 밖의 하트는
    // 불일치 감지가 이어받아 복구하므로 누락도 없다)
    const myParticipantId = roomData?.participantId
    recent.forEach(r => {
      if (r.type === 'heart' && r.receiver_id === myParticipantId) {
        myReceivedHeartIdsRef.current.add(r.id)
      }
    })
    setState(prev => {
      const known = new Set(prev.reactions.map(r => r.id))
      const missed = recent.filter(r => !known.has(r.id))
      if (missed.length === 0) return prev
      return { ...prev, reactions: [...prev.reactions, ...missed] }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState !== 'visible') return
      // 놓친 리액션 복구를 먼저 끝낸 뒤 요약을 갱신한다. 이 순서 덕분에 두 복구
      // 로직이 같은 데이터를 각자 따로 요청하는 일이 없다.
      await recoverRecentReactions()
      fetchSummary()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [fetchSummary, recoverRecentReactions])

  useEffect(() => {
    fetchInitial()

    // Realtime 구독
    const channel = supabase
      .channel(`room:${roomId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'participants', filter: `room_id=eq.${roomId}` },
        (payload) => {
          setState(prev => ({ ...prev, participants: [...prev.participants, payload.new as Participant] }))
        }
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'participants', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const deleted = payload.old as { id: string }
          setState(prev => ({ ...prev, participants: prev.participants.filter(p => p.id !== deleted.id) }))
        }
      )
      // "나가기"는 행 삭제가 아니라 left_at 채움(soft leave)이므로 UPDATE 이벤트로 온다.
      // left_at이 채워지면 목록에서 빼고, 재입장으로 비워지면(닉네임 변경 포함) 다시 넣는다.
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'participants', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const updated = payload.new as Participant
          setState(prev => {
            const without = prev.participants.filter(p => p.id !== updated.id)
            const participants = updated.left_at
              ? without
              : [...without, updated].sort((a, b) => a.joined_at.localeCompare(b.joined_at))
            return { ...prev, participants }
          })
        }
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reactions', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const r = payload.new as Reaction & { sender_session: string }
          // sender_session 제거, sender_participant_id 유지
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { sender_session: _s, ...safeReaction } = r
          setState(prev => {
            const reactions = [...prev.reactions, safeReaction]
            const warningCounts = { ...prev.warningCounts }
            const heartCounts = { ...prev.heartCounts }
            if (safeReaction.type === 'warning') {
              warningCounts[safeReaction.receiver_id] = (warningCounts[safeReaction.receiver_id] ?? 0) + 1
            }
            if (safeReaction.type === 'heart') {
              heartCounts[safeReaction.receiver_id] = (heartCounts[safeReaction.receiver_id] ?? 0) + 1
            }
            // moodAverage(평균 별점)는 로컬 배열로 재계산하지 않는다 — 로컬 배열은 오래된
            // 별점을 버리는 부분 데이터라서, 전체 기준 평균은 3초 summary 폴링이 맡는다.
            return {
              ...prev,
              reactions,
              warningCounts,
              heartCounts,
              totalReactions: prev.totalReactions + (safeReaction.type !== 'hot' ? 1 : 0),
            }
          })

          // 수신자에게 알림
          const myParticipantId = roomData?.participantId
          if (safeReaction.receiver_id === myParticipantId) {
            if (safeReaction.type === 'heart') {
              myReceivedHeartIdsRef.current.add(safeReaction.id)
              if ('vibrate' in navigator) navigator.vibrate(300)
            }
            if (safeReaction.type === 'warning') {
              setState(prev => {
                const count = (prev.warningCounts[safeReaction.receiver_id] ?? 0)
                if (count >= 3 && 'vibrate' in navigator) navigator.vibrate([100, 50, 100, 50, 200])
                return prev
              })
            }
          }
        }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          // ended = PERSONAL 종료, closed = BUSINESS 마감. 둘 다 참여자를 결과 화면으로 보낸다.
          const newStatus = (payload.new as { status: string }).status
          if (newStatus === 'ended' || newStatus === 'closed') {
            onRoomEndedRef.current?.()
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  const sendReaction = useCallback(async (
    receiver_id: string,
    type: 'heart' | 'warning' | 'star' | 'hot',
    value?: number
  ) => {
    const sender_session = getSessionToken()
    const res = await fetch('/api/reactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room_id: roomId,
        sender_session,
        receiver_id,
        type,
        value,
      }),
    })
    return res.json()
  }, [roomId])

  return { state, sendReaction }
}
