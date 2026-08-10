// 요일별 영업시간 검증/정규화 (Venue 도메인 확장, BUSINESS_RULES.md §2.2 "요일별 영업시간").
// API 라우트와(향후) 설정 화면이 같은 규칙을 공유하도록 순수 함수로 뽑아둔다.

export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

export interface BusinessHoursDay {
  weekday: number
  is_closed: boolean
  is_24h: boolean
  open_time: string
  close_time: string
  last_order_time: string | null
}

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

// 정기휴무/24시간 체크 시 시간 필드를 강제로 맞춘다 — 클라이언트가 뭘 보내든
// 저장되는 값은 항상 그 상태에 맞는 값이 되도록 서버가 마지막에 정규화한다.
export function normalizeDay(day: BusinessHoursDay): BusinessHoursDay {
  if (day.is_closed) {
    return { ...day, is_24h: false, open_time: '00:00', close_time: '00:00', last_order_time: null }
  }
  if (day.is_24h) {
    return { ...day, open_time: '00:00', close_time: '00:00' }
  }
  return day
}

// 문제가 있으면 에러 메시지를, 없으면 null을 반환한다. normalizeDay를 먼저 통과시킨
// 값을 넣는다고 가정한다(정기휴무/24시간 분기는 이미 처리됨).
export function validateDay(day: BusinessHoursDay): string | null {
  if (day.is_closed || day.is_24h) return null

  if (!day.open_time || !day.close_time) {
    return `${WEEKDAY_LABELS[day.weekday]}요일: 영업 시작/종료 시간이 필요합니다`
  }
  const open = toMinutes(day.open_time)
  const close = toMinutes(day.close_time)
  if (open === close) {
    return `${WEEKDAY_LABELS[day.weekday]}요일: 시작 시간과 종료 시간이 같을 수 없습니다`
  }

  if (day.last_order_time) {
    const lo = toMinutes(day.last_order_time)
    // 자정을 넘어가는 영업(예: 14:00~04:00)은 "시작 이후" 또는 "종료 이전" 둘 중 하나만
    // 만족하면 그 사이 구간에 있는 것이다 — 같은 날짜 안에서 끝나는 영업과 판정 방식이 다르다.
    const crossesMidnight = close <= open
    const withinWindow = crossesMidnight ? (lo >= open || lo <= close) : (lo >= open && lo <= close)
    if (!withinWindow) {
      return `${WEEKDAY_LABELS[day.weekday]}요일: 라스트 오더는 영업 시간 안이어야 합니다`
    }
  }

  return null
}
