'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { getSessionToken, storeRoomData } from '@/lib/session'
import { Venue, VenueCategory } from '@/lib/supabase/types'
import BackButton from '@/components/BackButton'
import LoadingScreen from '@/components/LoadingScreen'
import ErrorScreen from '@/components/ErrorScreen'
import PageEyebrowHeader from '@/components/PageEyebrowHeader'
import Toggle from '@/components/Toggle'
import InlineMessage from '@/components/InlineMessage'
import Icon from '@/components/Icon'
import { NavRow, NavRowGroup } from '@/components/NavRow'
import SectionGroup from '@/components/SectionGroup'
import { GAP, TYPE, ICON, RADIUS, SEMANTIC } from '@/lib/design'

interface Session {
  id: string
  code?: string
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

  // 편집 필드 — 매장 이름(name)은 편집 대상이 아니다 (BUSINESS_RULES.md §2.2 "매장명 변경
  // 금지" — 등록 후 고정, 향후 매장 실재 검증의 판정 근거가 된다). 세션(오늘 영업) 이름은
  // 아래 roomNameInput으로 별도 관리한다.
  const [category, setCategory] = useState<VenueCategory>('etc')
  const [address, setAddress] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [heroUrl, setHeroUrl] = useState('')
  const [description, setDescription] = useState('')
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

  // 요일별 영업시간 설정 여부 (Phase 5.5) — 7일 전부 설정돼야 "영업 시작"이 가능하다.
  const [hoursConfigured, setHoursConfigured] = useState<boolean | null>(null)

  useEffect(() => {
    fetch(`/api/venues/${id}`)
      .then(res => res.json())
      .then(data => {
        if (!data.venue || !data.isOwner) {
          setLoadError('이 매장의 운영자만 설정을 볼 수 있습니다')
          return
        }
        const v: Venue = data.venue
        setVenue(v)
        setCategory(v.category ?? 'etc')
        setAddress(v.address ?? '')
        setLogoUrl(v.logo_url ?? '')
        setHeroUrl(v.hero_image_url ?? '')
        setDescription(v.description ?? '')
        setPrimaryColor(v.primary_color ?? '#667eea')
        setNaverUrl(v.naver_review_url ?? '')
        setGoogleUrl(v.google_review_url ?? '')
        setKakaoUrl(v.kakao_review_url ?? '')
        setPasswordEnabled(v.join_password_enabled ?? false)
        setPassword(v.join_password ?? '')
      })
      .catch(() => setLoadError('매장 정보를 불러오지 못했습니다'))

    fetch(`/api/venues/${id}/session`)
      .then(res => res.json())
      .then(data => setSession(data.session ?? null))
      .catch(() => {})
      .finally(() => setSessionLoaded(true))

    fetch(`/api/venues/${id}/business-hours`)
      .then(res => res.json())
      .then(data => setHoursConfigured((data.hours ?? []).length === 7))
      .catch(() => setHoursConfigured(false))
  }, [id])

  const handleStartSession = async () => {
    setSessionBusy(true); setSessionError('')
    try {
      const res = await fetch(`/api/venues/${id}/session`, { method: 'POST' })
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
      const res = await fetch(`/api/venues/${id}/session`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSession(null)
    } catch (e) {
      setSessionError(e instanceof Error ? e.message : '영업 종료에 실패했습니다')
    } finally {
      setSessionBusy(false)
    }
  }

  // 오늘 세션(오늘 영업) 이름 변경 — 매장 이름과 달리 그날그날 자유롭게 바꿀 수 있다
  // (BUSINESS_RULES.md §2.2 "매장명 변경 금지" 대신 도입된 대안).
  const [roomNameInput, setRoomNameInput] = useState('')
  const [roomNameSaving, setRoomNameSaving] = useState(false)
  const [roomNameSavedAt, setRoomNameSavedAt] = useState<number | null>(null)
  const [roomNameError, setRoomNameError] = useState('')

  useEffect(() => {
    setRoomNameInput(session?.name ?? '')
  }, [session?.name])

  const handleSaveRoomName = async () => {
    if (!session?.code || !roomNameInput.trim()) return
    setRoomNameSaving(true); setRoomNameError(''); setRoomNameSavedAt(null)
    try {
      const res = await fetch(`/api/rooms/${session.code}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: roomNameInput.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSession(prev => (prev ? { ...prev, name: data.room.name } : prev))
      setRoomNameSavedAt(Date.now())
    } catch (e) {
      setRoomNameError(e instanceof Error ? e.message : '이름 변경에 실패했습니다')
    } finally {
      setRoomNameSaving(false)
    }
  }

  // 운영자가 손님과 같은 방 화면(반응/HOT/채팅/자리배치)을 그대로 보고 싶을 때 쓴다.
  // 비밀번호/위치 검사 없이 host_session 일치만으로 "사장님" 닉네임 참여자로 등록된다.
  const [enteringRoom, setEnteringRoom] = useState(false)
  const handleEnterRoom = async () => {
    if (!session?.code) return
    setEnteringRoom(true)
    setSessionError('')
    try {
      const res = await fetch(`/api/rooms/${session.code}/operator-join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_token: getSessionToken() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      storeRoomData({
        roomId: data.room.id, roomCode: data.room.code, roomName: data.room.name,
        participantId: data.participant.id, nickname: data.participant.nickname,
      })
      router.push(`/room/${data.room.code}`)
    } catch (e) {
      setSessionError(e instanceof Error ? e.message : '방 화면 입장에 실패했습니다')
    } finally {
      setEnteringRoom(false)
    }
  }

  const handleSave = async () => {
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
          category,
          address: address.trim() || null,
          logo_url: logoUrl.trim() || null,
          hero_image_url: heroUrl.trim() || null,
          description: description.trim() || null,
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
    return <ErrorScreen message={loadError} />
  }

  if (!venue) {
    return <LoadingScreen />
  }

  // 폼 라벨/필드 간격을 토큰으로 통일 (ADR-0009). 라벨과 입력칸은 한 덩어리라 GAP.snug로
  // 붙이고, 필드와 필드 사이는 GAP.loose로 띄운다 — 이전엔 둘 다 8/24로 잡혀 있어서 "라벨이
  // 어느 입력칸의 것인지"가 애매했다(근접성).
  const label = { ...TYPE.eyebrow, display: 'block' as const, marginBottom: GAP.snug }
  const field = { marginBottom: GAP.loose }
  const appUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const venueJoinUrl = `${appUrl}/v/${id}`
  const isOpen = session?.status === 'active'

  return (
    <main className="flex flex-col min-h-dvh px-6" style={{ paddingTop: 56, paddingBottom: 120 }}>
      <BackButton onClick={() => router.back()} />

      <PageEyebrowHeader
        eyebrow="OPERATOR"
        title="매장 설정"
        subtitle="브랜딩과 리뷰 링크를 설정하세요"
        marginBottom={28} titleSize={26} titleLineHeight={1.2} subtitleSize={14} subtitleMarginTop={4}
      />

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
            {venue.name[0] ?? <Icon name="storefront" size={ICON.row} />}
          </div>
        )}
        <div>
          <p style={{ fontSize: 16, fontWeight: 800 }}>{venue.name}</p>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>손님에게 이렇게 보여요</p>
        </div>
      </div>

      {/* 영업시간 미설정 안내 — Phase 5.5: 자동 마감의 유일한 판단 근거라 설정 전엔
          영업 시작 자체가 API에서도 막힌다. 여기서 미리 안내하고 바로 이동시킨다. */}
      {hoursConfigured === false && (
        <div style={{
          border: `1.5px solid ${SEMANTIC.warning}66`, borderRadius: RADIUS.group,
          marginBottom: GAP.loose, overflow: 'hidden',
        }}>
          <NavRow icon="schedule" tone={SEMANTIC.warning}
            title="영업시간을 먼저 설정해주세요"
            description="영업 시작을 하려면 요일별 영업시간이 필요해요"
            onClick={() => router.push(`/operator/settings/${id}/hours`)} />
        </div>
      )}

      {/* 영업 시작/종료 — 방을 매번 새로 만들지 않고, 등록된 매장에서 오늘 세션만 여닫는다 */}
      <SectionGroup title="오늘 영업">
      <div className="card" style={{ padding: 18 }}>
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
        <p style={{ fontSize: 12, color: 'var(--muted2)', marginBottom: isOpen ? 10 : 14 }}>
          {isOpen ? '손님이 QR로 바로 입장할 수 있어요' : '오늘 영업을 시작하면 QR로 손님이 입장할 수 있어요'}
        </p>
        {isOpen && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted2)', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>오늘 세션 이름</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" value={roomNameInput} onChange={e => setRoomNameInput(e.target.value)} maxLength={40} style={{ flex: 1 }} />
              <button
                className="btn btn-secondary"
                onClick={handleSaveRoomName}
                disabled={roomNameSaving || !roomNameInput.trim() || roomNameInput.trim() === session?.name}
                // .btn에 width:100%가 있어서 flex 행 안에서 이 버튼이 입력칸을 밀어내고
                // 있었다 (ADR-0009에서 발견) — width:auto + flexShrink:0으로 고정한다.
                style={{ minHeight: 'auto', padding: '0 14px', width: 'auto', flexShrink: 0, opacity: roomNameSaving || !roomNameInput.trim() || roomNameInput.trim() === session?.name ? 0.5 : 1 }}>
                {roomNameSaving ? '저장 중...' : '변경'}
              </button>
            </div>
            {roomNameError && <p style={{ fontSize: 11, color: '#ff6b6b', marginTop: 6 }}>{roomNameError}</p>}
            {roomNameSavedAt && <InlineMessage type="success" fontSize={11} style={{ marginTop: 6 }}>변경되었습니다</InlineMessage>}
          </div>
        )}
        {sessionError && <p style={{ fontSize: 12, color: '#ff6b6b', marginBottom: 10 }}>{sessionError}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={isOpen ? 'btn btn-secondary' : 'btn btn-primary'}
            onClick={isOpen ? handleEndSession : handleStartSession}
            disabled={!sessionLoaded || sessionBusy || (!isOpen && hoursConfigured === false)}
            style={{ flex: 1, opacity: !sessionLoaded || sessionBusy || (!isOpen && hoursConfigured === false) ? 0.5 : 1, fontSize: 15 }}>
            {sessionBusy ? '처리 중...' : isOpen ? '오늘 영업 종료' : '오늘 영업 시작'}
          </button>
          {isOpen && (
            <button
              className="btn btn-secondary"
              onClick={handleEnterRoom}
              disabled={enteringRoom}
              style={{ flex: 1, opacity: enteringRoom ? 0.5 : 1, fontSize: 15, gap: GAP.tight + 2 }}>
              {enteringRoom ? '입장 중...' : <><Icon name="visibility" size={ICON.row} /> 방 화면 보기</>}
            </button>
          )}
        </div>
      </div>
      </SectionGroup>

      {/* 다른 화면으로 가는 메뉴 4개 — 이전엔 각각 독립 카드로 16px 떨어져 떠 있어서, 위의
          "영업 상태"(여기서 조작하는 카드)와 시각적으로 구분되지 않았다. 하나의 공동 영역 안에
          구분선으로만 나눠 "이건 메뉴 목록"으로 읽히게 했다 (ADR-0009). */}
      <SectionGroup title="매장 관리">
        <NavRowGroup>
          <NavRow icon="schedule" title="영업시간 설정"
            description="요일별 영업시간, 24시간/정기휴무, 라스트오더"
            onClick={() => router.push(`/operator/settings/${id}/hours`)} />
          <NavRow icon="crop_square" title="좌석 관리"
            description="드래그로 매장 구조에 맞게 좌석 배치"
            onClick={() => router.push(`/operator/settings/${id}/seats`)} />
          <NavRow icon="person" title="직원 명부"
            description="직원 추가/삭제 — 교대는 방 화면에서 처리해요"
            onClick={() => router.push(`/operator/settings/${id}/staff`)} />
          <NavRow icon="bar_chart" title="운영 리포트"
            description="지난 영업일 추이, 베스트 데이, 재방문 손님"
            onClick={() => router.push(`/operator/settings/${id}/dashboard`)} />
        </NavRowGroup>
      </SectionGroup>

      {/* 고정 QR — 한 번 등록하면 바뀌지 않음. 방 코드는 별도로 노출하지 않는다
          (BUSINESS_RULES.md §2.2, Discovery 도메인과 동일하게 코드/QR 절대 미표시 원칙) */}
      <SectionGroup title="손님 입장" description="QR과 비밀번호는 함께 작동해요 — QR이 유출돼도 비밀번호로 막을 수 있어요">
      <div className="card" style={{ padding: 18, marginBottom: GAP.base, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <p style={{ fontSize: 14, fontWeight: 800, marginBottom: 4, alignSelf: 'flex-start' }}>매장 고정 QR</p>
        <p style={{ fontSize: 12, color: 'var(--muted2)', marginBottom: 16, alignSelf: 'flex-start' }}>출력해서 매장에 붙여두세요. 이 QR은 바뀌지 않아요</p>
        <div style={{ padding: 16, borderRadius: 20, background: '#fff', marginBottom: 12 }}>
          <QRCodeSVG value={venueJoinUrl} size={160} />
        </div>
        <button className="btn btn-secondary" onClick={() => navigator.clipboard.writeText(venueJoinUrl)} style={{ fontSize: 14 }}>
          <Icon name="link" size={ICON.row} /> 링크 복사하기
        </button>
      </div>

      {/* 입장 비밀번호 — 고정 QR이 촬영/유출돼도 매장 밖에서 남용하기 어렵게 하는 장치.
          QR과 한 그룹에 둔다 — 둘은 "손님이 들어오는 문"이라는 하나의 주제다(공동 영역). */}
      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <p style={{ fontSize: 14, fontWeight: 800 }}>입장 비밀번호</p>
          <Toggle checked={passwordEnabled} onChange={setPasswordEnabled} ariaLabel="입장 비밀번호 사용" />
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted2)', marginBottom: passwordEnabled ? 14 : 0 }}>
          켜두면 매일 원하는 비밀번호로 바꿔서 QR 도용을 막을 수 있어요 (한글/영문/특수문자 모두 가능)
        </p>
        {passwordEnabled && (
          <input className="input" value={password} onChange={e => setPassword(e.target.value)} maxLength={30} placeholder="오늘의 입장 비밀번호" />
        )}
      </div>
      </SectionGroup>

      {/* 매장 자체를 규정하는 값들(이름/분류/주소)을 한 그룹으로. 아래 "브랜딩"(보이는 방식)과
          구분된다 — 이전엔 이름·분류·컬러·로고·주소·소개가 한 줄기로 죽 나열돼 있어서
          "바꿀 수 없는 사실"과 "취향껏 바꾸는 꾸밈"이 같은 무게로 보였다 (ADR-0009). */}
      <SectionGroup title="매장 정보">
      <div style={field}>
        <label style={label}>매장 이름</label>
        <div className="card-sm" style={{ padding: '12px 14px', fontSize: 14, fontWeight: 700 }}>{venue.name}</div>
        <p style={{ ...TYPE.caption, fontSize: 11, marginTop: 6 }}>
          등록 후에는 매장 이름을 바꿀 수 없어요. 오늘만 다르게 보이고 싶다면 위 영업 상태의 &quot;오늘 세션 이름&quot;을 바꿔주세요
        </p>
      </div>

      <div style={field}>
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

      <div style={field}>
        <label style={label}>주소 (선택)</label>
        <input className="input" value={address} onChange={e => setAddress(e.target.value)} placeholder="예: 서울 강남구 ..." />
      </div>
      </SectionGroup>

      {/* 손님에게 "어떻게 보이는지"에만 관여하는 값들 */}
      <SectionGroup title="브랜딩" description="손님 화면에 이 매장이 어떻게 보일지 정해요">
      <div style={field}>
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

      <div style={field}>
        <label style={label}>로고 이미지 URL (선택)</label>
        <input className="input" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://..." />
      </div>

      <div style={field}>
        <label style={label}>대표 이미지 URL (선택)</label>
        <input className="input" value={heroUrl} onChange={e => setHeroUrl(e.target.value)} placeholder="https://..." />
      </div>

      {/* 매장 소개 — 방 화면(손님)의 "소개" 블록에 그대로 노출된다 (Phase 9) */}
      <div style={field}>
        <label style={label}>매장 소개 (선택)</label>
        <textarea className="input" value={description} onChange={e => setDescription(e.target.value.slice(0, 200))}
          rows={3} maxLength={200} placeholder="예: 육회가 맛있는 우리 동네 노포"
          style={{ resize: 'none' }} />
        <p style={{ ...TYPE.caption, fontSize: 11, marginTop: 6 }}>
          손님 방 화면의 “소개”에 표시돼요 ({description.length}/200)
        </p>
      </div>
      </SectionGroup>

      {/* 리뷰 링크 3개는 같은 종류의 입력이라 한 그룹. 제목/설명은 SectionGroup이 그린다 —
          이전엔 구분선 + 제목 + 설명을 손으로 그려서 다른 그룹들과 모양이 달랐다. */}
      <SectionGroup title="리뷰 링크" description="손님이 방을 나갈 때 리뷰 유도 버튼으로 노출됩니다">
      <div style={field}>
        <label style={label}>네이버 리뷰 URL</label>
        <input className="input" value={naverUrl} onChange={e => setNaverUrl(e.target.value)} placeholder="https://..." />
      </div>

      <div style={field}>
        <label style={label}>구글 리뷰 URL (선택)</label>
        <input className="input" value={googleUrl} onChange={e => setGoogleUrl(e.target.value)} placeholder="https://..." />
      </div>

      <div style={{ ...field, marginBottom: 0 }}>
        <label style={label}>카카오 리뷰 URL (선택)</label>
        <input className="input" value={kakaoUrl} onChange={e => setKakaoUrl(e.target.value)} placeholder="https://..." />
      </div>
      </SectionGroup>

      <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 448, padding: '16px 20px 32px', background: 'linear-gradient(0deg,var(--bg) 60%,transparent)' }}>
        {saveError && <InlineMessage type="error" style={{ justifyContent: 'center', marginBottom: 8 }}>{saveError}</InlineMessage>}
        {savedAt && <InlineMessage type="success" style={{ justifyContent: 'center', marginBottom: 8 }}>저장되었습니다</InlineMessage>}
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}
          style={{ fontSize: 16, opacity: saving ? 0.5 : 1 }}>
          {saving ? '저장 중...' : '설정 저장'}
        </button>
      </div>
    </main>
  )
}
