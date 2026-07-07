'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { getSessionToken } from '@/lib/session'
import { Venue, VenueCategory } from '@/lib/supabase/types'

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
      })
      .catch(() => setLoadError('매장 정보를 불러오지 못했습니다'))
  }, [id])

  const handleSave = async () => {
    if (!name.trim()) return
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
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSavedAt(Date.now())
    } catch {
      setLoadError('저장에 실패했습니다')
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
        {savedAt && <p style={{ fontSize: 12, color: '#10b981', textAlign: 'center', marginBottom: 8 }}>✓ 저장되었습니다</p>}
        <button className="btn btn-primary" onClick={handleSave} disabled={saving || !name.trim()}
          style={{ fontSize: 16, opacity: saving || !name.trim() ? 0.5 : 1 }}>
          {saving ? '저장 중...' : '설정 저장'}
        </button>
      </div>
    </main>
  )
}
