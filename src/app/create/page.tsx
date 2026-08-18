'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { VenueCategory } from '@/lib/supabase/types'
import BackButton from '@/components/BackButton'
import PageEyebrowHeader from '@/components/PageEyebrowHeader'
import LoadingScreen from '@/components/LoadingScreen'
import InlineMessage from '@/components/InlineMessage'
import Icon from '@/components/Icon'
import { GAP, ICON, SEMANTIC } from '@/lib/design'

const CATEGORIES: { value: VenueCategory; label: string }[] = [
  { value: 'pocha', label: '포차' },
  { value: 'bar', label: '바' },
  { value: 'pub', label: '펍' },
  { value: 'wine_bar', label: '와인바' },
  { value: 'cafe', label: '카페' },
  { value: 'event_hall', label: '행사장' },
  { value: 'etc', label: '기타' },
]

interface MyVenue {
  id: string
  name: string
  category: VenueCategory | null
}

// 매장 등록 화면. 이 앱은 B2B 전용 플랫폼이라(개인 모임 방 만들기는 별도 저장소의 데모
// 코드로 이전됨) 이 화면의 유일한 역할은 "매장 등록"이다 — 방은 "만드는" 게 아니라
// 매장을 한 번 등록해두고, 이후엔 설정 화면의 "오늘 영업 시작"으로 매일 세션을 연다
// (BUSINESS_RULES.md §2.1~2.2 — 고정 QR 모델).
export default function CreatePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [myVenues, setMyVenues] = useState<MyVenue[] | null>(null)
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null)
  const [newVenueName, setNewVenueName] = useState('')
  const [newVenueCategory, setNewVenueCategory] = useState<VenueCategory>('pocha')

  // 첫 진입 시 로그인 여부를 먼저 확인하고 내 매장 목록을 불러온다 (Operator 도메인
  // §2.11 — 매장 목록은 로그인 세션 기준이라, 비로그인이면 빈 목록 대신 로그인/회원가입
  // 유도 화면을 보여준다).
  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (!data.user) {
        setIsAuthed(false)
        setMyVenues([])
        return
      }
      setIsAuthed(true)
      fetch('/api/venues')
        .then(res => res.json())
        .then(data => setMyVenues(data.venues ?? []))
        .catch(() => setMyVenues([]))
    })
  }, [])

  const handleRegisterVenue = async () => {
    if (!newVenueName.trim()) { setError('매장 이름을 입력해주세요'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/venues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newVenueName.trim(),
          category: newVenueCategory,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      router.push(`/operator/settings/${data.venue.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다')
      setLoading(false)
    }
  }

  if (myVenues === null) {
    return <LoadingScreen label="매장 정보를 불러오는 중..." />
  }

  return (
    <main className="flex flex-col min-h-dvh px-6" style={{ paddingTop: 56, paddingBottom: 32 }}>
      <BackButton onClick={() => router.back()} marginBottom={32} />

      <PageEyebrowHeader
        className="animate-fade-in"
        eyebrow="MY VENUE"
        title="매장 관리"
        subtitle="매장은 한 번만 등록하면 고정 QR이 계속 유지돼요"
        marginBottom={28} titleSize={30} titleLineHeight={1.2} titleMarginBottom={8} subtitleSize={14} subtitleMarginTop={0}
      />

      <div style={{ flex: 1 }}>
        {isAuthed === false ? (
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16 }}>매장을 등록하거나 관리하려면 사장님 계정으로 로그인해주세요</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={() => router.push('/operator/login')} style={{ flex: 1, fontSize: 15 }}>로그인</button>
              <button className="btn btn-secondary" onClick={() => router.push('/operator/signup')} style={{ flex: 1, fontSize: 15 }}>회원가입</button>
            </div>
          </div>
        ) : myVenues.length > 0 ? (
          <>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted2)', letterSpacing: '0.05em', display: 'block', marginBottom: 10 }}>내 매장</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
              {myVenues.map(v => (
                <button key={v.id} onClick={() => router.push(`/operator/settings/${v.id}`)}
                  style={{
                    padding: '14px 16px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', fontSize: 14, fontWeight: 700,
                    background: 'var(--card2)', border: '1px solid var(--border)', color: 'var(--text2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                  <span>
                    {v.name}
                    {v.category && <span style={{ fontSize: 11, color: 'var(--muted2)', marginLeft: 8, fontWeight: 400 }}>{CATEGORIES.find(c => c.value === v.category)?.label}</span>}
                  </span>
                  <Icon name="chevron_right" size={ICON.row} style={{ color: 'var(--muted)' }} />
                </button>
              ))}
            </div>
          </>
        ) : (
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted2)', letterSpacing: '0.05em', display: 'block', marginBottom: 10 }}>매장 이름</label>
            <input
              className="input"
              type="text"
              value={newVenueName}
              onChange={e => setNewVenueName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRegisterVenue()}
              placeholder="예: 별빛포차 강남점"
              maxLength={30}
              autoFocus
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {CATEGORIES.map(c => (
                <button key={c.value} onClick={() => setNewVenueCategory(c.value)}
                  style={{
                    padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                    background: newVenueCategory === c.value ? 'var(--accent)' : 'var(--card2)',
                    border: '1px solid var(--border)',
                    color: newVenueCategory === c.value ? '#fff' : 'var(--muted2)',
                  }}>
                  {c.label}
                </button>
              ))}
            </div>
            {error && <InlineMessage type="error" style={{ marginTop: 8 }}>{error}</InlineMessage>}
          </div>
        )}

        <div className="card" style={{ padding: 18, marginBottom: 24 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 12 }}>매장 등록하면 되는 것들</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {['한 번 등록하면 바뀌지 않는 고정 QR', '오늘 영업 시작/종료 버튼으로 매일 세션 관리', '입장 비밀번호 · 위치 반경 제한으로 QR 도용 방지', '마감 후에도 매장 이력 영구 보존'].map(t => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text2)' }}>
                <Icon name="check" size={ICON.inline} style={{ color: 'var(--accent)' }} />{t}
              </div>
            ))}
          </div>
        </div>

        {isAuthed && myVenues !== null && myVenues.length === 0 && (
          <button className="btn btn-primary" onClick={handleRegisterVenue} disabled={loading || !newVenueName.trim()}
            style={{ opacity: loading || !newVenueName.trim() ? 0.5 : 1, fontSize: 17 }}>
            {loading ? '등록 중...' : <><Icon name="storefront" size={ICON.row} /> 매장 등록하기</>}
          </button>
        )}
      </div>
    </main>
  )
}
