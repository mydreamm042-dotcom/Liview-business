import { GAP, ICON, SEMANTIC } from '@/lib/design'
import Icon from './Icon'

// 폼 하단에 붙는 한 줄짜리 에러/성공 안내문. 색상만 다르고 나머지 스타일은 거의 항상
// 동일한 패턴이 이 앱 전체에 30곳 넘게 반복되고 있어 뽑았다.
//
// 2026-08-17(ADR-0009): 아이콘을 이 컴포넌트가 직접 붙인다. 이전엔 호출부가 문구 앞에 "✓"를
// 손으로 적었는데, 어떤 곳은 적고 어떤 곳은 안 적어서 같은 성공 메시지가 화면마다 다르게
// 보였다 — 유사성 원칙상 같은 종류의 알림은 항상 같은 모양이어야 하므로, 호출부에 선택권을
// 주지 않고 type만 받아 아이콘까지 정한다.
export default function InlineMessage({
  type, children, fontSize = 12, style,
}: {
  type: 'error' | 'success'
  children: React.ReactNode
  fontSize?: number
  style?: React.CSSProperties
}) {
  const color = type === 'error' ? SEMANTIC.danger : SEMANTIC.success
  return (
    <p style={{
      // 아이콘과 글자를 한 줄로 붙인다. 여러 줄로 넘어가도 아이콘은 첫 줄에 머물러야
      // 읽는 흐름이 안 끊기므로 flex-start 정렬.
      display: 'flex', alignItems: 'flex-start', gap: GAP.tight + 2,
      fontSize, color, lineHeight: 1.45, ...style,
    }}>
      <Icon name={type === 'error' ? 'error' : 'check_circle'} size={ICON.inline}
        style={{ marginTop: 1 }} />
      <span>{children}</span>
    </p>
  )
}
