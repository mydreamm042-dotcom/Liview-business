import { VenueLayoutItem } from '@/lib/supabase/types'

// 좌석 렌더링 크기 (BUSINESS_RULES.md §2.8 "좌석 크기 — 박스 비례 fit", ADR-0008).
//
// 좌석은 저장된 크기를 갖지 않는다. 그 매장 box(네모) 장식 요소들의 평균 크기에 비례해
// 렌더링 시점마다 계산하는 파생값이라, 운영자가 네모를 키우거나 줄이면 이미 배치된 좌석도
// 마이그레이션 없이 그 즉시 따라 바뀐다. 좌석 간 개별 차등은 없다(한 매장 = 하나의 크기).

// 좌석 지름 = 평균 box의 **짧은 변**의 40%. 짧은 변을 기준으로 잡는 이유는 좌석이 네모 안팎
// 어느 방향으로 놓이든 넘치지 않아야 하기 때문이고, 40%면 네모 한 변에 두 자리가 나란히
// 들어가면서도 사이 간격이 남는다 — 테이블 하나에 여러 좌석이 붙는 실제 배치와 맞다.
export const SEAT_TO_BOX_RATIO = 0.4

// 네모를 하나도 안 놓은 매장의 기본값(캔버스 너비 대비 %). 비례 계산 도입 전 쓰던 고정값과
// 같은 값이라, 네모 없이 좌석만 배치해둔 기존 매장은 배치가 그대로 유지된다.
export const SEAT_FALLBACK_PCT = 8

// 네모 크기 제한을 폐지했기 때문에(ADR-0008) 평균이 극단으로 갈 수 있다 — 아주 작으면 좌석을
// 누를 수도 번호를 읽을 수도 없고, 아주 크면 좌석이 배치도를 덮어버린다. 비례는 이 구간
// 안에서만 따른다. 기준은 캔버스의 짧은 변이다 — 긴 변으로 잡으면 가로로 긴 캔버스에서
// 하한이 비례값보다 커져 비례 자체를 덮어버린다.
export const SEAT_MIN_PCT = 3
export const SEAT_MAX_PCT = 16

// 캔버스는 정사각형이 아니라서 width%와 height%를 그대로 비교할 수 없다 — 양쪽 다 px로
// 환산한 뒤 짧은 변을 고른다.
export function seatSizePx(layoutItems: VenueLayoutItem[], contentWidth: number, contentHeight: number): number {
  if (contentWidth <= 0) return 0

  const shortSide = contentHeight > 0 ? Math.min(contentWidth, contentHeight) : contentWidth
  const min = (shortSide * SEAT_MIN_PCT) / 100
  const max = (shortSide * SEAT_MAX_PCT) / 100

  const boxes = layoutItems.filter(i => i.kind === 'box')
  const size =
    boxes.length === 0 || contentHeight <= 0
      ? (contentWidth * SEAT_FALLBACK_PCT) / 100
      : Math.min(
          (boxes.reduce((s, b) => s + b.width, 0) / boxes.length / 100) * contentWidth,
          (boxes.reduce((s, b) => s + b.height, 0) / boxes.length / 100) * contentHeight,
        ) * SEAT_TO_BOX_RATIO

  return Math.max(min, Math.min(max, size))
}
