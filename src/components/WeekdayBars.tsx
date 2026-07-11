const VIEW_W = 300
const VIEW_H = 110
const PAD_TOP = 20
const PAD_BOTTOM = 20
const PLOT_H = VIEW_H - PAD_TOP - PAD_BOTTOM
const BAR_GAP = 8

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

// 요일별 평균 참여자 수 (Operator Analytics 도메인, BUSINESS_RULES.md §2.10). 7개뿐이라
// 막대마다 값을 직접 라벨링한다 — 계열이 하나뿐이라 범례도 따로 없다.
export default function WeekdayBars({ data, color }: { data: { weekday: number; avg_guests: number }[]; color: string }) {
  const byDow = new Map(data.map(d => [d.weekday, d.avg_guests]))
  const values = WEEKDAY_LABELS.map((_, i) => byDow.get(i) ?? 0)
  const maxValue = Math.max(...values, 1) * 1.2

  const barWidth = (VIEW_W - BAR_GAP * (values.length - 1)) / values.length

  if (values.every(v => v === 0)) {
    return (
      <div style={{ height: VIEW_H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: 12, color: 'var(--muted2)' }}>데이터가 아직 없어요</p>
      </div>
    )
  }

  return (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} style={{ width: '100%', height: VIEW_H, display: 'block' }}>
      <line x1={0} y1={VIEW_H - PAD_BOTTOM} x2={VIEW_W} y2={VIEW_H - PAD_BOTTOM} stroke="var(--border)" strokeWidth={1} />
      {values.map((v, i) => {
        const h = (v / maxValue) * PLOT_H
        const x = i * (barWidth + BAR_GAP)
        const y = VIEW_H - PAD_BOTTOM - h
        return (
          <g key={i}>
            <rect x={x} y={y} width={barWidth} height={Math.max(h, 1)} rx={4} fill={color} opacity={v > 0 ? 1 : 0.25} />
            {v > 0 && (
              <text x={x + barWidth / 2} y={y - 5} textAnchor="middle" fontSize={10} fontWeight={800} fill="var(--text)">
                {v}
              </text>
            )}
            <text x={x + barWidth / 2} y={VIEW_H - 6} textAnchor="middle" fontSize={10} fill="var(--muted2)">
              {WEEKDAY_LABELS[i]}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
