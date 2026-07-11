'use client'

import { useEffect, useState, use, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { getRoomData, getSessionToken, clearRoomData } from '@/lib/session'
import { useRoom } from '@/hooks/useRoom'
import { useChat } from '@/hooks/useChat'
import { useGeofenceAutoLeave } from '@/hooks/useGeofenceAutoLeave'
import InteractionModal from '@/components/InteractionModal'
import HeartToast, { showToast } from '@/components/HeartToast'
import QRCodeDisplay from '@/components/QRCodeDisplay'
import ChatPanel from '@/components/ChatPanel'
import BrandHeader from '@/components/BrandHeader'
import SeatMap from '@/components/SeatMap'
import SeatBoxContent from '@/components/SeatBoxContent'
import { Participant } from '@/lib/supabase/types'
import { simulateHotTaps, hotIndexAt, HOT_HOLD_MS, HOT_TOTAL_MS } from '@/lib/hotIndex'
import { WARNING_COOLDOWN_MS } from '@/lib/cooldown'
import { isOccupantHot } from '@/lib/seatDisplay'

function fmtCd(s: number) {
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
}

const LONG_PRESS_MS = 2000
const SEAT_CANVAS_HEIGHT = 300

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  const router = useRouter()
  const roomData = getRoomData()

  const [showModal, setShowModal] = useState(false)
  const [showQR, setShowQR] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [endingRoom, setEndingRoom] = useState(false)
  const [hotFloaters, setHotFloaters] = useState<string[]>([])
  const [hotPressed, setHotPressed] = useState(false)
  const [tick, setTick] = useState(0)
  const hotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [mutualBanner, setMutualBanner] = useState(false)

  useEffect(() => {
    if (!roomData || roomData.roomCode !== code) router.replace(`/join?code=${code}`)
  }, [code, roomData, router])

  useEffect(() => {
    const ticker = setInterval(() => setTick(n => n + 1), 1_000)
    return () => clearInterval(ticker)
  }, [])

  const { state, sendReaction } = useRoom(
    roomData?.roomId ?? '',
    code,
    () => router.push(`/room/${code}/result`),
  )

  // BUSINESS 방은 좌석 선택이 필수다(BUSINESS_RULES.md §2.8) — 매장이 좌석을 하나라도
  // 등록해뒀는데 내가 아직 안 골랐다면 좌석 선택 화면으로 보낸다. 좌석이 하나도 없는
  // 매장(운영자가 아직 설정 안 함)은 이 게이트를 걸지 않는다 — 그렇지 않으면 아무도
  // 못 들어오는 화면이 되어버린다. 호스트(운영자)는 손님 좌석을 고를 필요가 없으니 제외한다.
  //
  // 의존성 배열에 roomData 객체 자체를 넣지 않고 participantId만 뽑아서 넣는다 —
  // getRoomData()는 매 렌더마다 localStorage를 새로 JSON.parse해 매번 다른 참조를
  // 반환하므로, 이 방 화면이 1초 tick으로 계속 리렌더되는 것과 겹치면 객체를 그대로
  // deps에 넣은 effect는 매초 정리/재실행된다 (아래 경고 메시지 폴링 effect도 같은 이유).
  const myParticipantId = roomData?.participantId
  useEffect(() => {
    if (!state.initialLoaded || !state.venue || state.seats.length === 0 || state.isHost) return
    const me = state.participants.find(p => p.id === myParticipantId)
    if (me && !me.seat_id) router.replace(`/room/${code}/seats`)
  }, [state.initialLoaded, state.venue, state.seats, state.participants, state.isHost, myParticipantId, code, router])

  // 운영자 경고 메시지 (Guest Care 도메인, BUSINESS_RULES.md §2.9) — BUSINESS 방에서만
  // 폴링한다. 확인하지 않은 메시지가 여러 개 쌓여도 서버가 가장 오래된 것부터 하나씩만
  // 내려주므로, 이 화면은 한 번에 모달 하나만 띄우면 된다.
  const [pendingAlert, setPendingAlert] = useState<{ id: string; message: string } | null>(null)
  const [acknowledgingAlert, setAcknowledgingAlert] = useState(false)
  const [alertError, setAlertError] = useState('')
  useEffect(() => {
    if (!state.venue || !myParticipantId) return
    const fetchAlert = () => {
      fetch(`/api/participants/alerts?participant_id=${myParticipantId}&session_token=${encodeURIComponent(getSessionToken())}`)
        .then(res => res.json())
        .then(data => setPendingAlert(prev => prev ?? data.alert ?? null))
        .catch(() => {})
    }
    fetchAlert()
    const interval = setInterval(fetchAlert, 5_000)
    return () => clearInterval(interval)
  }, [state.venue, myParticipantId])

  const handleAcknowledgeAlert = async () => {
    if (!pendingAlert || !myParticipantId) return
    setAcknowledgingAlert(true)
    setAlertError('')
    try {
      const res = await fetch('/api/participants/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alert_id: pendingAlert.id, participant_id: myParticipantId, session_token: getSessionToken() }),
      })
      // 실패했는데 모달을 조용히 닫아버리면 서버는 여전히 미확인 상태라 다음 폴링에 다시
      // 떠서 사용자가 "분명 확인했는데 또 뜬다"고 혼란스러워한다 — 실패 시 모달을 유지한다.
      if (!res.ok) throw new Error()
      setPendingAlert(null)
    } catch {
      setAlertError('확인 처리에 실패했어요. 다시 시도해주세요')
    } finally {
      setAcknowledgingAlert(false)
    }
  }

  // 운영자의 손님 케어 액션(경고 메시지 + 좌석 강제 이동) — 예전엔 별도의 운영자 전용
  // 관리 화면에서 트리거했지만, 운영자가 이미 보고 있는 이 방 화면의 자리배치도로
  // 옮겼다(BUSINESS_RULES.md §2.9 "트리거 화면 위치"). state.isHost가 아니면 전혀
  // 쓰이지 않는다 — 아래 렌더링에서도 호스트에게만 이 핸들러들을 연결한다.
  const [armedSeatId, setArmedSeatId] = useState<string | null>(null)
  const [menuTarget, setMenuTarget] = useState<Participant | null>(null)
  const [careMessage, setCareMessage] = useState('')
  const [sendingCareMessage, setSendingCareMessage] = useState(false)
  const [careError, setCareError] = useState('')
  // 눌린 좌석과 시작 시각만 기록해두고, "2초 이상 눌렀는지"는 뗄 때(pointerUp) 딱 한 번만
  // 판정한다 — setTimeout으로 누르는 도중 상태를 바꾸면 그 직후 pointerUp이 "방금 무장된
  // 좌석을 다시 탭한 것"으로 해석돼 무장이 같은 제스처 안에서 바로 풀려버리는 문제가 있었다.
  const pressStartRef = useRef<{ seatId: string; startedAt: number } | null>(null)

  const handleSeatMove = useCallback(async (targetSeatId: string) => {
    if (!armedSeatId) return
    const occupant = state.participants.find(p => p.seat_id === armedSeatId)
    setArmedSeatId(null)
    if (!occupant) return
    try {
      const res = await fetch(`/api/rooms/${code}/seats`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participant_id: occupant.id, seat_id: targetSeatId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      // participants의 seat_id 변경은 useRoom의 realtime 구독(UPDATE)이 자동 반영하므로
      // 여기서 별도로 다시 조회할 필요가 없다.
    } catch (e) {
      setCareError(e instanceof Error ? e.message : '좌석 이동에 실패했습니다')
    }
  }, [armedSeatId, state.participants, code])

  const handleSendCareMessage = async () => {
    if (!menuTarget || !careMessage.trim()) return
    setSendingCareMessage(true)
    try {
      const res = await fetch(`/api/rooms/${code}/alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participant_id: menuTarget.id, message: careMessage.trim() }),
      })
      if (!res.ok) throw new Error()
      setMenuTarget(null)
      setCareMessage('')
    } catch {
      setCareError('메시지 전송에 실패했습니다')
    } finally {
      setSendingCareMessage(false)
    }
  }

  const startSeatPress = (seatId: string, occupant: Participant | undefined) => {
    if (!occupant) return
    pressStartRef.current = { seatId, startedAt: Date.now() }
  }
  const cancelSeatPress = () => { pressStartRef.current = null }

  // 이미 무장된 상태의 탭은 "이동 완료/취소"고, 무장 안 된 상태의 탭은 눌린 시간에 따라
  // "무장 시작"(2초 이상) 또는 "손님 케어 메뉴"(짧게)로 갈린다.
  const handleSeatRelease = (seatId: string, occupant: Participant | undefined) => {
    if (armedSeatId) {
      if (armedSeatId !== seatId) handleSeatMove(seatId)
      else setArmedSeatId(null)
      pressStartRef.current = null
      return
    }
    const press = pressStartRef.current
    pressStartRef.current = null
    if (press?.seatId === seatId && Date.now() - press.startedAt >= LONG_PRESS_MS) {
      if (occupant) setArmedSeatId(seatId)
      return
    }
    if (occupant) setMenuTarget(occupant)
  }

  // 채팅창이 닫혀 있어도 새 메시지 수를 계속 추적할 수 있도록 여기서 구독을 유지한다
  // (ChatPanel 안에서만 구독하면 창을 닫는 순간 구독이 끊겨 안읽음 배지를 셀 수 없음).
  const { messages: chatMessages, loading: chatLoading, sendMessage } = useChat(roomData?.roomId ?? '')
  const [unreadCount, setUnreadCount] = useState(0)
  // 배열 길이가 아니라 메시지 id 기준으로 "이미 본 것"을 추적한다. 백그라운드 복귀
  // 재조회처럼 목록이 통째로 교체되는 경우에도 정확히 새 메시지만 세기 위함이고,
  // 기준선은 최초 로딩이 끝난 뒤에 잡아 과거 기록이 안읽음으로 잡히지 않게 한다.
  const seenChatIdsRef = useRef<Set<string> | null>(null)

  useEffect(() => {
    if (chatLoading) return
    if (seenChatIdsRef.current === null) {
      seenChatIdsRef.current = new Set(chatMessages.map(m => m.id))
      return
    }
    const seen = seenChatIdsRef.current
    const newOnes = chatMessages.filter(m => !seen.has(m.id))
    newOnes.forEach(m => seen.add(m.id))
    if (!showChat) {
      const fromOthers = newOnes.filter(m => m.sender_participant_id !== roomData?.participantId)
      if (fromOthers.length > 0) setUnreadCount(c => c + fromOthers.length)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatMessages, chatLoading])

  useEffect(() => {
    if (showChat) setUnreadCount(0)
  }, [showChat])

  // HOT 탭 히스토리 시뮬레이션은 리액션 목록이 갱신될 때만 수행 (1초 tick마다 재계산 방지)
  const hotSim = useMemo(
    () => simulateHotTaps(state.reactions.filter(r => r.type === 'hot')),
    [state.reactions],
  )

  const checkMutualOnReceive = useCallback(async (senderParticipantId: string) => {
    if (!roomData) return
    const res = await fetch(
      `/api/reactions/mutual?room_id=${roomData.roomId}&my_session=${getSessionToken()}&my_participant_id=${roomData.participantId}&just_received_from=${senderParticipantId}`
    )
    const d = await res.json()
    if (d.isNewMutual) setMutualBanner(true)
  }, [roomData])

  const handleSend = useCallback(async (
    receiver_id: string,
    type: 'heart' | 'warning' | 'star' | 'hot',
    value?: number
  ) => {
    const result = await sendReaction(receiver_id, type, value)
    if (type === 'heart' && result.isMutual) {
      setMutualBanner(true)
    }
    return result
  }, [sendReaction])

  // 배열의 마지막 원소만 "방금 새로 온 것"으로 가정하면, 재조회 폴링이 여러 건을 한번에
  // 병합하거나 realtime 이벤트가 몰려올 때 일부를 놓친다. 그 대신 이미 처리한 리액션 id를
  // 추적해서, 그때그때 새로 나타난 항목을 전부 확인한다 (하트 매칭 배너 등이 조용히
  // 씹히는 문제 방지).
  const seenReactionIdsRef = useRef<Set<string> | null>(null)

  useEffect(() => {
    // fetchInitial이 끝나기 전(state.reactions가 아직 빈 배열)에 기준선을 잡으면,
    // 잠시 후 초기 데이터가 들어올 때 그 전체를 "새로 온 것"으로 오인해서 이전에 이미
    // 받았던 하트/자제 시그널까지 토스트·매칭 배너로 다시 띄우게 된다. 초기 로드가 끝난
    // 뒤에만 기준선을 잡아 이 문제를 막는다.
    if (!state.initialLoaded) return
    if (seenReactionIdsRef.current === null) {
      seenReactionIdsRef.current = new Set(state.reactions.map(r => r.id))
      return
    }
    const seen = seenReactionIdsRef.current
    const newOnes = state.reactions.filter(r => !seen.has(r.id))
    newOnes.forEach(r => seen.add(r.id))

    newOnes.forEach(latest => {
      if (latest.receiver_id !== roomData?.participantId) return
      if (latest.type === 'heart') {
        showToast({ emoji: '💖', message: '누군가 하트를 보냈어요!', color: '#ff6b6b' })
        if (latest.sender_participant_id) {
          checkMutualOnReceive(latest.sender_participant_id)
        }
      } else if (latest.type === 'warning') {
        showToast({ emoji: '🤫', message: '잠깐, 오늘 좀 과한 것 같아요', color: '#f59e0b' })
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.reactions, state.initialLoaded])

  const handleEndRoom = async () => {
    if (!confirm(state.venue ? '오늘 영업을 마감할까요? (방 기록은 보존됩니다)' : '방을 종료할까요?')) return
    setEndingRoom(true)
    await fetch(`/api/rooms/${code}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host_session: getSessionToken(), status: 'ended' }),
    })
    router.push(`/room/${code}/result`)
  }

  const handleLeave = async () => {
    if (!confirm('방을 나갈까요?')) return
    // 나가기 처리가 서버에서 실패했는데 조용히 화면만 나가버리면, 다른 사람들
    // 화면에는 계속 남아있는 유령 참여자가 된다. 실패 시 안내하고 방에 머문다.
    if (roomData) {
      try {
        const res = await fetch('/api/participants', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            participant_id: roomData.participantId,
            session_token: getSessionToken(),
          }),
        })
        if (!res.ok) throw new Error()
      } catch {
        alert('나가기 처리에 실패했어요. 네트워크 확인 후 다시 시도해주세요')
        return
      }
    }
    clearRoomData()
    router.replace('/')
  }

  // 입장 후 지속 위치 체크로 반경을 벗어났을 때의 자동 나가기 (BUSINESS_RULES.md §2.3).
  // handleLeave와 달리 확인창 없이 즉시 처리하고, 이미 처리된 뒤 중복 트리거되는 것을 막는다.
  const autoLeftRef = useRef(false)
  const handleAutoLeave = useCallback(async () => {
    if (autoLeftRef.current) return
    autoLeftRef.current = true
    if (roomData) {
      try {
        await fetch('/api/participants', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ participant_id: roomData.participantId, session_token: getSessionToken() }),
        })
      } catch {
        // 자동 나가기는 사용자 확인 없이 진행되므로, 서버 처리가 실패해도 클라이언트는
        // 그대로 방을 나간다 (실패해서 방에 머물게 하면 반경 밖에 있다는 사실과 모순됨).
      }
    }
    clearRoomData()
    alert('매장 위치를 벗어나 자동으로 퇴장되었습니다')
    router.replace('/')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useGeofenceAutoLeave(state.venue?.latitude, state.venue?.longitude, state.venue?.geofence_radius_m, handleAutoLeave)

  const handleOpenChat = () => {
    setShowChat(true)
    // 베타 참여도 분석용: 채팅창을 실제로 열어봤는지 최초 1회 기록 (실패해도 화면엔 영향 없음)
    if (roomData) {
      fetch('/api/participants', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participant_id: roomData.participantId, session_token: getSessionToken(), event: 'chat_opened' }),
      }).catch(() => {})
    }
  }

  const handleHot = () => {
    setHotPressed(true)
    if (hotTimerRef.current) clearTimeout(hotTimerRef.current)
    hotTimerRef.current = setTimeout(() => setHotPressed(false), 150)
    const id = Math.random().toString(36).slice(2)
    setHotFloaters(prev => [...prev, id])
    setTimeout(() => setHotFloaters(prev => prev.filter(x => x !== id)), 900)
    if (roomData) {
      sendReaction(roomData.participantId, 'hot').catch(err => {
        console.error('[HOT] sendReaction failed:', err)
      })
    }
  }

  const currentMood = state.moodAverage ?? undefined
  const appUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const joinUrl = `${appUrl}/join?code=${code}`

  if (!roomData) return null

  const myHearts = state.heartCounts[roomData.participantId] ?? 0
  void tick
  // 전체 탭 히스토리 시뮬레이션(비쌈)은 리액션 목록이 바뀔 때만 다시 하고,
  // 1초 tick마다 필요한 "지금 값"은 그 결과에서 O(1)로 읽는다.
  const hotIndex = hotIndexAt(hotSim)

  const elapsed = hotSim.lastTapTime > -Infinity ? Date.now() - hotSim.lastTapTime : Infinity
  const isDecaying = elapsed >= HOT_HOLD_MS && elapsed < HOT_TOTAL_MS

  const flameLevel = hotIndex >= 80 ? 4 : hotIndex >= 60 ? 3 : hotIndex >= 40 ? 2 : hotIndex >= 20 ? 1 : 0
  const flickerKf = flameLevel >= 3 ? 'flame-intense' : 'flame-flicker'
  const flickerDur = flameLevel >= 4 ? '0.45s' : flameLevel === 3 ? '0.6s' : flameLevel === 2 ? '0.8s' : '1.1s'
  const hotColor = hotIndex >= 60 ? '#ef4444' : '#f97316'

  // 받은 자제 시그널 중 가장 최근 시각 기준으로 남은 휴식 시간을 계산 (새로고침해도 유지됨)
  const myWarningReactions = state.reactions.filter(r => r.receiver_id === roomData.participantId && r.type === 'warning')
  const lastWarningAt = myWarningReactions.length > 0
    ? Math.max(...myWarningReactions.map(r => new Date(r.created_at).getTime()))
    : null
  const warningRemainingMs = lastWarningAt !== null ? Math.max(0, lastWarningAt + WARNING_COOLDOWN_MS - Date.now()) : 0
  const warningVisible = warningRemainingMs > 0
  const warningCountdown = Math.ceil(warningRemainingMs / 1000)
  const warningBottom = 100

  return (
    <main className="flex flex-col min-h-dvh" style={{ paddingBottom: 100 }}>

      <div style={{ padding: '52px 20px 16px', background: 'linear-gradient(180deg,rgba(255,107,107,0.06) 0%,transparent 100%)' }}>
        {/* BUSINESS 방이면 매장 브랜딩을 방 이름 위에 먼저 노출 (PERSONAL 방은 venue=null이라 미표시).
            운영자(호스트)에게는 매장 설정 진입 버튼을 함께 노출한다. */}
        {state.venue && (
          <BrandHeader
            venue={state.venue}
            isOperator={state.isHost}
            onSettings={() => router.push(`/operator/settings/${state.venue!.id}`)}
          />
        )}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span className="badge" style={{ background: 'rgba(255,107,107,0.15)', color: 'var(--accent)', border: '1px solid rgba(255,107,107,0.25)' }}>🔴 LIVE</span>
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.2 }}>{roomData.roomName}</h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowQR(true)}
              style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border)', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              📱
            </button>
            <button onClick={handleOpenChat}
              style={{ position: 'relative', width: 40, height: 40, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border)', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              💬
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, padding: '0 4px',
                  borderRadius: 9, background: '#ff3b30', color: '#fff', fontSize: 10, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                  boxShadow: '0 0 0 2px var(--bg)',
                }}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
            {state.isHost ? (
              <button onClick={handleEndRoom} disabled={endingRoom}
                style={{ height: 40, padding: '0 16px', borderRadius: 12, background: 'rgba(255,107,107,0.15)', border: '1.5px solid rgba(255,107,107,0.4)', color: 'var(--accent)', fontSize: 13, fontWeight: 800, cursor: endingRoom ? 'default' : 'pointer', opacity: endingRoom ? 0.6 : 1 }}>
                {endingRoom ? (state.venue ? '마감 중…' : '종료 중…') : (state.venue ? '영업 마감' : '방 종료')}
              </button>
            ) : (
              <button onClick={handleLeave}
                style={{ height: 40, padding: '0 14px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--muted2)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                나가기
              </button>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>참여 코드</span>
          <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.2em', color: 'var(--accent)', background: 'rgba(255,107,107,0.1)', padding: '3px 10px', borderRadius: 8 }}>{code}</span>
        </div>
      </div>

      <div style={{ padding: '0 20px', marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
          <div className="card" style={{ padding: '14px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>👥</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{state.participants.length}</div>
            <div style={{ fontSize: 10, color: 'var(--muted2)' }}>참여자</div>
          </div>
          <div className="card" style={{ padding: '14px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>💖</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#ff6b6b' }}>{myHearts}</div>
            <div style={{ fontSize: 10, color: 'var(--muted2)' }}>받은 하트</div>
          </div>
          <div className="card" style={{ padding: '14px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>⭐</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#fbbf24' }}>{currentMood !== undefined ? currentMood.toFixed(1) : '-'}</div>
            <div style={{ fontSize: 10, color: 'var(--muted2)' }}>실시간 만족도</div>
          </div>
          <div className="card" style={{
            padding: '10px 8px 8px', textAlign: 'center',
            animation: flameLevel >= 1
              ? `fire-pulse ${flameLevel >= 3 ? '0.7s' : flameLevel === 2 ? '1s' : '1.5s'} ease-in-out infinite`
              : 'none',
            borderColor: flameLevel >= 2 ? `rgba(249,115,22,${flameLevel * 0.12})` : undefined,
          }}>
            <div style={{ height: 20, marginBottom: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1 }}>
              {Array.from({ length: Math.max(1, flameLevel) }).map((_, i) => (
                <span key={i} style={{
                  fontSize: flameLevel >= 3 ? 14 : 16,
                  display: 'inline-block',
                  animation: flameLevel >= 1 ? `${flickerKf} ${flickerDur} ease-in-out infinite` : 'none',
                  animationDelay: `${i * 0.12}s`,
                }}>🔥</span>
              ))}
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: hotColor, lineHeight: 1 }}>
              {hotIndex}<span style={{ fontSize: 10 }}>%</span>
            </div>
            {isDecaying && (
              <div style={{ fontSize: 9, color: '#f97316', marginTop: 1, fontWeight: 700 }}>식는 중…</div>
            )}
            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)', margin: '3px 4px 0', overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${hotIndex}%`,
                background: hotIndex >= 60 ? 'linear-gradient(90deg,#f97316,#ef4444)' : 'linear-gradient(90deg,#f59e0b,#f97316)',
                transition: 'width 1s ease',
              }} />
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted2)', marginTop: 2 }}>HOT</div>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 20px', marginBottom: 16 }}>
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
          {hotFloaters.map(id => (
            <span key={id} className="animate-float-up" style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', fontSize: 32, pointerEvents: 'none', zIndex: 10 }}>🔥</span>
          ))}
          <button onClick={handleHot} style={{
            width: '100%', minHeight: 54, borderRadius: 18,
            background: `linear-gradient(135deg,${hotIndex >= 60 ? '#dc2626,#b91c1c' : '#f97316,#ef4444'})`,
            border: 'none', color: '#fff',
            fontSize: hotPressed ? 30 : 26, fontWeight: 800, cursor: 'pointer',
            transition: 'font-size 0.1s ease, transform 0.1s ease, background 0.5s ease',
            transform: hotPressed ? 'scale(1.06)' : 'scale(1)',
            boxShadow: `0 8px 24px rgba(${hotIndex >= 60 ? '220,38,38' : '249,115,22'},0.45)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            userSelect: 'none', WebkitUserSelect: 'none',
          }}>🔥 HOT!</button>
        </div>
      </div>

      {/* BUSINESS 방 + 좌석 설정이 있는 매장이면, 방 화면에서도 자리배치도가 계속 보인다
          (Seating 도메인, BUSINESS_RULES.md §2.8) — 입장 시 한 번 고르고 끝나는 게 아니라
          누가 어느 좌석인지, HOT 여부, 착석 시간을 방 화면에서도 확인할 수 있어야 한다.
          운영자(호스트)에게는 여기서 바로 손님 케어 액션(경고 메시지/좌석 이동)이 트리거된다
          (§2.9 "트리거 화면 위치") — 좌석을 2초 길게 누르면 이동 모드, 짧게 누르면 메시지 메뉴. */}
      {state.venue && state.seats.length > 0 && (
        <div style={{ padding: '0 20px', marginBottom: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted2)', marginBottom: 12 }}>자리배치도</p>
          {state.isHost ? (
            <>
              {armedSeatId && (
                <div className="card-sm" style={{ padding: '10px 14px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>이동할 좌석을 선택하세요</span>
                  <button onClick={() => setArmedSeatId(null)} style={{ fontSize: 12, color: 'var(--muted2)', background: 'none', border: 'none', cursor: 'pointer' }}>취소</button>
                </div>
              )}
              {careError && <p style={{ fontSize: 12, color: '#ff6b6b', marginBottom: 8 }}>{careError}</p>}
              <div style={{ position: 'relative', width: '100%', height: SEAT_CANVAS_HEIGHT, borderRadius: 16, background: 'var(--card2)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                {state.seats.map(seat => {
                  const occupant = state.participants.find(p => p.seat_id === seat.id)
                  const isMe = occupant?.id === roomData.participantId
                  const occupantHot = occupant
                    ? isOccupantHot(occupant.id, state.reactions.filter(r => r.type === 'hot'), Date.now())
                    : false
                  return (
                    <div
                      key={seat.id}
                      className="card"
                      onPointerDown={() => startSeatPress(seat.id, occupant)}
                      onPointerUp={() => handleSeatRelease(seat.id, occupant)}
                      onPointerLeave={cancelSeatPress}
                      onContextMenu={e => { e.preventDefault(); if (occupant) setMenuTarget(occupant) }}
                      style={{
                        position: 'absolute',
                        left: `${seat.position_x}%`,
                        top: `${seat.position_y}%`,
                        transform: 'translate(-50%, -50%)',
                        width: 92,
                        padding: '10px 12px',
                        textAlign: 'left',
                        cursor: 'pointer',
                        userSelect: 'none',
                        touchAction: 'none',
                        border: armedSeatId === seat.id ? '2px solid var(--accent)' : (isMe ? '1.5px solid rgba(255,107,107,0.3)' : '1px solid var(--border)'),
                        background: isMe ? 'rgba(255,107,107,0.06)' : undefined,
                      }}
                    >
                      <SeatBoxContent seat={seat} occupant={occupant} occupantHot={occupantHot} now={Date.now()} isMe={isMe} />
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <SeatMap
              seats={state.seats}
              participants={state.participants}
              hotReactions={state.reactions.filter(r => r.type === 'hot')}
              now={Date.now()}
              myParticipantId={roomData.participantId}
              height={SEAT_CANVAS_HEIGHT}
            />
          )}
        </div>
      )}

      <div style={{ padding: '0 20px', flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted2)' }}>참여자 목록</p>
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>총 {state.totalReactions}개 리액션</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {state.participants.map((p, idx) => {
            const isMe = p.id === roomData.participantId
            const heartCount = state.heartCounts[p.id] ?? 0
            const warnCount = state.warningCounts[p.id] ?? 0
            const isHost = idx === 0
            return (
              <div key={p.id} className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, borderColor: isMe ? 'rgba(255,107,107,0.25)' : undefined, background: isMe ? 'rgba(255,107,107,0.05)' : undefined }}>
                <div style={{ width: 44, height: 44, borderRadius: 14, background: isMe ? 'rgba(255,107,107,0.2)' : 'var(--card2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: isMe ? 'var(--accent)' : 'var(--text2)', flexShrink: 0 }}>
                  {p.nickname[0] ?? '?'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <p style={{ fontSize: 15, fontWeight: 700, color: isMe ? 'var(--accent)' : 'var(--text)' }}>{p.nickname}{isMe ? ' (나)' : ''}</p>
                    {isHost && <span className="badge" style={{ background: 'rgba(124,92,191,0.2)', color: 'var(--purple-light)', fontSize: 10 }}>HOST</span>}
                  </div>
                  {isMe && warnCount >= 1 && <p style={{ fontSize: 11, color: '#f59e0b', marginTop: 2 }}>🤫 자제 시그널 {warnCount}개 받음</p>}
                </div>
                {heartCount > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'rgba(255,107,107,0.12)', padding: '4px 10px', borderRadius: 20 }}>
                    <span style={{ fontSize: 14 }}>💖</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#ff6b6b' }}>{heartCount}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {mutualBanner && (
        <div onClick={() => setMutualBanner(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', padding: '0 32px' }}>
          <div className="card animate-fade-in" onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 320, padding: '32px 24px', textAlign: 'center', border: '1.5px solid rgba(255,107,107,0.5)' }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>💗</div>
            <p style={{ fontSize: 20, fontWeight: 800, color: '#ff6b6b', marginBottom: 8 }}>통했어요!</p>
            <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 24, lineHeight: 1.6 }}>서로의 마음이<br />연결되었어요 💕</p>
            <button onClick={() => setMutualBanner(false)} className="btn btn-primary" style={{ fontSize: 15, minHeight: 48 }}>확인 ✕</button>
          </div>
        </div>
      )}

      {warningVisible && (
        <div style={{ position: 'fixed', bottom: warningBottom, left: '50%', transform: 'translateX(-50%)', width: 'calc(100% - 40px)', maxWidth: 408, zIndex: 40, background: 'rgba(245,158,11,0.15)', border: '1.5px solid rgba(245,158,11,0.5)', borderRadius: 16, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 24 }}>🤫</span>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#f59e0b', flex: 1 }}>우리 5분만 쉬어요</p>
          <span style={{ fontSize: 22, fontWeight: 800, color: '#f59e0b', fontVariantNumeric: 'tabular-nums' }}>{fmtCd(warningCountdown)}</span>
        </div>
      )}

      <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 448, padding: '16px 20px 32px', background: 'linear-gradient(0deg,var(--bg) 60%,transparent)' }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}
          style={{ fontSize: 18, minHeight: 60, boxShadow: '0 12px 32px rgba(255,107,107,0.5)' }}>✨ 지금 표현하기</button>
      </div>

      {showModal && (
        <InteractionModal participants={state.participants} reactions={state.reactions} myParticipantId={roomData.participantId} onSend={handleSend} onClose={() => setShowModal(false)} />
      )}
      {showQR && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={() => setShowQR(false)}>
          <div className="card animate-slide-up" style={{ width: '100%', maxWidth: 448, padding: 24, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }} onClick={e => e.stopPropagation()}>
            <QRCodeDisplay url={joinUrl} code={code} roomName={roomData.roomName} />
            <button className="btn btn-ghost" onClick={() => setShowQR(false)} style={{ marginTop: 12, fontSize: 15 }}>닫기</button>
          </div>
        </div>
      )}
      {showChat && (
        <ChatPanel messages={chatMessages} loading={chatLoading} sendMessage={sendMessage} myParticipantId={roomData.participantId} myNickname={roomData.nickname} onClose={() => setShowChat(false)} />
      )}

      {/* 운영자 경고 메시지 모달 — 확인 버튼을 눌러야만 닫힌다 (배경 클릭으로 안 닫힘).
          BUSINESS_RULES.md §2.9 확정 사항: 화면을 가리는 모달로 즉시 인지시켜야 함. */}
      {pendingAlert && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', padding: '0 32px' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 340, padding: '28px 22px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📢</div>
            <p style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700, marginBottom: 8, letterSpacing: '0.05em' }}>매장에서 보낸 메시지</p>
            <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, lineHeight: 1.6 }}>{pendingAlert.message}</p>
            {alertError && <p style={{ fontSize: 12, color: '#ff6b6b', marginBottom: 12 }}>{alertError}</p>}
            <button onClick={handleAcknowledgeAlert} disabled={acknowledgingAlert} className="btn btn-primary" style={{ fontSize: 15, minHeight: 48, opacity: acknowledgingAlert ? 0.6 : 1 }}>
              {acknowledgingAlert ? '처리 중...' : '확인'}
            </button>
          </div>
        </div>
      )}

      {/* 운영자가 손님에게 보내는 경고 메시지 작성 모달 (Guest Care 도메인, §2.9) —
          자리배치도에서 좌석을 짧게 눌러/우클릭해 연다. state.isHost가 아니면 절대 열리지 않는다. */}
      {menuTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div className="card" style={{ padding: 20, width: '100%', maxWidth: 380 }}>
            <p style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>{menuTarget.nickname}님에게 메시지 보내기</p>
            <textarea
              value={careMessage}
              onChange={e => setCareMessage(e.target.value)}
              placeholder="예: 목소리를 조금만 낮춰주세요"
              maxLength={200}
              rows={3}
              className="input"
              style={{ width: '100%', resize: 'none', marginBottom: 12 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => { setMenuTarget(null); setCareMessage('') }} style={{ flex: 1 }}>취소</button>
              <button className="btn btn-primary" onClick={handleSendCareMessage} disabled={sendingCareMessage || !careMessage.trim()} style={{ flex: 1, opacity: sendingCareMessage || !careMessage.trim() ? 0.5 : 1 }}>
                {sendingCareMessage ? '전송 중...' : '보내기'}
              </button>
            </div>
          </div>
        </div>
      )}

      <HeartToast />
    </main>
  )
}
