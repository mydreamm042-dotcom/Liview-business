import { GAP, ICON, RADIUS, SURFACE } from '@/lib/design'
import Icon from './Icon'

// 화면 상단의 뒤로가기 버튼. 페이지 26개 중 7개에 픽셀 단위로 동일한 인라인 스타일이
// 중복돼있던 것을 뽑았다 — 나중에 디자인을 바꿀 때 여기 한 곳만 고치면 되게 하기 위함.
//
// 2026-08-17(ADR-0009): 글자 "←"를 Material Symbols `arrow_back`으로 교체. 글자 화살표는
// 폰트마다 굵기·크기가 달라 다른 아이콘들과 시각적 무게가 안 맞았다.
export default function BackButton({ onClick, marginBottom = GAP.section }: { onClick: () => void; marginBottom?: number }) {
  return (
    <button onClick={onClick} aria-label="뒤로가기"
      style={{
        width: 40, height: 40, borderRadius: RADIUS.item, background: SURFACE.item,
        border: '1px solid var(--border)', color: 'var(--text2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', marginBottom,
      }}>
      <Icon name="arrow_back" size={ICON.row} />
    </button>
  )
}
