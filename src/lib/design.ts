// 디자인 토큰 — 게슈탈트 그루핑의 단일 원천 (ADR-0009).
//
// 이 앱은 Tailwind 클래스가 아니라 인라인 스타일이 주된 표현 수단이라, 토큰도 CSS 변수가
// 아니라 TS 객체로 둔다(색만 globals.css의 CSS 변수를 쓴다 — 그쪽은 이미 원천이 있음).
//
// ## 왜 필요했나
// 간격이 4·6·8·10·12·14·16·18·20·22·24·26·28로 사실상 아무 값이나 쓰이고 있었다. 간격이
// 규칙 없이 흩어지면 **근접성(proximity)** 원칙이 작동하지 않는다 — 사람은 "가까운 것끼리
// 한 덩어리"로 읽는데, 그룹 안 간격(14)과 그룹 사이 간격(16)이 비슷하면 어디서 덩어리가
// 끊기는지 눈으로 알 수 없다. 그래서 값을 6단계로 줄이고, **그룹 안은 GAP.tight~snug,
// 그룹 사이는 GAP.section 이상**이라는 비율 규칙을 강제한다(사이 간격이 안 간격의 2배 이상).

// 간격 스케일. 4의 배수로만 오르고, 인접 단계가 최소 1.5배씩 벌어져 "안"과 "사이"가 눈에
// 확실히 구분된다.
export const GAP = {
  /** 4 — 한 덩어리 안에서 붙어 있는 것(아이콘과 글자, 값과 단위) */
  tight: 4,
  /** 8 — 같은 그룹의 항목 사이(라벨과 입력칸) */
  snug: 8,
  /** 12 — 같은 그룹의 독립적인 항목 사이(카드 안 문단) */
  base: 12,
  /** 16 — 그룹 안의 마지막 여백(카드 패딩 등) */
  loose: 16,
  /** 24 — 그룹과 그룹 사이. 이 값 이상이어야 다른 덩어리로 읽힌다 */
  section: 24,
  /** 40 — 성격이 다른 영역(본문과 위험 구역) 사이 */
  region: 40,
} as const

// 타이포 스케일. 역할별로 하나씩만 둔다 — **유사성(similarity)** 원칙은 "같은 역할이면 같은
// 크기·굵기"를 요구하는데, 기존 코드엔 같은 역할의 글자가 11·12·13·14px로 제각각이었다.
export const TYPE = {
  /** 화면 제목 */
  title: { fontSize: 26, fontWeight: 800 as const, lineHeight: 1.2 },
  /** 카드/그룹 제목 */
  heading: { fontSize: 16, fontWeight: 800 as const, lineHeight: 1.3 },
  /** 그룹 위에 붙는 영역 이름 (대문자/자간 넓힘) */
  eyebrow: {
    fontSize: 11, fontWeight: 800 as const, letterSpacing: '0.08em',
    color: 'var(--muted2)',
  },
  /** 본문 */
  body: { fontSize: 14, fontWeight: 600 as const, lineHeight: 1.5 },
  /** 보조 설명 */
  caption: { fontSize: 12, fontWeight: 500 as const, lineHeight: 1.45, color: 'var(--muted2)' },
  /** 숫자 지표처럼 크게 읽히는 값 */
  metric: { fontSize: 22, fontWeight: 800 as const, lineHeight: 1.1 },
} as const

// 아이콘 크기도 스케일로 묶는다 — 아이콘만 제각각 크면(14·15·18·20·24·34·40·48·52·56·64px가
// 실제로 쓰이고 있었다) 같은 줄에 놓인 글자와의 시각적 무게가 항목마다 달라져, 줄이 정렬돼
// 있어도 정렬돼 보이지 않는다.
export const ICON = {
  /** 16 — 본문 글자 옆 */
  inline: 16,
  /** 20 — 행(row) 앞머리, 버튼 안 */
  row: 20,
  /** 28 — 카드 대표 아이콘 */
  card: 28,
  /** 48 — 빈 상태/결과 화면의 주인공 */
  hero: 48,
} as const

// 전경-배경(figure-ground) 층. 배경에서 멀어질수록 위로 올라온 것이다. 기존엔 card와 card2가
// 아무 순서 없이 섞여 쓰여서 "무엇이 무엇 위에 있는지"가 화면마다 뒤집혔다.
// bg(페이지) < bg2(캔버스/영역) < card(그룹) < card2(그룹 안의 항목)
export const SURFACE = {
  page: 'var(--bg)',
  area: 'var(--bg2)',
  group: 'var(--card)',
  item: 'var(--card2)',
} as const

export const RADIUS = { item: 12, group: 16, card: 20, pill: 999 } as const

// 의미색. 성공/주의/위험을 화면마다 다른 hex로 적고 있었다(#10b981·#0f9e6e, #f59e0b·#fbbf24,
// #ff6b6b·#e10600). 색이 의미를 나르는 이상 값이 하나여야 한다.
export const SEMANTIC = {
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ff6b6b',
  /** 별점 등 "점수"를 나타내는 노랑 */
  score: '#f5c518',
} as const
