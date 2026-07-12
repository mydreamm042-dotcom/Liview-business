'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { getSessionToken, storeRoomData } from '@/lib/session'
import { VenueCategory } from '@/lib/supabase/types'
import LoadingScreen from '@/components/LoadingScreen'

const RANDOM_NICKNAMES = [
  '소주1번', '안취했어', '오늘만산다', '고삐풀림', '날못막아',
  '분위기왕', '술신강림', '흥부자', '열정맨', '웃음폭탄',
  '오늘의MVP', '회식지박령', '나는전설', '이판사판', '밤새자자',
]

function randomNickname() {
  return RANDOM_NICKNAMES[Math.floor(Math.random() * RANDOM_NICKNAMES.length)]
}

interface VenuePublic {
  id: string
  name: string
  category: VenueCategory | null
  logo_url: string | null
  primary_color: string | null
  join_password_enabled: boolean
}

type LocationState = 'requesting' | 'granted' | 'denied'

// 고정 QR로 들어온 참여자용 랜딩. 방 코드를 몰라도(요구하지 않고) 위치 + (필요시)
// 오늘의 입장 비밀번호 + 닉네임만으로 매장의 "현재 진행 중인 세션"에 들어간다
// (BUSINESS_RULES.md §2.1~2.3, ROADMAP_V2.md Phase 1.5 스코프 7).
export default function VenueLandingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [venue, setVenue] = useState<VenuePublic | null>(null)
  const [venueError, setVenueError] = useState('')

  const [locationState, setLocationState] = useState<LocationState>('requesting')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)

  const [nickname, setNickname] = useState(() => randomNickname())
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/venues/${id}`)
      .then(res => res.json())
      .then(data => {
        if (!data.venue) { setVenueError('매장을 찾을 수 없습니다'); return }
        setVenue(data.venue)
      })
      .catch(() => setVenueError('매장 정보를 불러오지 못했습니다'))
  }, [id])

  const requestLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationState('denied')
      return
    }
    setLocationState('requesting')
    navigator.geolocation.getCurrentPosition(
      pos => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocationState('granted')
      },
      () => setLocationState('denied'),
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  useEffect(() => { requestLocation() }, [])

  const passwordRequired = venue?.join_password_enabled ?? false

  const handleJoin = async () => {
    if (!nickname.trim()) { setError('닉네임을 입력해주세요'); return }
    if (!coords) { setError('위치 확인이 필요합니다'); return }
    if (passwordRequired && !password.trim()) { setError('입장 비밀번호를 입력해주세요'); return }
    setLoading(true); setError('')
    try {
      const session_token = getSessionToken()
      const res = await fetch(`/api/venues/${id}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname: nickname.trim(),
          session_token,
          password: password.trim() || undefined,
          lat: coords.lat,
          lng: coords.lng,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      storeRoomData({
        roomId: data.room.id, roomCode: data.room.code, roomName: data.room.name,
        participantId: data.participant.id, nickname: nickname.trim(),
      })
      router.push(`/room/${data.room.code}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '입장에 실패했습니다')
    } finally {
      setLoading(false)
    }
  }

  if (venueError) {
    return (
      <main className="flex flex-col min-h-dvh px-6 items-center justify-center">
        <p style={{ color: '#ff6b6b', fontSize: 14 }}>{venueError}</p>
        <button className="btn btn-ghost" onClick={() => router.push('/')} style={{ marginTop: 16 }}>홈으로</button>
      </main>
    )
  }

  if (!venue) {
    return <LoadingScreen />
  }

  const accent = venue.primary_color ?? '#667eea'

  return (
    <main className="flex flex-col min-h-dvh px-6" style={{ paddingTop: 56, paddingBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        {venue.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={venue.logo_url} alt="" style={{ width: 48, height: 48, borderRadius: 14, objectFit: 'cover' }} />
        ) : (
          <div style={{ width: 48, height: 48, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: '#fff', background: accent }}>
            {venue.name[0] ?? '🏪'}
          </div>
        )}
        <div>
          <p style={{ fontSize: 12, color: accent, fontWeight: 700, letterSpacing: '0.05em' }}>WELCOME</p>
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>{venue.name}</h1>
        </div>
      </div>

      {/* 위치 확인 상태 — 반경 검사(BUSINESS_RULES.md §2.2)를 위해 필요하다는 것을 안내 */}
      <div className="card-sm" style={{ padding: '12px 14px', marginBottom: 20 }}>
        {locationState === 'requesting' && <p style={{ fontSize: 13, color: 'var(--muted2)' }}>📍 위치 확인 중...</p>}
        {locationState === 'granted' && <p style={{ fontSize: 13, color: '#10b981' }}>📍 위치 확인 완료 — 매장 근처에 있어야 입장할 수 있어요</p>}
        {locationState === 'denied' && (
          <div>
            <p style={{ fontSize: 13, color: '#ff6b6b', marginBottom: 8 }}>📍 위치 권한이 필요해요. 매장 방문 확인을 위해 꼭 필요합니다</p>
            <button className="btn btn-secondary" onClick={requestLocation} style={{ fontSize: 13, minHeight: 40 }}>다시 시도</button>
          </div>
        )}
      </div>

      <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted2)', letterSpacing: '0.05em', display: 'block', marginBottom: 10 }}>별명을 정해보세요!</label>
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
      />
      <button
        onClick={() => setNickname(randomNickname())}
        style={{ marginTop: 10, width: '100%', padding: '10px', borderRadius: 12, background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.2)', color: 'var(--accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
      >
        🎲 다른 별명 추첨하기
      </button>

      {passwordRequired && (
        <div style={{ marginTop: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted2)', letterSpacing: '0.05em', display: 'block', marginBottom: 10 }}>오늘의 입장 비밀번호</label>
          <input
            className="input"
            type="text"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
            placeholder="매장에서 안내받은 비밀번호"
            autoComplete="off"
            autoFocus
          />
        </div>
      )}

      {error && <p style={{ marginTop: 12, fontSize: 13, color: '#ff6b6b' }}>{error}</p>}

      <button className="btn btn-primary" onClick={handleJoin}
        disabled={loading || !nickname.trim() || locationState !== 'granted' || (passwordRequired && !password.trim())}
        style={{ marginTop: 20, opacity: loading || !nickname.trim() || locationState !== 'granted' || (passwordRequired && !password.trim()) ? 0.4 : 1, fontSize: 17 }}>
        {loading ? '입장 중...' : '🚀 입장하기'}
      </button>
    </main>
  )
}
