'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { getSessionToken } from '@/lib/session'
import { Venue, VenueCategory } from '@/lib/supabase/types'

interface Session {
  id: string
  name: string
  status: string
  created_at: string
}

const CATEGORIES: { value: VenueCategory; label: string }[] = [
  { value: 'pocha', label: '포차' },
  { value: 'bar', label: '바' },
  { value: 'pub', label: '펍' },
  { value: 'wine_bar', label: '와인바' },
  { value: 'cafe', label: '카페' },
  { value: 'event_hall', label: '행사장' },
  { value: 'etc', label: '기타' },
]

const PRESET_COLORS = ['#667eea', '#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4', '#8b5cf6', '#ec4899']

export default function OperatorSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [venue, setVenue] = useState<Venue | null>(null)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [saveError, setSaveError] = useState('')

  // 편집 필드
  const [name, setName] = useState('')
  const [category, setCategory] = useState<VenueCategory>('etc')
  const [address, setAddress] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [heroUrl, setHeroUrl] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#667eea')
  const [naverUrl, setNaverUrl] = useState('')
  const [googleUrl, setGoogleUrl] = useState('')
  const [kakaoUrl, setKakaoUrl] = useState('')

  // 영업 시작/종료 (BUSINESS_RULES.md §2.1~2.2 — 고정 QR + 오늘 영업 시작/종료 모델)
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const [sessionBusy, setSessionBusy] = useState(false)
  const [sessionError, setSessionError] = useState('')

  // 입장 비밀번호 ON/OFF (고정 QR 도용 방지 장치, BUSINESS_RULES.md §2.2)
  const [passwordEnabled, setPasswordEnabled] = useState(false)
  const [password, setPassword] = useState('')

  useEffect(() => {
    const token = getSessionToken()
    fetch(`/api/venues/${id}?operator_token=${encodeURIComponent(token)}`)
      .then(res => res.json())
      .then(data => {
        if (!data.venue || !data.isOwner) {
          setLoadError('이 매장의 운영자만 설정을 볼 수 있습니다')
          return
        }
        const v: Venue = data.venue
        setVenue(v)
        setName(v.name ?? '')
        setCategory(v.category ?? 'etc')
        setAddress(v.address ?? '')
        setLogoUrl(v.logo_url ?? '')
        setHeroUrl(v.hero_image_url ?? '')
        setPrimaryColor(v.primary_color ?? '#667eea')
        setNaverUrl(v.naver_review_url ?? '')
        setGoogleUrl(v.google_review_url ?? '')
        setKakaoUrl(v.kakao_review_url ?? '')
        setPasswordEnabled(v.join_password_enabled ?? false)
        setPassword(v.join_password ?? '')
      })
      .catch(() => setLoadError('매장 정보를 불러오지 못했습니다'))

    fetch(`/api/venues/${id}/session?operator_token=${encodeURIComponent(token)}`)
      .then(res => res.json())
      .then(data => setSession(data.session ?? null))
      .catch(() => {})
      .finally(() => setSessionLoaded(true))
  }, [id])

  const handleStartSession = async () => {
    setSessionBusy(true); setSessionError('')
    try {
      const res = await fetch(`/api/venues/${id}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operator_token: getSessionToken() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSession(data.session)
    } catch (e) {
      setSessionError(e instanceof Error ? e.message : '영업 시작에 실패했습니다')
    } finally {
      setSessionBusy(false)
    }
  }

  const handleEndSession = async () => {
    if (!confirm('오늘 영업을 마감할까요? (방 기록은 보존됩니다)')) return
    setSessionBusy(true); setSessionError('')
    try {
      const res = await fetch(`/api/venues/${id}/session?operator_token=${encodeURIComponent(getSessionToken())}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSession(null)
    } catch (e) {
      setSessionError(e instanceof Error ? e.message : '영업 종료에 실패했습니다')
    } finally {
      setSessionBusy(false)
    }
  }

  const handleSave = async () => {
    if (!name.trim()) return
    setSaveError('')
    if (passwordEnabled && !password.trim()) {
      setSaveError('입장 비밀번호를 켰다면 비밀번호를 입력해주세요')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/venues/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operator_token: getSessionToken(),
          name: name.trim(),
          category,
          address: address.trim() || null,
          logo_url: logoUrl.trim() || null,
          hero_image_url: heroUrl.trim() || null,
          primary_color: primaryColor,
          naver_review_url: naverUrl.trim() || null,
          google_review_url: googleUrl.trim() || null,
          kakao_review_url: kakaoUrl.trim() || null,
          join_password_enabled: passwordEnabled,
          join_password: passwordEnabled ? password.trim() : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSavedAt(Date.now())
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '저장에 실패했습니다')
    } finally {
      setSaving(false)
    }
  }

  if (loadError) {
    return (
      <main className="flex flex-col min-h-dvh px-6" style={{ paddingTop: 56 }}>
        <p style={{ color: '#ff6b6b', fontSize: 14 }}>{loadError}</p>
        <button className="btn btn-ghost" onClick={() => router.push('/')} style={{ marginTop: 16 }}>홈으로</button>
      </main>
    )
  }

  if (!venue) {
    return <main className="flex min-h-dvh items-center justify-center"><p style={{ color: 'var(--muted2)' }}>불러오는 중...</p></main>
  }

  const label = { fontSize: 12, fontWeight: 700 as const, color: 'var(--muted2)', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }
  const section = { marginBottom: 24 }
  const appUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const venueJoinUrl = `${appUrl}/v/${id}`
  const isOpen = session?.status === 'active'

  return (
    <main className="flex flex-col min-h-dvh px-6" style={{ paddingTop: 56, paddingBottom: 120 }}>
      <button onClick={() => router.back()}
        style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--card2)', border: '1px solid var(--border)', color: 'var(--text2)', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginBottom: 24 }}>
        ←
      </button>

      <div style={{ marginBottom: 28 }}>
        <p style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700, marginBottom: 6, letterSpacing: '0.05em' }}>OPERATOR</p>
        <h1 style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.2 }}>매장 설정</h1>
        <p style={{ color: 'var(--muted2)', fontSize: 14, marginTop: 4 }}>브랜딩과 리뷰 링크를 설정하세요</p>
      </div>

      {/* 미리보기 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', marginBottom: 24,
        borderRadius: 16, background: 'var(--card)', border: '1px solid var(--border)', borderLeft: `4px solid ${primaryColor}`,
      }}>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" style={{ width: 44, height: 44, borderRadius: 12, objectFit: 'cover' }} />
        ) : (
          <div style={{ width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: '#fff', background: primaryColor }}>
            {(name || venue.name)[0] ?? '🏪'}
          </div>
        )}
        <div>
          <p style={{ fontSize: 16, fontWeight: 800 }}>{name || '매장 이름'}</p>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>손님에게 이렇게 보여요</p>
        </div>
      </div>

      {/* 영업 시작/종료 — 방을 매번 새로 만들지 않고, 등록된 매장에서 오늘 세션만 여닫는다 */}
      <div className="card" style={{ padding: 18, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <p style={{ fontSize: 14, fontWeight: 800 }}>영업 상태</p>
          <span style={{
            fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
            background: isOpen ? 'rgba(16,185,129,0.15)' : 'var(--card2)',
            color: isOpen ? '#10b981' : 'var(--muted2)',
          }}>
            {!sessionLoaded ? '확인 중...' : isOpen ? '영업 중' : '영업 전'}
          </span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted2)', marginBottom: 14 }}>
          {isOpen ? `${session?.name} · 손님이 QR로 바로 입장할 수 있어요` : '오늘 영업을 시작하면 QR로 손님이 입장할 수 있어요'}
        </p>
        {sessionError && <p style={{ fontSize: 12, color: '#ff6b6b', marginBottom: 10 }}>{sessionError}</p>}
        <button
          className={isOpen ? 'btn btn-secondary' : 'btn btn-primary'}
          onClick={isOpen ? handleEndSession : handleStartSession}
          disabled={!sessionLoaded || sessionBusy}
          style={{ opacity: !sessionLoaded || sessionBusy ? 0.5 : 1, fontSize: 15 }}>
          {sessionBusy ? '처리 중...' : isOpen ? '오늘 영업 종료' : '오늘 영업 시작'}
        </button>
      </div>

      {/* 고정 QR — 한 번 등록하면 바뀌지 않음. 방 코드는 별도로 노출하지 않는다
          (BUSINESS_RULES.md §2.2, Discovery 도메인과 동일하게 코드/QR 절대 미표시 원칙) */}
      <div className="card" style={{ padding: 18, marginBottom: 24, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <p style={{ fontSize: 14, fontWeight: 800, marginBottom: 4, alignSelf: 'flex-start' }}>매장 고정 QR</p>
        <p style={{ fontSize: 12, color: 'var(--muted2)', marginBottom: 16, alignSelf: 'flex-start' }}>출력해서 매장에 붙여두세요. 이 QR은 바뀌지 않아요</p>
        <div style={{ padding: 16, borderRadius: 20, background: '#fff', marginBottom: 12 }}>
          <QRCodeSVG value={venueJoinUrl} size={160} />
        </div>
        <button className="btn btn-secondary" onClick={() => navigator.clipboard.writeText(venueJoinUrl)} style={{ fontSize: 14 }}>
          🔗 링크 복사하기
        </button>
      </div>

      {/* 입장 비밀번호 — 고정 QR이 촬영/유출돼도 매장 밖에서 남용하기 어렵게 하는 장치 */}
      <div className="card" style={{ padding: 18, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <p style={{ fontSize: 14, fontWeight: 800 }}>입장 비밀번호</p>
          <button onClick={() => setPasswordEnabled(v => !v)}
            style={{
              width: 44, height: 26, borderRadius: 999, cursor: 'pointer', position: 'relative', flexShrink: 0,
              background: passwordEnabled ? 'var(--accent)' : 'var(--card2)', border: '1px solid var(--border)',
            }}>
            <span style={{
              position: 'absolute', top: 2, left: passwordEnabled ? 20 : 2, width: 20, height: 20, borderRadius: '50%',
              background: '#fff', transition: 'left 0.15s',
            }} />
          </button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted2)', marginBottom: passwordEnabled ? 14 : 0 }}>
          켜두면 매일 원하는 비밀번호로 바꿔서 QR 도용을 막을 수 있어요 (한글/영문/특수문자 모두 가능)
        </p>
        {passwordEnabled && (
          <input className="input" value={password} onChange={e => setPassword(e.target.value)} maxLength={30} placeholder="오늘의 입장 비밀번호" />
        )}
      </div>

      <div style={{ height: 1, background: 'var(--border)', margin: '0 0 24px' }} />

      <div style={section}>
        <label style={label}>매장 이름</label>
        <input className="input" value={name} onChange={e => setName(e.target.value)} maxLength={30} placeholder="예: 별빛포차 강남점" />
      </div>

      <div style={section}>
        <label style={label}>분류</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {CATEGORIES.map(c => (
            <button key={c.value} onClick={() => setCategory(c.value)}
              style={{
                padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                background: category === c.value ? 'var(--accent)' : 'var(--card2)',
                border: '1px solid var(--border)', color: category === c.value ? '#fff' : 'var(--muted2)',
              }}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div style={section}>
        <label style={label}>대표 컬러</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {PRESET_COLORS.map(c => (
            <button key={c} onClick={() => setPrimaryColor(c)}
              style={{
                width: 36, height: 36, borderRadius: 10, background: c, cursor: 'pointer',
                border: primaryColor === c ? '3px solid var(--text)' : '1px solid var(--border)',
              }} />
          ))}
        </div>
      </div>

      <div style={section}>
        <label style={label}>로고 이미지 URL (선택)</label>
        <input className="input" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://..." />
      </div>

      <div style={section}>
        <label style={label}>대표 이미지 URL (선택)</label>
        <input className="input" value={heroUrl} onChange={e => setHeroUrl(e.target.value)} placeholder="https://..." />
      </div>

      <div style={section}>
        <label style={label}>주소 (선택)</label>
        <input className="input" value={address} onChange={e => setAddress(e.target.value)} placeholder="예: 서울 강남구 ..." />
      </div>

      <div style={{ height: 1, background: 'var(--border)', margin: '8px 0 24px' }} />

      <p style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>리뷰 링크</p>
      <p style={{ fontSize: 12, color: 'var(--muted2)', marginBottom: 16 }}>손님이 방을 나갈 때 리뷰 유도 버튼으로 노출됩니다</p>

      <div style={section}>
        <label style={label}>네이버 리뷰 URL</label>
        <input className="input" value={naverUrl} onChange={e => setNaverUrl(e.target.value)} placeholder="https://..." />
      </div>

      <div style={section}>
        <label style={label}>구글 리뷰 URL (선택)</label>
        <input className="input" value={googleUrl} onChange={e => setGoogleUrl(e.target.value)} placeholder="https://..." />
      </div>

      <div style={section}>
        <label style={label}>카카오 리뷰 URL (선택)</label>
        <input className="input" value={kakaoUrl} onChange={e => setKakaoUrl(e.target.value)} placeholder="https://..." />
      </div>

      <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 448, padding: '16px 20px 32px', background: 'linear-gradient(0deg,var(--bg) 60%,transparent)' }}>
        {saveError && <p style={{ fontSize: 12, color: '#ff6b6b', textAlign: 'center', marginBottom: 8 }}>{saveError}</p>}
        {savedAt && <p style={{ fontSize: 12, color: '#10b981', textAlign: 'center', marginBottom: 8 }}>✓ 저장되었습니다</p>}
        <button className="btn btn-primary" onClick={handleSave} disabled={saving || !name.trim()}
          style={{ fontSize: 16, opacity: saving || !name.trim() ? 0.5 : 1 }}>
          {saving ? '저장 중...' : '설정 저장'}
        </button>
      </div>
    </main>
  )
}
