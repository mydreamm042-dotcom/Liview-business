'use client'

import { useState, useRef, PointerEvent as ReactPointerEvent } from 'react'

const VIEW_W = 300
const VIEW_H = 120
const PAD_TOP = 18
const PAD_BOTTOM = 22
const PLOT_H = VIEW_H - PAD_TOP - PAD_BOTTOM

export interface TrendPoint {
  date: string
  value: number
  // 그날 운영자가 남긴 운영 메모 (operation_events, Phase 6, BUSINESS_RULES.md §2.10
  // "이벤트 노출 위치"). 있으면 그 지점 위에 작은 마커를 그리고, 마우스 오버(데스크톱)/
  // 탭(모바일) 시 내용을 보여준다. 값 그래프 자체와는 무관한 부가 정보라 optional이다.
  events?: { content: string; created_at: string }[]
}

// 단일 지표 추이 라인 차트 (Operator Analytics 도메인, BUSINESS_RULES.md §2.10). 한 화면에
// 서로 다른 척도의 지표를 같이 놓지 않기 위해(참여자 수/평균 만족도/HOT 밀도), 지표마다
// 이 컴포넌트를 하나씩 따로 그린다 — 축을 공유하는 이중축 차트를 만들지 않는다.
// 단일 계열이라 범례는 없다(제목이 계열을 대신 알려준다). 눌러서 끄는 크로스헤어로 값을 본다.
export default function TrendLine({
  data, color, formatValue = (v: number) => String(v), formatDate = (d: string) => d, emptyLabel = '데이터가 아직 없어요',
}: {
  data: TrendPoint[]
  color: string
  formatValue?: (v: number) => string
  formatDate?: (d: string) => string
  emptyLabel?: string
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [activeEventIndex, setActiveEventIndex] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  if (data.length === 0) {
    return (
      <div style={{ height: VIEW_H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: 12, color: 'var(--muted2)' }}>{emptyLabel}</p>
      </div>
    )
  }

  const values = data.map(d => d.value)
  const maxValue = Math.max(...values, 0) * 1.15 || 1
  const n = data.length

  const xAt = (i: number) => (n === 1 ? VIEW_W / 2 : (i / (n - 1)) * VIEW_W)
  const yAt = (v: number) => PAD_TOP + PLOT_H - (v / maxValue) * PLOT_H

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(d.value)}`).join(' ')
  const areaPath = `${linePath} L ${xAt(n - 1)} ${VIEW_H - PAD_BOTTOM} L ${xAt(0)} ${VIEW_H - PAD_BOTTOM} Z`

  const last = data[n - 1]
  const hovered = hoverIndex !== null ? data[hoverIndex] : null

  const updateHover = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    setHoverIndex(Math.round(frac * (n - 1)))
  }

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%', touchAction: 'pan-y' }}
      onPointerDown={updateHover}
      onPointerMove={e => { if (e.buttons > 0 || e.pointerType === 'touch') updateHover(e) }}
      onPointerUp={() => setHoverIndex(null)}
      onPointerLeave={() => setHoverIndex(null)}
    >
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} style={{ width: '100%', height: VIEW_H, display: 'block', overflow: 'visible' }}>
        {/* 베이스라인(0 기준선) */}
        <line x1={0} y1={VIEW_H - PAD_BOTTOM} x2={VIEW_W} y2={VIEW_H - PAD_BOTTOM} stroke="var(--border)" strokeWidth={1} />

        <defs>
          <linearGradient id={`fill-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#fill-${color.replace('#', '')})`} stroke="none" />
        <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {/* 끝점 강조 + 최신값 라벨 */}
        <circle cx={xAt(n - 1)} cy={yAt(last.value)} r={4} fill={color} />
        <text x={Math.min(xAt(n - 1), VIEW_W - 4)} y={Math.max(yAt(last.value) - 8, 10)} textAnchor="end" fontSize={11} fontWeight={800} fill="var(--text)">
          {formatValue(last.value)}
        </text>

        {/* 크로스헤어 (누르거나 드래그해서 확인) */}
        {hovered && (
          <>
            <line x1={xAt(hoverIndex!)} y1={PAD_TOP} x2={xAt(hoverIndex!)} y2={VIEW_H - PAD_BOTTOM} stroke="var(--muted)" strokeWidth={1} strokeDasharray="2 2" />
            <circle cx={xAt(hoverIndex!)} cy={yAt(hovered.value)} r={4} fill="var(--bg)" stroke={color} strokeWidth={2} />
          </>
        )}

        {/* x축: 시작/끝 날짜만 표시 */}
        <text x={2} y={VIEW_H - 6} fontSize={9} fill="var(--muted2)">{formatDate(data[0].date)}</text>
        <text x={VIEW_W - 2} y={VIEW_H - 6} textAnchor="end" fontSize={9} fill="var(--muted2)">{formatDate(last.date)}</text>

        {/* 운영 메모 마커 — 값 라인과는 별개로, 그날 남긴 메모가 있는 지점 위에만 찍힌다.
            크로스헤어(hoverIndex)와 독립적인 상태(activeEventIndex)로 토글한다. */}
        {data.map((d, i) => (d.events && d.events.length > 0) ? (
          <circle
            key={i}
            cx={xAt(i)} cy={8} r={3.5}
            fill="var(--purple-light)" stroke="var(--bg)" strokeWidth={1}
            style={{ cursor: 'pointer' }}
            onPointerDown={e => { e.stopPropagation(); setActiveEventIndex(prev => prev === i ? null : i) }}
            onMouseEnter={() => setActiveEventIndex(i)}
            onMouseLeave={() => setActiveEventIndex(prev => prev === i ? null : prev)}
          />
        ) : null)}
      </svg>

      {activeEventIndex !== null && data[activeEventIndex].events && (
        <div style={{
          position: 'absolute', top: 14, left: `${(xAt(activeEventIndex) / VIEW_W) * 100}%`,
          transform: `translateX(${activeEventIndex < n / 2 ? '4px' : 'calc(-100% - 4px)'})`,
          background: 'var(--card2)', border: '1px solid var(--purple-light)', borderRadius: 8,
          padding: '6px 10px', fontSize: 11, maxWidth: 180, zIndex: 5,
        }}>
          <p style={{ color: 'var(--muted2)', marginBottom: 4, fontWeight: 700 }}>{formatDate(data[activeEventIndex].date)} 메모</p>
          {data[activeEventIndex].events!.map((ev, idx) => (
            <p key={idx} style={{ color: 'var(--text)', marginTop: idx > 0 ? 4 : 0 }}>
              <span style={{ color: 'var(--muted2)' }}>
                {new Date(ev.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
              </span> {ev.content}
            </p>
          ))}
        </div>
      )}

      {hovered && (
        <div style={{
          position: 'absolute', top: 0, left: `${(xAt(hoverIndex!) / VIEW_W) * 100}%`,
          transform: `translateX(${hoverIndex! < n / 2 ? '4px' : 'calc(-100% - 4px)'})`,
          background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 8,
          padding: '4px 8px', fontSize: 11, whiteSpace: 'nowrap', pointerEvents: 'none',
        }}>
          <span style={{ color: 'var(--muted2)', marginRight: 6 }}>{formatDate(hovered.date)}</span>
          <span style={{ fontWeight: 800, color: 'var(--text)' }}>{formatValue(hovered.value)}</span>
        </div>
      )}
    </div>
  )
}
