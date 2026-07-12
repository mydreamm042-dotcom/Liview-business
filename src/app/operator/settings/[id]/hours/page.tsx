'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { BusinessHoursDay, normalizeDay, validateDay, WEEKDAY_LABELS } from '@/lib/businessHours'

// 월~일 순서로 보여주되(사용자 표시 관례), 내부 weekday 값은 DB/대시보드와 동일하게
// 0=일요일 ... 6=토요일을 그대로 쓴다 (Postgres extract(dow)와 맞춤).
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

function defaultDay(weekday: number): BusinessHoursDay {
  return { weekday, is_closed: false, is_24h: false, open_time: '18:00', close_time: '02:00', last_order_time: null }
}

// 운영자 요일별 영업시간 설정 (Venue 도메인 확장, BUSINESS_RULES.md §2.2 "요일별 영업시간",
// Phase 5.5). 이 설정은 "영업 시작" 자체의 필수 조건이자, 운영자가 종료 버튼을 안 눌러도
// 시스템이 마감시간+1시간 후 자동으로 정리하는 유일한 판단 근거다.
export default function BusinessHoursPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [venueName, setVenueName] = useState('')
  const [loadError, setLoadError] = useState('')
  const [days, setDays] = useState<BusinessHoursDay[] | null>(null)
  const [applyToAll, setApplyToAll] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => {
    fetch(`/api/venues/${id}`)
      .then(res => res.json())
      .then(data => {
        if (!data.venue || !data.isOwner) {
          setLoadError('이 매장의 운영자만 영업시간을 설정할 수 있습니다')
          return
        }
        setVenueName(data.venue.name)
      })
      .catch(() => setLoadError('매장 정보를 불러오지 못했습니다'))

    fetch(`/api/venues/${id}/business-hours`)
      .then(res => res.json())
      .then(data => {
        const hours: BusinessHoursDay[] = data.hours ?? []
        if (hours.length === 7) {
          setDays([...hours].sort((a, b) => a.weekday - b.weekday))
        } else {
          setDays(Array.from({ length: 7 }, (_, w) => defaultDay(w)))
        }
      })
      .catch(() => setDays(Array.from({ length: 7 }, (_, w) => defaultDay(w))))
  }, [id])

  const updateDay = (weekday: number, patch: Partial<BusinessHoursDay>) => {
    setDays(prev => {
      if (!prev) return prev
      const next = prev.map(d => (d.weekday === weekday ? { ...d, ...patch } : d))
      if (applyToAll) {
        const source = next.find(d => d.weekday === weekday)!
        return next.map(d => ({ ...source, weekday: d.weekday }))
      }
      return next
    })
  }

  const handleToggleApplyAll = (checked: boolean) => {
    setApplyToAll(checked)
    if (checked && days) {
      // 켜는 순간, 화면 첫 줄(월요일)의 현재 값을 기준으로 나머지 요일을 즉시 맞춘다.
      const source = days.find(d => d.weekday === 1) ?? days[0]
      setDays(days.map(d => ({ ...source, weekday: d.weekday })))
    }
  }

  const handleSave = async () => {
    if (!days) return
    setSaveError(''); setSavedAt(null)

    const normalized = days.map(normalizeDay)
    for (const day of normalized) {
      const err = validateDay(day)
      if (err) { setSaveError(err); return }
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/venues/${id}/business-hours`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours: normalized }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDays(normalized)
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
        <button className="btn btn-primary" onClick={() => router.push('/operator/login')} style={{ marginTop: 16 }}>로그인하러 가기</button>
        <button className="btn btn-ghost" onClick={() => router.push('/')} style={{ marginTop: 8 }}>홈으로</button>
      </main>
    )
  }

  if (!days) {
    return <main className="flex min-h-dvh items-center justify-center"><p style={{ color: 'var(--muted2)' }}>불러오는 중...</p></main>
  }

  const rowsToShow = applyToAll ? [days.find(d => d.weekday === 1) ?? days[0]] : DISPLAY_ORDER.map(w => days.find(d => d.weekday === w)!)

  return (
    <main className="flex flex-col min-h-dvh px-6" style={{ paddingTop: 56, paddingBottom: 120 }}>
      <button onClick={() => router.back()}
        style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--card2)', border: '1px solid var(--border)', color: 'var(--text2)', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginBottom: 24 }}>
        ←
      </button>

      <div style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700, marginBottom: 6, letterSpacing: '0.05em' }}>OPERATOR</p>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>{venueName} 영업시간</h1>
        <p style={{ fontSize: 12, color: 'var(--muted2)', marginTop: 6 }}>
          영업 시작에 꼭 필요해요 — 여기 설정한 종료 시간+1시간이 지나면, 종료 버튼을 못 눌러도 시스템이 자동으로 마감해줘요
        </p>
      </div>

      <div className="card-sm" style={{ padding: '14px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>모든 요일 동일하게 적용</span>
        <button onClick={() => handleToggleApplyAll(!applyToAll)}
          style={{
            width: 44, height: 26, borderRadius: 999, cursor: 'pointer', position: 'relative', flexShrink: 0,
            background: applyToAll ? 'var(--accent)' : 'var(--card2)', border: '1px solid var(--border)',
          }}>
          <span style={{
            position: 'absolute', top: 2, left: applyToAll ? 20 : 2, width: 20, height: 20, borderRadius: '50%',
            background: '#fff', transition: 'left 0.15s',
          }} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
        {rowsToShow.map(day => {
          const timeDisabled = day.is_closed || day.is_24h
          return (
            <div key={day.weekday} className="card" style={{ padding: 16, opacity: day.is_closed ? 0.6 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <p style={{ fontSize: 14, fontWeight: 800 }}>
                  {applyToAll ? '전체 요일' : `${WEEKDAY_LABELS[day.weekday]}요일`}
                </p>
                <div style={{ display: 'flex', gap: 14 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={day.is_24h} disabled={day.is_closed}
                      onChange={e => updateDay(day.weekday, { is_24h: e.target.checked })} />
                    24시간
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={day.is_closed}
                      onChange={e => updateDay(day.weekday, { is_closed: e.target.checked })} />
                    정기휴무
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 10, opacity: timeDisabled ? 0.4 : 1 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, color: 'var(--muted2)', display: 'block', marginBottom: 4 }}>시작</label>
                  <input type="time" className="input" style={{ padding: '10px 12px', fontSize: 14 }}
                    value={day.is_24h ? '00:00' : day.open_time} disabled={timeDisabled}
                    onChange={e => updateDay(day.weekday, { open_time: e.target.value })} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, color: 'var(--muted2)', display: 'block', marginBottom: 4 }}>종료</label>
                  <input type="time" className="input" style={{ padding: '10px 12px', fontSize: 14 }}
                    value={day.is_24h ? '00:00' : day.close_time} disabled={timeDisabled}
                    onChange={e => updateDay(day.weekday, { close_time: e.target.value })} />
                </div>
              </div>

              <div style={{ opacity: day.is_closed ? 0.4 : 1 }}>
                <label style={{ fontSize: 10, color: 'var(--muted2)', display: 'block', marginBottom: 4 }}>라스트 오더 (선택)</label>
                <input type="time" className="input" style={{ padding: '10px 12px', fontSize: 14 }}
                  value={day.last_order_time ?? ''} disabled={day.is_closed}
                  onChange={e => updateDay(day.weekday, { last_order_time: e.target.value || null })} />
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 448, padding: '16px 20px 32px', background: 'linear-gradient(0deg,var(--bg) 60%,transparent)' }}>
        {saveError && <p style={{ fontSize: 12, color: '#ff6b6b', textAlign: 'center', marginBottom: 8 }}>{saveError}</p>}
        {savedAt && <p style={{ fontSize: 12, color: '#10b981', textAlign: 'center', marginBottom: 8 }}>✓ 저장되었습니다</p>}
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}
          style={{ fontSize: 16, opacity: saving ? 0.5 : 1 }}>
          {saving ? '저장 중...' : '영업시간 저장'}
        </button>
      </div>
    </main>
  )
}
