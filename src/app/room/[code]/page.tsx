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
import { simulateHotTaps, hotIndexAt, HOT_HOLD_MS, HOT_TOTAL_MS } from '@/lib/hotIndex'
import { WARNING_COOLDOWN_MS } from '@/lib/cooldown'

function fmtCd(s: number) {
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
}

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
      <HeartToast />
    </main>
  )
}
