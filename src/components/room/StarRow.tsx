'use client'

// 별 5개 표시/선택 공용 컴포넌트 (Phase 9 방 화면). onSelect가 있으면 누를 수 있는
// 입력 모드, 없으면 읽기 전용 표시 모드다. 표시 모드는 평균(소수점)을 반올림해서 채운다.
export default function StarRow({ value, size = 22, onSelect, dim = false }: {
  value: number
  size?: number
  onSelect?: (v: number) => void
  // 아직 점수를 안 고른 입력 모드 — 전부 빈 별(빨간 테두리)로 보여준다
  dim?: boolean
}) {
  const filled = Math.round(value)
  return (
    <div style={{ display: 'flex', gap: size * 0.18 }}>
      {[1, 2, 3, 4, 5].map(i => {
        const on = !dim && i <= filled
        const star = (
          <svg width={size} height={size} viewBox="0 0 24 24"
            fill={on ? '#f5c518' : dim ? 'transparent' : 'var(--card2)'}
            stroke={dim ? 'var(--accent)' : on ? 'none' : 'var(--muted)'}
            strokeWidth={dim ? 1.6 : 1}>
            <path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.45 6.19 20.5 7.3 14.03 2.6 9.45l6.5-.95L12 2.6z" />
          </svg>
        )
        if (!onSelect) return <span key={i} style={{ lineHeight: 0 }}>{star}</span>
        return (
          <button key={i} onClick={() => onSelect(i)} aria-label={`${i}점`}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 0 }}>
            {star}
          </button>
        )
      })}
    </div>
  )
}
