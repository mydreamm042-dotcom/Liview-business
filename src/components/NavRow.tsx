'use client'

import { GAP, TYPE, ICON, RADIUS, SURFACE } from '@/lib/design'
import Icon, { IconName } from './Icon'

// "누르면 다른 화면으로 가는 행". 설정 화면들이 이 역할을 카드 4~5개로 각각 손으로 그리고
// 있었는데, 여기서 두 가지 게슈탈트 문제가 났다 (ADR-0009):
//
// 1. **유사성 위반**: 이동 행이 "여기서 조작하는 카드"와 똑같은 모양(같은 radius·padding·
//    배경)이라, 누르면 화면이 바뀌는 것과 그 자리에서 값이 바뀌는 것을 구분할 수 없었다.
//    이동 행에는 항상 오른쪽 꺾쇠(chevron)가 붙는다 — 그게 "여기서 나간다"는 유일한 신호다.
// 2. **근접성 위반**: 이동 행들이 서로 16px 떨어져 개별 카드로 떠 있어서, 4개가 한 묶음의
//    메뉴라는 게 안 보였다. 그래서 `NavRowGroup`으로 감싸 **하나의 카드 안에 구분선으로만**
//    나눈다 — 붙어 있으면 목록으로 읽히고, 떨어져 있으면 각자 다른 것으로 읽힌다.

export function NavRow({ icon, title, description, onClick, tone }: {
  icon: IconName
  title: string
  description?: string
  onClick: () => void
  /** 주의를 끌어야 하는 행(설정이 안 끝나서 막혀 있는 등)만 색을 준다 */
  tone?: string
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: GAP.base,
        width: '100%', padding: GAP.loose, textAlign: 'left',
        background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)',
      }}
    >
      <span style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 38, height: 38, borderRadius: RADIUS.item, flexShrink: 0,
        background: SURFACE.item, color: tone ?? 'var(--text2)',
      }}>
        <Icon name={icon} size={ICON.row} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ ...TYPE.body, fontWeight: 800, display: 'block', color: tone ?? 'var(--text)' }}>
          {title}
        </span>
        {description && (
          <span style={{ ...TYPE.caption, display: 'block', marginTop: 2 }}>{description}</span>
        )}
      </span>
      {/* 꺾쇠는 "나간다"는 신호라 절대 생략하지 않는다 */}
      <Icon name="chevron_right" size={ICON.row} style={{ color: 'var(--muted)' }} />
    </button>
  )
}

// 이동 행 여러 개를 하나의 공동 영역으로 묶는다. 행 사이는 구분선 1px만 — 간격을 주면
// 각자 떠서 다시 개별 카드처럼 보인다.
export function NavRowGroup({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: SURFACE.group, border: '1px solid var(--border)', borderRadius: RADIUS.group,
      overflow: 'hidden', ...style,
    }}>
      {/* 자식 사이에만 선을 넣는다 — 마지막 행 아래 선이 남으면 그룹 테두리와 겹쳐 두 줄로 보인다 */}
      <div style={{ display: 'flex', flexDirection: 'column' }} className="nav-row-group">
        {children}
      </div>
    </div>
  )
}
