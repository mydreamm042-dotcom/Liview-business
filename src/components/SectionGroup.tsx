import { ReactNode } from 'react'
import { GAP, TYPE } from '@/lib/design'

// 공동 영역(common region) — 게슈탈트에서 가장 강한 그루핑 신호다. 근접성보다 우선해서,
// 테두리 하나로 묶으면 안에 있는 것들은 서로 떨어져 있어도 한 덩어리로 읽힌다 (ADR-0009).
//
// 이걸 만든 이유: 운영자 매장 설정 화면이 성격이 다른 카드 8개를 똑같은 모양·똑같은 간격으로
// 평평하게 나열하고 있었다. "영업 상태"(지금 여기서 조작) 와 "좌석 관리"(다른 화면으로 이동)가
// 시각적으로 완전히 같아서, 무엇이 한 묶음인지 눈으로 구분할 수 없었다.
//
// 제목(eyebrow)은 그룹 **밖 위쪽**에 둔다 — 안에 넣으면 그룹의 첫 항목처럼 읽혀서, 제목과
// 항목이 같은 층에 있는 것처럼 보인다.
export default function SectionGroup({ title, description, children, style }: {
  /** 이 묶음이 무엇인지. 생략하면 테두리로만 묶는다 */
  title?: string
  /** 묶음 전체에 대한 한 줄 설명 */
  description?: string
  children: ReactNode
  style?: React.CSSProperties
}) {
  return (
    <section style={{ marginBottom: GAP.section, ...style }}>
      {title && (
        <div style={{ marginBottom: GAP.snug, paddingLeft: 2 }}>
          <h2 style={TYPE.eyebrow}>{title}</h2>
          {description && (
            <p style={{ ...TYPE.caption, marginTop: GAP.tight }}>{description}</p>
          )}
        </div>
      )}
      {children}
    </section>
  )
}
