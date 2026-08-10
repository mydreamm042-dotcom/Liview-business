import { ReactNode } from 'react'

// "OPERATOR / SEAT / WELCOME..." 같은 눈에 띄는 라벨 + 제목 + 부제목 3줄 헤더. 9개 이상의
// 화면에 거의 동일한 마크업이 흩어져 있던 것을 뽑았다 — 각 화면이 골랐던 크기/여백 값은
// prop으로 그대로 보존해서 지금 화면이 눈으로 봤을 때 달라지지 않게 했다(순수 추출 리팩토링).
export default function PageEyebrowHeader({
  eyebrow, title, subtitle, className,
  marginBottom = 28, titleSize = 26, titleLineHeight, titleMarginBottom,
  subtitleSize = 14, subtitleMarginTop = 6,
}: {
  eyebrow: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  className?: string
  marginBottom?: number
  titleSize?: number
  titleLineHeight?: number
  titleMarginBottom?: number
  subtitleSize?: number
  subtitleMarginTop?: number
}) {
  return (
    <div className={className} style={{ marginBottom }}>
      <p style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700, marginBottom: 6, letterSpacing: '0.05em' }}>{eyebrow}</p>
      <h1 style={{ fontSize: titleSize, fontWeight: 800, lineHeight: titleLineHeight, marginBottom: titleMarginBottom }}>{title}</h1>
      {subtitle && <p style={{ color: 'var(--muted2)', fontSize: subtitleSize, marginTop: subtitleMarginTop }}>{subtitle}</p>}
    </div>
  )
}
