import { GAP, TYPE, ICON } from '@/lib/design'
import Icon, { IconName } from './Icon'

// "아이콘 + 숫자 + 라벨" 지표 한 칸. 결과 화면·대시보드·지도 목록이 각자 다른 크기(11/13/20/
// 22/34px)와 다른 배치(아이콘이 위/왼쪽/오른쪽)로 같은 것을 그리고 있었다 (ADR-0009).
//
// 게슈탈트 관점에서 지표는 **유사성**이 가장 중요한 요소다 — 나란히 놓인 칸들은 서로 비교하려고
// 놓은 것이라, 칸마다 글자 크기나 아이콘 위치가 다르면 값의 크기가 아니라 스타일 차이가 먼저
// 눈에 들어와 비교 자체가 방해된다. 그래서 배치를 하나로 고정하고 색만 다르게 한다.
//
// 라벨을 값 **아래**에 두는 이유: 세로로 [아이콘][값][라벨] 순서면 여러 칸을 나란히 놓을 때
// 아이콘끼리·값끼리·라벨끼리 같은 높이에 정렬돼(연속성) 행 단위로 훑어읽을 수 있다.
export default function MetricCell({ icon, value, label, color, align = 'center' }: {
  icon: IconName
  value: string | number
  label: string
  /** 아이콘과 값에 함께 적용된다 — 아이콘만 색을 주면 값이 라벨과 한 덩어리로 읽힌다 */
  color?: string
  align?: 'center' | 'left'
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: GAP.tight,
      alignItems: align === 'center' ? 'center' : 'flex-start',
    }}>
      <span style={{ color: color ?? 'var(--muted2)' }}>
        <Icon name={icon} size={ICON.row} />
      </span>
      <span style={{ ...TYPE.metric, color: color ?? 'var(--text)' }}>{value}</span>
      <span style={TYPE.caption}>{label}</span>
    </div>
  )
}
