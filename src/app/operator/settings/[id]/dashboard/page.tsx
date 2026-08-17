'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { OperatorDashboard, DashboardBestDay } from '@/lib/supabase/types'
import TrendLine from '@/components/TrendLine'
import WeekdayBars from '@/components/WeekdayBars'
import BackButton from '@/components/BackButton'
import LoadingScreen from '@/components/LoadingScreen'
import ErrorScreen from '@/components/ErrorScreen'
import PageEyebrowHeader from '@/components/PageEyebrowHeader'
import Icon, { IconName } from '@/components/Icon'
import { GAP, ICON } from '@/lib/design'

function fmtShortDate(iso: string) {
  const [, m, d] = iso.split('-')
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`
}

const STAT_LABEL = { fontSize: 10, color: 'var(--muted2)', marginTop: 4 } as const
const STAT_VALUE = { fontSize: 20, fontWeight: 800 } as const
const SECTION_TITLE = { fontSize: 14, fontWeight: 800, marginBottom: 4 } as const
const SECTION_SUB = { fontSize: 11, color: 'var(--muted2)', marginBottom: 14 } as const

// 운영자 대시보드 — "지난 영업일들의 운영 데이터"를 인스타그램/유튜브 크리에이터 스튜디오
// 같은 형태로 보여준다 (Operator Analytics 도메인, BUSINESS_RULES.md §2.10 "Phase 5").
// 새로운 트래킹을 추가하지 않고, 이미 있는 rooms/participants/reactions/operator_alerts만
// get_operator_dashboard() RPC 한 번으로 집계해서 받는다.
export default function OperatorDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [venueName, setVenueName] = useState('')
  const [loadError, setLoadError] = useState('')
  const [dashboard, setDashboard] = useState<OperatorDashboard | null>(null)

  useEffect(() => {
    fetch(`/api/venues/${id}`)
      .then(res => res.json())
      .then(data => {
        if (!data.venue || !data.isOwner) {
          setLoadError('이 매장의 운영자만 운영 리포트를 볼 수 있습니다')
          return
        }
        setVenueName(data.venue.name)
      })
      .catch(() => setLoadError('매장 정보를 불러오지 못했습니다'))

    fetch(`/api/venues/${id}/dashboard`)
      .then(res => res.json())
      .then(data => setDashboard(data.dashboard ?? null))
      .catch(() => setLoadError('운영 리포트를 불러오지 못했습니다'))
  }, [id])

  if (loadError) {
    return <ErrorScreen message={loadError} />
  }

  if (!dashboard) {
    return <LoadingScreen />
  }

  const guestSeries = dashboard.daily.map(d => ({ date: d.date, value: d.guest_count, events: d.events }))
  const starSeries = dashboard.daily.map(d => ({ date: d.date, value: d.avg_star, events: d.events }))
  const hotSeries = dashboard.daily.map(d => ({ date: d.date, value: d.hot_density, events: d.events }))

  const rankings: { title: string; items: DashboardBestDay[]; valueKey: 'hot_density' | 'avg_star' | 'guest_count'; unit: string; icon: IconName }[] = [
    { title: 'HOT 밀도', items: dashboard.best_by_hot_density, valueKey: 'hot_density', unit: '', icon: 'local_fire_department' },
    { title: '평균 만족도', items: dashboard.best_by_star, valueKey: 'avg_star', unit: '점', icon: 'star' },
    { title: '참여자 수', items: dashboard.best_by_guests, valueKey: 'guest_count', unit: '명', icon: 'group' },
  ]

  return (
    <main className="flex flex-col min-h-dvh px-6" style={{ paddingTop: 56, paddingBottom: 60 }}>
      <BackButton onClick={() => router.back()} />

      <PageEyebrowHeader
        eyebrow="OPERATOR"
        title={`${venueName} 운영 리포트`}
        subtitle="지난 영업일들의 데이터를 모아봤어요"
        marginBottom={24} titleSize={24} subtitleSize={12}
      />

      {dashboard.total_sessions === 0 ? (
        <div className="card" style={{ padding: 24, textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 4 }}>아직 마감된 영업일이 없어요</p>
          <p style={{ fontSize: 12, color: 'var(--muted2)' }}>영업을 시작하고 마감하면 여기에 리포트가 쌓여요</p>
        </div>
      ) : (
        <>
          {/* 개요 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 24 }}>
            <div className="card" style={{ padding: '14px 8px', textAlign: 'center' }}>
              <div style={STAT_VALUE}>{dashboard.total_sessions}</div>
              <div style={STAT_LABEL}>총 영업일수</div>
            </div>
            <div className="card" style={{ padding: '14px 8px', textAlign: 'center' }}>
              <div style={STAT_VALUE}>{dashboard.total_guest_visits}</div>
              <div style={STAT_LABEL}>누적 방문</div>
            </div>
            <div className="card" style={{ padding: '14px 8px', textAlign: 'center' }}>
              <div style={{ ...STAT_VALUE, color: '#10b981' }}>{dashboard.returning_guest_count}</div>
              <div style={STAT_LABEL}>재방문 손님</div>
            </div>
            <div className="card" style={{ padding: '14px 8px', textAlign: 'center' }}>
              <div style={STAT_VALUE}>{dashboard.avg_guests_per_session ?? '-'}</div>
              <div style={STAT_LABEL}>평균 참여자/일</div>
            </div>
            <div className="card" style={{ padding: '14px 8px', textAlign: 'center' }}>
              <div style={{ ...STAT_VALUE, color: '#fbbf24' }}>{dashboard.avg_star ?? '-'}</div>
              <div style={STAT_LABEL}>평균 만족도</div>
            </div>
            <div className="card" style={{ padding: '14px 8px', textAlign: 'center' }}>
              <div style={{ ...STAT_VALUE, color: '#f97316' }}>{dashboard.avg_hot_density ?? '-'}</div>
              <div style={STAT_LABEL}>평균 HOT 밀도</div>
            </div>
          </div>

          {/* 일별 추이 */}
          <div className="card" style={{ padding: 18, marginBottom: 16 }}>
            <p style={SECTION_TITLE}>참여자 수 추이</p>
            <p style={SECTION_SUB}>최근 90일 · 영업일당 손님 수</p>
            <TrendLine data={guestSeries} color="#ff6b6b" formatDate={fmtShortDate} formatValue={v => `${v}명`} />
          </div>

          <div className="card" style={{ padding: 18, marginBottom: 16 }}>
            <p style={SECTION_TITLE}>평균 만족도 추이</p>
            <p style={SECTION_SUB}>최근 90일 · 별점 평균, 0~5점</p>
            <TrendLine data={starSeries} color="#fbbf24" formatDate={fmtShortDate} formatValue={v => v.toFixed(1)} />
          </div>

          <div className="card" style={{ padding: 18, marginBottom: 16 }}>
            <p style={SECTION_TITLE}>HOT 밀도 추이</p>
            <p style={SECTION_SUB}>최근 90일 · 손님 1인당 HOT 탭 수 (방 화면 실시간 HOT %와는 다른 지표예요)</p>
            <TrendLine data={hotSeries} color="#f97316" formatDate={fmtShortDate} formatValue={v => v.toFixed(1)} />
          </div>

          {/* 요일별 패턴 */}
          <div className="card" style={{ padding: 18, marginBottom: 16 }}>
            <p style={SECTION_TITLE}>요일별 평균 참여자 수</p>
            <p style={SECTION_SUB}>전체 기간 기준 · 어느 요일에 제일 잘 되는지 한눈에</p>
            <WeekdayBars data={dashboard.weekday_pattern} color="#ff6b6b" />
          </div>

          {/* 베스트 영업일 */}
          <div style={{ marginBottom: 8 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted2)', marginBottom: 12 }}>베스트 영업일 (전체 기간)</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {rankings.map(({ title, items, valueKey, unit, icon }) => (
              <div key={title} className="card" style={{ padding: 16 }}>
                <p style={{ fontSize: 13, fontWeight: 800, marginBottom: 10, display: 'flex', alignItems: 'center', gap: GAP.tight + 2 }}>
                  <span style={{ color: 'var(--muted2)', display: 'flex' }}><Icon name={icon} size={ICON.inline} /></span>
                  {title} Top {items.length || 0}
                </p>
                {items.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--muted2)' }}>데이터가 아직 없어요</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.map((it, idx) => (
                      <div key={it.room_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted2)', width: 16 }}>{idx + 1}</span>
                        <span style={{ flex: 1, fontSize: 13, color: 'var(--text2)' }}>{it.name} · {fmtShortDate(it.date)}</span>
                        <span style={{ fontSize: 13, fontWeight: 800 }}>{it[valueKey]}{unit}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  )
}
