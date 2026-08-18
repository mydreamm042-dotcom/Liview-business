'use client'

import { useEffect, useState, use, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { getRoomData, getSessionToken, clearRoomData, isPreviewingAsGuest, clearPreviewAsGuest } from '@/lib/session'
import { useRoom } from '@/hooks/useRoom'
import { useChat } from '@/hooks/useChat'
import { useGeofenceAutoLeave } from '@/hooks/useGeofenceAutoLeave'
import InteractionModal from '@/components/InteractionModal'
import KindnessVoteModal from '@/components/KindnessVoteModal'
import HeartToast, { showToast } from '@/components/HeartToast'
import SeatMap from '@/components/SeatMap'
import RoomTabBar, { RoomTab } from '@/components/room/RoomTabBar'
import VenueTab from '@/components/room/VenueTab'
import StarTab from '@/components/room/StarTab'
import RoomChatTab from '@/components/room/RoomChatTab'
import { useQna } from '@/hooks/useQna'
import { Participant, StaffMember, StaffShift } from '@/lib/supabase/types'
import { simulateHotTaps, hotIndexAt } from '@/lib/hotIndex'
import { WARNING_COOLDOWN_MS, STAR_COOLDOWN_MS } from '@/lib/cooldown'
import { fmtSeatElapsed } from '@/lib/seatDisplay'
import InlineMessage from '@/components/InlineMessage'
import Icon from '@/components/Icon'
import { GAP, ICON, SEMANTIC } from '@/lib/design'

function fmtCd(s: number) {
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
}

// 상단바의 아이콘 버튼(설정/나가기). 둘이 나란히 있는데 각각 인라인으로 같은 값을 적고
// 있었다 — 같은 그룹의 두 버튼은 한 글자도 달라선 안 되므로 상수로 뽑았다 (ADR-0009).
const HEADER_BTN: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 10, background: 'var(--card2)',
  border: '1px solid var(--border)', color: 'var(--muted2)', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

const LONG_PRESS_MS = 2000
const SEAT_CANVAS_HEIGHT = 300

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  const router = useRouter()
  const roomData = getRoomData()

  const [showModal, setShowModal] = useState(false)
  // 하단 4탭 네비 (Phase 9 리디자인) — 매장/별점/채팅/직원.
  const [tab, setTab] = useState<RoomTab>('venue')
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

  // 개발자 테스트 전용 — 운영자가 /dev/rooms에서 "테스트 입장"을 누르면 같은 탭에서 바로
  // 손님 화면을 보여주기 위해, 실제로는 호스트여도(state.isHost=true) 렌더링만 손님으로
  // 취급한다. 서버 권한 판정은 전혀 안 바뀐다 — 방 이동/경고 메시지 같은 실제 운영자
  // 액션은 여전히 서버가 별도로 인증한다. 아래부터는 state.isHost 대신 이 값만 쓴다.
  const previewingAsGuest = isPreviewingAsGuest()
  const effectiveIsHost = state.isHost && !previewingAsGuest

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

  // 좌석 선택 = 방 입장 (ADR-0001). 매장이 좌석을 등록해뒀는데 아직 안 골랐다면 방 화면의
  // 어떤 기능도 열지 않고 전용 좌석 선택 화면으로 보낸다. 운영자(호스트)는 손님 좌석을 고를
  // 필요가 없고, 좌석을 아예 등록 안 한 매장은 이 게이트를 걸면 아무도 못 들어오므로 제외한다.
  // 첫 로딩 전에는 판단하지 않는다 — 좌석 목록이 아직 안 온 것과 "좌석 없는 매장"은 다르다.
  const needsSeatSelection =
    state.initialLoaded &&
    !effectiveIsHost &&
    state.seats.length > 0 &&
    !state.participants.find(p => p.id === myParticipantId)?.seat_id
  useEffect(() => {
    if (needsSeatSelection) router.replace(`/room/${code}/seat`)
  }, [needsSeatSelection, code, router])

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

  // 직원 교대(출근/퇴근) — Staff 도메인, BUSINESS_RULES.md §2.4 "교대 트리거 위치".
  // Guest Care와 같은 이유로 운영자가 이미 보고 있는 이 방 화면에서 처리한다.
  // state.isHost가 아니면 전혀 쓰이지 않는다 — 아래 렌더링에서도 호스트에게만 노출한다.
  const [staffRoster, setStaffRoster] = useState<StaffMember[]>([])
  const [staffShifts, setStaffShifts] = useState<StaffShift[]>([])
  const [staffBusyId, setStaffBusyId] = useState<string | null>(null)
  const [staffError, setStaffError] = useState('')

  useEffect(() => {
    if (!effectiveIsHost || !state.venue) return
    fetch(`/api/venues/${state.venue.id}/staff`)
      .then(res => res.json())
      .then(data => setStaffRoster(data.staff ?? []))
      .catch(() => {})
  }, [effectiveIsHost, state.venue])

  const handleToggleShift = async (staffId: string, onShift: boolean) => {
    setStaffBusyId(staffId)
    setStaffError('')
    try {
      const res = await fetch(`/api/rooms/${code}/staff-shifts`, {
        method: onShift ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_id: staffId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setStaffShifts(prev => [...prev.filter(s => s.id !== data.shift.id), data.shift])
    } catch (e) {
      setStaffError(e instanceof Error ? e.message : '처리에 실패했습니다')
    } finally {
      setStaffBusyId(null)
    }
  }

  // 운영 메모(operation_events) — Operator Analytics 도메인, BUSINESS_RULES.md §2.10
  // "이벤트 기록 예외". 사전 정의된 타입이 아닌 자유 텍스트 타임스탬프 메모이며, 여기
  // (방 화면)에 실시간으로 쌓이고 마감 후엔 대시보드 그래프의 마커로도 나타난다.
  const [eventMemos, setEventMemos] = useState<{ id: string; content: string; created_at: string }[]>([])
  const [newMemo, setNewMemo] = useState('')
  const [memoSending, setMemoSending] = useState(false)
  const [memoError, setMemoError] = useState('')

  // 직원 교대 현황 + 운영 메모는 둘 다 운영자 전용, 같은 5초 주기라 하나의 인터벌로 묶어서
  // 매 tick마다 왕복 2번 대신 1번(Promise.all)만 나가게 한다 — 방 화면은 이미 리액션/참여자
  // 요약(3초) + 손님 경고 확인(5초)까지 별도로 폴링하고 있어, 굳이 더 늘릴 이유가 없다.
  useEffect(() => {
    if (!effectiveIsHost || !state.venue) return
    const load = () => {
      Promise.all([
        fetch(`/api/rooms/${code}/staff-shifts`).then(res => res.json()),
        fetch(`/api/rooms/${code}/events`).then(res => res.json()),
      ])
        .then(([shiftsData, eventsData]) => {
          setStaffShifts(shiftsData.shifts ?? [])
          setEventMemos(eventsData.events ?? [])
        })
        .catch(() => {})
    }
    load()
    const interval = setInterval(load, 5_000)
    return () => clearInterval(interval)
  }, [effectiveIsHost, state.venue, code])

  const handleAddMemo = async () => {
    if (!newMemo.trim()) return
    setMemoSending(true)
    setMemoError('')
    try {
      const res = await fetch(`/api/rooms/${code}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newMemo.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setEventMemos(prev => [...prev, data.event])
      setNewMemo('')
    } catch (e) {
      setMemoError(e instanceof Error ? e.message : '메모 추가에 실패했습니다')
    } finally {
      setMemoSending(false)
    }
  }

  // 채팅 탭이 열려있지 않아도 새 메시지 수를 계속 추적할 수 있도록 여기서 구독을 유지한다
  // (탭 컴포넌트 안에서만 구독하면 다른 탭으로 옮기는 순간 구독이 끊겨 안읽음을 셀 수 없음).
  const { messages: chatMessages, loading: chatLoading, sendMessage } = useChat(roomData?.roomId ?? '')
  // 외부 QnA 채널 — 채팅 탭이 열려 있을 때만 폴링한다.
  const { messages: qnaMessages, sendQna } = useQna(state.venue?.id, tab === 'chat')
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
    if (tab !== 'chat') {
      const fromOthers = newOnes.filter(m => m.sender_participant_id !== roomData?.participantId)
      if (fromOthers.length > 0) setUnreadCount(c => c + fromOthers.length)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatMessages, chatLoading])

  // 채팅 탭을 열면 안읽음을 비우고, 베타 참여도 분석용으로 최초 1회만 기록한다.
  const chatOpenLoggedRef = useRef(false)
  useEffect(() => {
    if (tab !== 'chat') return
    setUnreadCount(0)
    if (chatOpenLoggedRef.current || !roomData) return
    chatOpenLoggedRef.current = true
    fetch('/api/participants', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participant_id: roomData.participantId, session_token: getSessionToken(), event: 'chat_opened' }),
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

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
        showToast({ icon: 'favorite', message: '누군가 하트를 보냈어요!', color: SEMANTIC.danger })
        if (latest.sender_participant_id) {
          checkMutualOnReceive(latest.sender_participant_id)
        }
      } else if (latest.type === 'warning') {
        showToast({ icon: 'volume_off', message: '잠깐, 오늘 좀 과한 것 같아요', color: SEMANTIC.warning })
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

  // 나가기 처리가 서버에서 실패했는데 조용히 화면만 나가버리면, 다른 사람들 화면에는
  // 계속 남아있는 유령 참여자가 된다. 실패 시 안내하고 방에 머문다.
  const performLeave = async () => {
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

  // 직원 친절도 투표 (Staff 도메인, BUSINESS_RULES.md §2.12 "참여자 방 나가기 흐름").
  // BUSINESS 방이고 그 영업일에 실제로 근무한 직원이 있을 때만 노출한다 — PERSONAL 방과
  // 직원이 없던 매장은 기존 confirm+즉시 나가기 그대로 유지한다. 모달의 두 버튼(스킵/투표)
  // 자체가 "나가기 확인"을 겸하므로, 이 경우엔 별도 confirm()을 띄우지 않는다.
  const [showKindnessVote, setShowKindnessVote] = useState(false)
  const [kindnessCandidates, setKindnessCandidates] = useState<{ staff_id: string; name: string }[]>([])
  const [kindnessSubmitting, setKindnessSubmitting] = useState(false)

  const handleLeave = async () => {
    if (state.venue) {
      try {
        const res = await fetch(`/api/rooms/${code}/staff-evaluations`)
        const data = await res.json()
        if (res.ok && (data.candidates ?? []).length > 0) {
          setKindnessCandidates(data.candidates)
          setShowKindnessVote(true)
          return
        }
      } catch {
        // 후보 조회 실패는 아래 기존 흐름(confirm 후 즉시 나가기)으로 조용히 폴백한다.
      }
    }
    if (!confirm('방을 나갈까요?')) return
    await performLeave()
  }

  const handleKindnessSubmit = async (staffId: string | null) => {
    setKindnessSubmitting(true)
    if (staffId) {
      try {
        await fetch(`/api/rooms/${code}/staff-evaluations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ participant_id: roomData?.participantId, session_token: getSessionToken(), staff_id: staffId }),
        })
      } catch {
        // 투표는 부가 기능이지 나가기의 전제조건이 아니다 — 실패해도 나가기는 계속 진행한다.
      }
    }
    setShowKindnessVote(false)
    setKindnessSubmitting(false)
    await performLeave()
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

  const handleHot = () => {
    const id = Math.random().toString(36).slice(2)
    setHotFloaters(prev => [...prev, id])
    setTimeout(() => setHotFloaters(prev => prev.filter(x => x !== id)), 900)
    if (roomData) {
      sendReaction(roomData.participantId, 'hot').catch(err => {
        console.error('[HOT] sendReaction failed:', err)
      })
    }
  }

  if (!roomData) return null

  void tick
  // 전체 탭 히스토리 시뮬레이션(비쌈)은 리액션 목록이 바뀔 때만 다시 하고,
  // 1초 tick마다 필요한 "지금 값"은 그 결과에서 O(1)로 읽는다.
  const hotIndex = hotIndexAt(hotSim)

  // 받은 자제 시그널 중 가장 최근 시각 기준으로 남은 휴식 시간을 계산 (새로고침해도 유지됨)
  const myWarningReactions = state.reactions.filter(r => r.receiver_id === roomData.participantId && r.type === 'warning')
  const lastWarningAt = myWarningReactions.length > 0
    ? Math.max(...myWarningReactions.map(r => new Date(r.created_at).getTime()))
    : null
  const warningRemainingMs = lastWarningAt !== null ? Math.max(0, lastWarningAt + WARNING_COOLDOWN_MS - Date.now()) : 0
  const warningVisible = warningRemainingMs > 0
  const warningCountdown = Math.ceil(warningRemainingMs / 1000)
  const warningBottom = 100


  // 내 좌석 — 좌석 선택은 방 입장의 전제조건이라 전용 화면(`/room/[code]/seat`)에서 이미
  // 끝났어야 한다(ADR-0001). 여기 도달했다는 건 게이트를 통과했다는 뜻이다.
  const me = state.participants.find(p => p.id === roomData.participantId)
  const occupiedCount = state.participants.filter(p => p.seat_id).length

  const starCooldownMs = (() => {
    const mine = state.reactions.filter(r => r.sender_participant_id === roomData.participantId && r.type === 'star')
    if (mine.length === 0) return 0
    const last = Math.max(...mine.map(r => new Date(r.created_at).getTime()))
    return Math.max(0, last + STAR_COOLDOWN_MS - Date.now())
  })()

  return (
    <main style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', paddingBottom: 96 }}>
      {/* 개발자 미리보기 배너 — 실제로는 운영자인데 손님 화면을 보는 중임을 알려주고,
          끄는 버튼을 준다(안 그러면 이 탭이 계속 손님으로 보여서 헷갈린다). */}
      {previewingAsGuest && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 10, padding: '8px 16px',
          background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: GAP.tight + 2 }}>
            <Icon name="visibility" size={ICON.inline} />
            손님 화면 미리보기 중 (실제로는 운영자)
          </span>
          <button onClick={() => { clearPreviewAsGuest(); window.location.reload() }}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 6, color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 10px', cursor: 'pointer' }}>
            미리보기 종료
          </button>
        </div>
      )}
      {/* 상단 바 — 브랜드 표시 + 나가기 */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '52px 20px 12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 9, height: 9, borderRadius: 999, background: 'var(--accent)' }} />
          <span style={{ fontSize: 15, fontWeight: 800 }}>LIview</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {effectiveIsHost && state.venue && (
            <button onClick={() => router.push(`/operator/settings/${state.venue!.id}`)} aria-label="매장 설정"
              style={{ ...HEADER_BTN }}>
              <Icon name="settings" size={ICON.row} />
            </button>
          )}
          <button onClick={handleLeave} aria-label="나가기"
            style={{ ...HEADER_BTN }}>
            <Icon name="login" size={ICON.row} style={{ transform: 'rotate(180deg)' }} />
          </button>
        </div>
      </header>

      {/* 자리배치도 — 항상 상단에 고정 노출 (Seating 도메인 §2.8).
          손님은 이미 전용 화면에서 좌석을 골랐으므로 여기선 읽기 전용이다(ADR-0001).
          운영자: 길게 눌러 좌석 이동, 짧게 눌러 메시지. */}
      {state.venue && state.seats.length > 0 && (
        <div style={{ position: 'relative' }}>
          {effectiveIsHost ? (
            <>
              {armedSeatId && (
                <div className="card-sm" style={{ margin: '0 20px 8px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>이동할 좌석을 선택하세요</span>
                  <button onClick={() => setArmedSeatId(null)} style={{ fontSize: 12, color: 'var(--muted2)', background: 'none', border: 'none', cursor: 'pointer' }}>취소</button>
                </div>
              )}
              {careError && <div style={{ padding: '0 20px 8px' }}><InlineMessage type="error">{careError}</InlineMessage></div>}
              {/* 손님 뷰와 같은 SeatMap을 쓰되 운영자 전용 상호작용(롱프레스 이동 / 짧게 눌러
                  케어 메뉴 / 닉네임·착석시간 표시)만 얹는다 — 확대·이동·미니맵을 두 뷰가
                  똑같이 갖게 하려면 캔버스를 따로 그리지 않고 공유해야 한다(ADR-0008). */}
              <SeatMap
                seats={state.seats}
                participants={state.participants}
                hotReactions={state.reactions.filter(r => r.type === 'hot')}
                now={Date.now()}
                height={SEAT_CANVAS_HEIGHT}
                layoutItems={state.layoutItems}
                armedSeatId={armedSeatId}
                onSeatPressStart={(seat, occupant) => startSeatPress(seat.id, occupant)}
                onSeatPressEnd={(seat, occupant) => handleSeatRelease(seat.id, occupant)}
                onSeatContextMenu={(seat, occupant) => { if (occupant) setMenuTarget(occupant) }}
                renderSeatCaption={(seat, occupant) => occupant && (
                  <>
                    <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)' }}>{occupant.nickname}</p>
                    {occupant.seat_assigned_at && (
                      <p style={{ fontSize: 9, color: 'var(--muted)' }}>
                        {fmtSeatElapsed(occupant.seat_assigned_at, Date.now())}
                      </p>
                    )}
                  </>
                )}
              />
            </>
          ) : (
            <SeatMap
              seats={state.seats}
              participants={state.participants}
              hotReactions={state.reactions.filter(r => r.type === 'hot')}
              now={Date.now()}
              myParticipantId={roomData.participantId}
              height={SEAT_CANVAS_HEIGHT}
              layoutItems={state.layoutItems}
            />
          )}
        </div>
      )}

      {/* 탭 콘텐츠 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {tab === 'venue' && (
          <>
            <VenueTab
              venue={state.venue}
              moodAverage={state.moodAverage}
              occupied={occupiedCount}
              capacity={state.seats.length}
              hotIndex={hotIndex}
              businessHours={state.businessHours}
              onHot={handleHot}
            />

            {/* 하트/자제 시그널 (Mutual Match 도메인) — 디자인의 4탭에는 없지만 살아있는
                기능이라 매장 탭 안에 유지한다. */}
            <div style={{ padding: '4px 20px 0' }}>
              <button className="btn btn-secondary" onClick={() => setShowModal(true)}
                style={{ fontSize: 15, gap: GAP.snug }}>
                <Icon name="stars" size={ICON.row} />
                지금 표현하기
              </button>
            </div>

            {/* 직원 교대 (Staff 도메인 §2.4) — 운영자 전용 */}
            {effectiveIsHost && state.venue && staffRoster.length > 0 && (
              <div style={{ padding: '20px 20px 0' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted2)', marginBottom: 12 }}>직원 교대</p>
                {staffError && <InlineMessage type="error" style={{ marginBottom: 8 }}>{staffError}</InlineMessage>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {staffRoster.map(s => {
                    const onShift = staffShifts.some(sh => sh.staff_id === s.id && !sh.ended_at)
                    return (
                      <div key={s.id} className="card-sm" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{s.name}</span>
                        <button onClick={() => handleToggleShift(s.id, onShift)} disabled={staffBusyId === s.id}
                          className={onShift ? 'btn btn-secondary' : 'btn btn-primary'}
                          style={{ minHeight: 'auto', width: 'auto', padding: '6px 16px', fontSize: 12, opacity: staffBusyId === s.id ? 0.5 : 1 }}>
                          {onShift ? '퇴근' : '출근'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 운영 메모 (Operator Analytics 도메인 §2.10) — 운영자 전용 */}
            {effectiveIsHost && state.venue && (
              <div style={{ padding: '20px 20px 0' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted2)', marginBottom: 12 }}>운영 메모</p>
                {memoError && <InlineMessage type="error" style={{ marginBottom: 8 }}>{memoError}</InlineMessage>}
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <input className="input" value={newMemo} onChange={e => setNewMemo(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddMemo()} placeholder="예: 단체 손님 케이크 서비스" maxLength={200}
                    style={{ flex: 1, padding: '10px 14px', fontSize: 13 }} />
                  <button className="btn btn-secondary" onClick={handleAddMemo} disabled={memoSending || !newMemo.trim()}
                    style={{ minHeight: 'auto', padding: '0 16px', width: 'auto' }}>기록</button>
                </div>
                {eventMemos.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 140, overflowY: 'auto' }}>
                    {eventMemos.slice().reverse().map(m => (
                      <p key={m.id} style={{ fontSize: 12, color: 'var(--text2)' }}>
                        <span style={{ color: 'var(--muted2)' }}>
                          {new Date(m.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        </span> {m.content}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 참여자 목록 */}
            <div style={{ padding: '20px 20px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted2)' }}>참여자 목록</p>
                <p style={{ fontSize: 12, color: 'var(--muted)' }}>총 {state.totalReactions}개 리액션</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* 좌석 선택 = 방 입장 완료(ADR-0001)이므로, 아직 좌석을 안 고른 참여자 행은
                    입장이 완료되지 않은 상태다 — 운영자에게는 아직 "참여자"로 보여주지 않는다.
                    운영자(host)는 좌석이 없어도 항상 포함한다. */}
                {state.participants.filter(p => p.is_operator || p.seat_id).map(p => {
                  const isMe = p.id === roomData.participantId
                  const heartCount = state.heartCounts[p.id] ?? 0
                  const warnCount = state.warningCounts[p.id] ?? 0
                  const seatLabel = state.seats.find(s => s.id === p.seat_id)?.label
                  return (
                    <div key={p.id} className="card" style={{
                      padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
                      borderColor: isMe ? 'rgba(225,6,0,0.35)' : undefined,
                      background: isMe ? 'rgba(225,6,0,0.06)' : undefined,
                    }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 999, flexShrink: 0,
                        border: `1.5px solid ${isMe ? 'var(--accent)' : 'var(--border)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, fontWeight: 800, color: isMe ? 'var(--accent)' : 'var(--text2)',
                      }}>
                        {seatLabel ?? (p.nickname[0] ?? '?')}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <p style={{ fontSize: 15, fontWeight: 700, color: isMe ? 'var(--accent)' : 'var(--text)' }}>
                            {p.nickname}{isMe ? ' (나)' : ''}
                          </p>
                          {p.is_operator && <span className="badge" style={{ background: 'rgba(225,6,0,0.18)', color: 'var(--accent)', fontSize: 10 }}>HOST</span>}
                        </div>
                        {isMe && warnCount >= 1 && (
                          <p style={{ fontSize: 11, color: SEMANTIC.warning, marginTop: 2, display: 'flex', alignItems: 'center', gap: GAP.tight }}>
                            <Icon name="volume_off" size={13} />
                            자제 시그널 {warnCount}개 받음
                          </p>
                        )}
                      </div>
                      {heartCount > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'rgba(225,6,0,0.14)', padding: '4px 10px', borderRadius: 20 }}>
                          <Icon name="favorite" size={ICON.inline} style={{ color: 'var(--accent)' }} />
                          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>{heartCount}</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 영업 종료 — 운영자 전용 */}
            {effectiveIsHost && (
              <div style={{ padding: '20px 20px 0' }}>
                <button className="btn btn-secondary" onClick={handleEndRoom} disabled={endingRoom}
                  style={{ fontSize: 14, opacity: endingRoom ? 0.6 : 1 }}>
                  {endingRoom ? '마감 중...' : '오늘 영업 종료'}
                </button>
              </div>
            )}
          </>
        )}

        {tab === 'star' && (
          <StarTab
            venue={state.venue}
            moodAverage={state.moodAverage}
            cooldownMs={starCooldownMs}
            onSubmit={async (value: number) => {
              const res = await handleSend(roomData.participantId, 'star', value)
              return { error: res?.error }
            }}
          />
        )}

        {tab === 'chat' && (
          <RoomChatTab
            messages={chatMessages}
            qna={qnaMessages}
            seats={state.seats}
            participants={state.participants}
            myParticipantId={roomData.participantId}
            onSendRoom={async (content: string) => {
              const res = await sendMessage(content, { participantId: roomData.participantId, nickname: roomData.nickname })
              return { error: res?.error }
            }}
            onSendQna={sendQna}
          />
        )}

        {tab === 'staff' && (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <p style={{ display: 'flex', justifyContent: 'center', marginBottom: GAP.base, color: 'var(--muted)' }}>
              <Icon name="front_hand" size={ICON.hero} />
            </p>
            <p style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>친절 직원 투표</p>
            <p style={{ fontSize: 13, color: 'var(--muted2)', lineHeight: 1.6 }}>
              지금은 방을 나갈 때 투표할 수 있어요.<br />이 화면은 곧 준비될 예정이에요.
            </p>
          </div>
        )}
      </div>

      {/* HOT 탭 플로터 */}
      {hotFloaters.map(id => (
        <span key={id} className="animate-float-up" style={{
          position: 'fixed', bottom: 140, left: '50%', transform: 'translateX(-50%)',
          pointerEvents: 'none', zIndex: 45, color: 'var(--accent)',
        }}><Icon name="local_fire_department" size={34} /></span>
      ))}

      <RoomTabBar active={tab} onSelect={setTab} chatBadge={unreadCount} />

      {mutualBanner && (
        <div onClick={() => setMutualBanner(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', padding: '0 32px' }}>
          <div className="card animate-fade-in" onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 320, padding: '32px 24px', textAlign: 'center', border: '1.5px solid rgba(225,6,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: GAP.base, color: 'var(--accent)' }}>
              <Icon name="favorite" size={52} />
            </div>
            <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)', marginBottom: GAP.snug }}>통했어요!</p>
            <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: GAP.section, lineHeight: 1.6 }}>서로의 마음이<br />연결되었어요</p>
            <button onClick={() => setMutualBanner(false)} className="btn btn-primary" style={{ fontSize: 15, minHeight: 48 }}>확인</button>
          </div>
        </div>
      )}

      {showKindnessVote && (
        <KindnessVoteModal candidates={kindnessCandidates} onSubmit={handleKindnessSubmit} submitting={kindnessSubmitting} />
      )}

      {warningVisible && (
        <div style={{ position: 'fixed', bottom: warningBottom, left: '50%', transform: 'translateX(-50%)', width: 'calc(100% - 40px)', maxWidth: 408, zIndex: 40, background: 'rgba(245,158,11,0.15)', border: '1.5px solid rgba(245,158,11,0.5)', borderRadius: 16, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: SEMANTIC.warning, display: 'flex' }}><Icon name="volume_off" size={ICON.card} /></span>
          <p style={{ fontSize: 14, fontWeight: 700, color: SEMANTIC.warning, flex: 1 }}>우리 5분만 쉬어요</p>
          <span style={{ fontSize: 22, fontWeight: 800, color: '#f59e0b', fontVariantNumeric: 'tabular-nums' }}>{fmtCd(warningCountdown)}</span>
        </div>
      )}

      {showModal && (
        <InteractionModal participants={state.participants} reactions={state.reactions} myParticipantId={roomData.participantId} onSend={handleSend} onClose={() => setShowModal(false)} />
      )}

      {/* 운영자 경고 메시지 모달 — 확인 버튼을 눌러야만 닫힌다 (§2.9) */}
      {pendingAlert && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', padding: '0 32px' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 340, padding: '28px 22px', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: GAP.base, color: 'var(--accent)' }}>
              <Icon name="campaign" size={40} />
            </div>
            <p style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700, marginBottom: 8, letterSpacing: '0.05em' }}>매장에서 보낸 메시지</p>
            <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, lineHeight: 1.6 }}>{pendingAlert.message}</p>
            {alertError && <InlineMessage type="error" style={{ marginBottom: 12 }}>{alertError}</InlineMessage>}
            <button onClick={handleAcknowledgeAlert} disabled={acknowledgingAlert} className="btn btn-primary" style={{ fontSize: 15, minHeight: 48, opacity: acknowledgingAlert ? 0.6 : 1 }}>
              {acknowledgingAlert ? '처리 중...' : '확인'}
            </button>
          </div>
        </div>
      )}

      {/* 운영자가 손님에게 보내는 경고 메시지 작성 모달 (§2.9) */}
      {menuTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div className="card" style={{ padding: 20, width: '100%', maxWidth: 380 }}>
            <p style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>{menuTarget.nickname}님에게 메시지 보내기</p>
            <textarea value={careMessage} onChange={e => setCareMessage(e.target.value)}
              placeholder="예: 목소리를 조금만 낮춰주세요" maxLength={200} rows={3} className="input"
              style={{ width: '100%', resize: 'none', marginBottom: 12 }} />
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
