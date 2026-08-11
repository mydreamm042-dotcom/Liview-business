'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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
export default function DevRoomsPage() {
  const router = useRouter()
  const [venues, setVenues] = useState<Venue[] | null>(null)
  const [sessions, setSessions] = useState<Record<string, Session | null>>({})
  const [loadError, setLoadError] = useState('')
  const [nicknames, setNicknames] = useState<Record<string, string>>({})
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [error, setError] = useState('')
  // 방금 만든 테스트 입장 링크 — 같은 탭에서 바로 열지 않는다(아래 handleTestJoin 주석 참고).
  const [enterLink, setEnterLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

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
    setEnterLink(null)
    setCopied(false)
    try {
      const res = await fetch(`/api/venues/${venueId}/dev-join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nicknames[venueId] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      // 같은 탭에서 바로 넘기지 않는다 — 방 화면의 isHost는 참여자 session_token이 아니라
      // "이 브라우저가 운영자로 로그인돼 있는가"(Supabase Auth 세션)로만 판정되기 때문에,
      // 지금 이 탭(운영자 로그인 상태)에서 그대로 이동하면 손님 세션으로 바꿔도 여전히
      // 운영자 화면이 뜬다. 대신 링크를 만들어주고, 로그인 안 된 다른 브라우저/시크릿창에서
      // 열도록 안내한다 — /dev/rooms/enter가 이 링크의 파라미터로 세션을 심어준다.
      const params = new URLSearchParams({
        code: data.room.code,
        token: data.session_token,
        roomId: data.room.id,
        roomName: data.room.name,
        participantId: data.participant.id,
        nickname: data.participant.nickname,
      })
      setEnterLink(`${window.location.origin}/dev/rooms/enter?${params.toString()}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '테스트 입장에 실패했습니다')
    } finally {
      setJoiningId(null)
    }
  }

  const handleCopyLink = () => {
    if (!enterLink) return
    navigator.clipboard.writeText(enterLink).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
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

      {enterLink && (
        <div className="card" style={{ padding: 16, marginBottom: 20, border: '1px solid var(--accent)' }}>
          <p style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>테스트 입장 링크가 만들어졌어요</p>
          <p style={{ fontSize: 12, color: 'var(--muted2)', lineHeight: 1.6, marginBottom: 10 }}>
            지금 이 브라우저는 운영자로 로그인돼 있어서 이 링크를 눌러도 계속 운영자 화면이
            떠요. <b>시크릿창(로그인 안 된 브라우저)</b>에 이 링크를 붙여넣어야 실제 손님
            화면이 보입니다.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" readOnly value={enterLink} onFocus={e => e.target.select()}
              style={{ flex: 1, padding: '8px 10px', fontSize: 11 }} />
            <button className="btn btn-secondary" onClick={handleCopyLink}
              style={{ width: 'auto', minHeight: 'auto', padding: '0 14px', fontSize: 13 }}>
              {copied ? '복사됨' : '복사'}
            </button>
          </div>
        </div>
      )}

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
