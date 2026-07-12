'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSessionToken, storeRoomData } from '@/lib/session'
import BackButton from '@/components/BackButton'

const RANDOM_NICKNAMES = [
  '소주1번', '안취했어', '오늘만산다', '고삐풀림', '날못막아',
  '분위기왕', '술신강림', '흥부자', '열정맨', '웃음폭탄',
  '오늘의MVP', '회식지박령', '나는전설', '이판사판', '밤새자자',
  '황금망치', '모임의신', '까리한나', '핵인싸', '술꾼대장',
]

function randomNickname() {
  return RANDOM_NICKNAMES[Math.floor(Math.random() * RANDOM_NICKNAMES.length)]
}

function JoinContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [code, setCode] = useState(searchParams.get('code') ?? '')
  const [nickname, setNickname] = useState(() => randomNickname())
  const [step, setStep] = useState<'code' | 'nickname'>(searchParams.get('code') ? 'nickname' : 'code')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [roomName, setRoomName] = useState('')

  useEffect(() => {
    if (code.length === 6 && step === 'code') verifyCode()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  const verifyCode = async () => {
    if (code.length !== 6) return
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/rooms/${code}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      // BUSINESS 방은 코드 입장 자체를 서버가 거부한다(고정 QR 전용, BUSINESS_RULES.md §2.1) —
      // 닉네임 입력까지 갔다가 마지막에 막히는 대신 여기서 바로 안내한다.
      if (data.room.room_type === 'BUSINESS') {
        setError('이 매장은 매장에 비치된 QR로만 입장할 수 있어요')
        return
      }
      setRoomName(data.room.name)
      setStep('nickname')
    } catch (e) {
      setError(e instanceof Error ? e.message : '코드를 확인해주세요')
    } finally { setLoading(false) }
  }

  const handleJoin = async () => {
    if (!nickname.trim()) { setError('닉네임을 입력해주세요'); return }
    setLoading(true); setError('')
    try {
      const session_token = getSessionToken()
      const res = await fetch(`/api/rooms/${code}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nickname.trim(), session_token }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      storeRoomData({
        roomId: data.room.id, roomCode: data.room.code, roomName: data.room.name,
        participantId: data.participant.id, nickname: nickname.trim(),
      })
      router.push(`/room/${data.room.code}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다')
      setLoading(false)
    }
  }

  return (
    <main className="flex flex-col min-h-dvh px-6" style={{ paddingTop: 56, paddingBottom: 32 }}>
      <BackButton onClick={() => step === 'nickname' && !searchParams.get('code') ? setStep('code') : router.back()} marginBottom={32} />

      {step === 'code' ? (
        <div className="animate-fade-in">
          <p style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700, marginBottom: 6, letterSpacing: '0.05em' }}>JOIN ROOM</p>
          <h1 style={{ fontSize: 30, fontWeight: 800, marginBottom: 8 }}>방 참여하기</h1>
          <p style={{ color: 'var(--muted2)', fontSize: 14, marginBottom: 32 }}>호스트에게 받은 6자리 코드 입력</p>
          <input type="text" value={code}
            onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
            placeholder="ABCD12" maxLength={6}
            style={{ width: '100%', padding: '20px', borderRadius: 16, textAlign: 'center', fontSize: 32, fontWeight: 800, letterSpacing: '0.3em', background: 'var(--card)', border: '1.5px solid rgba(255,107,107,0.3)', color: 'var(--accent)', outline: 'none' }}
            autoFocus />
          {error && <p style={{ marginTop: 10, fontSize: 13, color: '#ff6b6b', textAlign: 'center' }}>{error}</p>}
          <button className="btn btn-primary" onClick={verifyCode} disabled={code.length !== 6 || loading}
            style={{ marginTop: 20, opacity: code.length !== 6 ? 0.4 : 1, fontSize: 17 }}>
            {loading ? '확인 중...' : '코드 확인 →'}
          </button>
        </div>
      ) : (
        <div className="animate-fade-in">
          <div className="card-sm" style={{ padding: '14px 16px', marginBottom: 32, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,107,107,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🍻</div>
            <div>
              <p style={{ fontSize: 11, color: 'var(--muted2)', marginBottom: 2 }}>참여할 방</p>
              <p style={{ fontSize: 16, fontWeight: 700 }}>{roomName || code}</p>
            </div>
          </div>
          <p style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700, marginBottom: 6, letterSpacing: '0.05em' }}>NICKNAME</p>
          <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 6 }}>별명을 정해보세요!</h2>
          <p style={{ color: 'var(--muted2)', fontSize: 13, marginBottom: 20 }}>
            ex) 소주1번, 고삐풀림, 날못막아
          </p>
          <input
            className="input"
            type="text"
            value={nickname}
            onChange={e => setNickname(e.target.value.slice(0, 10))}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
            placeholder="내 별명"
            maxLength={10}
            autoComplete="off"
            autoCorrect="off"
            autoFocus
          />
          <button
            onClick={() => setNickname(randomNickname())}
            style={{ marginTop: 10, width: '100%', padding: '10px', borderRadius: 12, background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.2)', color: 'var(--accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            🎲 다른 별명 추첫하기
          </button>
          {error && <p style={{ marginTop: 8, fontSize: 13, color: '#ff6b6b' }}>{error}</p>}
          <button className="btn btn-primary" onClick={handleJoin} disabled={loading || !nickname.trim()}
            style={{ marginTop: 16, opacity: !nickname.trim() ? 0.4 : 1, fontSize: 17 }}>
            {loading ? '입장 중...' : '🚀 입장하기'}
          </button>
        </div>
      )}
    </main>
  )
}

export default function JoinPage() {
  return <Suspense><JoinContent /></Suspense>
}
