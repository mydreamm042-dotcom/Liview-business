'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { setSessionToken, storeRoomData, setPreviewAsGuest } from '@/lib/session'
import { Venue } from '@/lib/supabase/types'
import BackButton from '@/components/BackButton'
import LoadingScreen from '@/components/LoadingScreen'
import InlineMessage from '@/components/InlineMessage'

interface Session { id: string; code?: string; name: string; status: string }

// 개발/테스트 전용 페이지 — QR 카메라나 위치(GPS)가 없는 PC에서도 손님이 실제로 보는
// 화면(좌석 선택/HOT/별점/채팅)을 확인할 수 있게, 비밀번호·위치 반경 검사 없이 테스트
// 손님으로 입장시킨다(/api/venues/[id]/dev-join). 로그인한 운영자 본인 소유 매장에만
// 쓸 수 있다 — 공개 기능이 아니다. 운영 배포에 노출해도 되지만 손님에게 안내할 이유는
// 없는 화면이라 홈 화면 등에서 링크로 연결하지 않는다.
//
// 같은 탭에서 바로 방 화면으로 넘어간다 — 방 화면의 isHost는 원래 참여자 session_token이
// 아니라 운영자 로그인 세션으로만 판정되어 같은 탭에서는 계속 호스트 화면이 떴었는데,
// setPreviewAsGuest()로 렌더링만 손님으로 뒤집는다(session.ts 주석 참고). 별도 브라우저나
// 시크릿창이 더 이상 필요 없다.
export default function DevRoomsPage() {
  const router = useRouter()
  const [venues, setVenues] = useState<Venue[] | null>(null)
  const [sessions, setSessions] = useState<Record<string, Session | null>>({})
  const [loadError, setLoadError] = useState('')
  const [nicknames, setNicknames] = useState<Record<string, string>>({})
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/venues')
      .then(res => {
        if (res.status === 401) { setLoadError('운영자 로그인이 필요해요'); return null }
        return res.json()
      })
      .then(data => {
        if (!data) return
        const list: Venue[] = data.venues ?? []
        setVenues(list)
        list.forEach(v => {
          fetch(`/api/venues/${v.id}/session`)
            .then(res => res.json())
            .then(d => setSessions(prev => ({ ...prev, [v.id]: d.session ?? null })))
            .catch(() => setSessions(prev => ({ ...prev, [v.id]: null })))
        })
      })
      .catch(() => setLoadError('매장 목록을 불러오지 못했습니다'))
  }, [])

  const handleTestJoin = async (venueId: string) => {
    setJoiningId(venueId)
    setError('')
    try {
      const res = await fetch(`/api/venues/${venueId}/dev-join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nicknames[venueId] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      // 이 브라우저가 앞으로 이 테스트 참여자로 행동하도록 세션 토큰을 맞추고, 렌더링을
      // 손님으로 고정한다(운영자 로그인 세션 자체는 안 건드림 — 위 주석 참고).
      setSessionToken(data.session_token)
      storeRoomData({
        roomId: data.room.id, roomCode: data.room.code, roomName: data.room.name,
        participantId: data.participant.id, nickname: data.participant.nickname,
      })
      setPreviewAsGuest()
      router.push(`/room/${data.room.code}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '테스트 입장에 실패했습니다')
    } finally {
      setJoiningId(null)
    }
  }

  if (loadError === '운영자 로그인이 필요해요') {
    return (
      <main className="flex flex-col min-h-dvh px-6 items-center justify-center" style={{ gap: 16 }}>
        <p style={{ fontSize: 14, color: 'var(--muted2)' }}>운영자 로그인이 필요해요</p>
        <button className="btn btn-primary" onClick={() => router.push('/operator/login')} style={{ maxWidth: 200 }}>로그인하러 가기</button>
      </main>
    )
  }
  if (loadError) {
    return (
      <main className="flex flex-col min-h-dvh px-6 items-center justify-center">
        <InlineMessage type="error">{loadError}</InlineMessage>
      </main>
    )
  }
  if (venues === null) return <LoadingScreen label="매장 목록을 불러오는 중..." />

  return (
    <main className="flex flex-col min-h-dvh px-6" style={{ paddingTop: 56, paddingBottom: 40 }}>
      <BackButton onClick={() => router.push('/')} marginBottom={20} />
      <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.08em', marginBottom: 6 }}>DEV ONLY</p>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>테스트 손님 입장</h1>
      <p style={{ fontSize: 13, color: 'var(--muted2)', marginBottom: 24, lineHeight: 1.6 }}>
        QR 카메라·위치 확인 없이, 실제 손님이 보는 방 화면(좌석 선택/HOT/별점/채팅)을 바로 확인할 수 있어요.
        본인 소유 매장 + 영업 중일 때만 가능해요.
      </p>

      {error && <div style={{ marginBottom: 16 }}><InlineMessage type="error">{error}</InlineMessage></div>}

      {venues.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', marginTop: 40 }}>등록된 매장이 없어요</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {venues.map(v => {
          const session = sessions[v.id]
          const isOpen = session != null
          return (
            <div key={v.id} className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <p style={{ fontSize: 16, fontWeight: 800 }}>{v.name}</p>
                <span className="badge" style={{
                  background: isOpen ? 'rgba(16,185,129,0.15)' : 'var(--card2)',
                  color: isOpen ? '#10b981' : 'var(--muted2)',
                }}>
                  {isOpen ? '영업 중' : '영업 종료'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="input"
                  placeholder="테스트 닉네임 (선택)"
                  value={nicknames[v.id] ?? ''}
                  onChange={e => setNicknames(prev => ({ ...prev, [v.id]: e.target.value }))}
                  maxLength={10}
                  style={{ flex: 1, padding: '10px 14px', fontSize: 13 }}
                />
                <button className="btn btn-primary" onClick={() => handleTestJoin(v.id)}
                  disabled={!isOpen || joiningId === v.id}
                  style={{ width: 'auto', minHeight: 'auto', padding: '0 16px', fontSize: 13, opacity: !isOpen ? 0.4 : 1 }}>
                  {joiningId === v.id ? '입장 중...' : '테스트 입장'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </main>
  )
}
