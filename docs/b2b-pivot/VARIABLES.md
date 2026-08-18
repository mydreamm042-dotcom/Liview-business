# VARIABLES

쿨타임/반경/기본크기 등 튜닝 가능한 값의 단일 원천. **새 상수를 코드에 추가하기 전에 여기
먼저 한 줄 기록한다** — 매직 넘버로 코드에만 흩어두지 않는다. 값이 바뀌면 이 표도 같이 고친다.

일일 정합성 크론이 이 표에 없는 이름의 신규 쿨타임/반경류 상수가 코드에 등장하는지 감지한다
(`AGENTS.md` 참고).

## Reaction 쿨타임

| 이름 | 값 | 위치 |
|------|-----|------|
| `WARNING_COOLDOWN_MS` | 5분 (300,000ms) | `src/lib/cooldown.ts` |
| `STAR_COOLDOWN_MS` | 30분 (1,800,000ms) | `src/lib/cooldown.ts` |
| `QNA_EXTERNAL_COOLDOWN_MS` | 60초 (60,000ms) — 외부 QnA `is_external=true` 작성자만 | `src/lib/cooldown.ts` |

## Atmosphere Index (HOT 지수)

| 이름 | 값 | 위치 |
|------|-----|------|
| `HOT_HOLD_MS` | 5분 — 탭 후 유지 구간 | `src/lib/hotIndex.ts` |
| `HOT_DECAY_MS` | 10분 — 유지 구간 이후 0까지 선형 감쇠 | `src/lib/hotIndex.ts` |
| `HOT_TOTAL_MS` | `HOT_HOLD_MS + HOT_DECAY_MS` = 15분 | `src/lib/hotIndex.ts` |
| `HOT_BASE_INCREMENT` | 4 — 탭당 증가율 = `4 / sqrt(탭 순간 참여자 수)` | `src/lib/hotIndex.ts` |

## Discovery / 지도

| 이름 | 값 | 위치 |
|------|-----|------|
| 기본 검색 반경 (`radius_km`) | 10km | `discover/venues`, `discover/rankings` 등 API 기본값 |
| HOT 밀도 집계 윈도우 (`p_window_minutes`) | 15분 | `get_live_hot_venues`, `get_regional_rankings` 등 RPC 기본값 |

## Venue / 위치 반경

| 이름 | 값 | 위치 |
|------|-----|------|
| `geofence_radius_m` 기본값 | 50m | `supabase/migrations/0003_venue_fixed_qr.sql` |

## Room 자동 정리 / 자동 마감

| 이름 | 값 | 위치 |
|------|-----|------|
| PERSONAL 방 정리 | `ended` 24시간 경과 시 삭제, `active` 2일 방치 시 삭제 | `supabase/schema.sql` (`delete_old_rooms`) |
| BUSINESS 방 자동 마감 | 설정된 마감시간 + 1시간 경과 시 | `BUSINESS_RULES.md` §2.1 |
| 정리/자동마감 크론 주기 | 매일 새벽 5시 (`0 5 * * *`) | `vercel.json` |
| 방 코드 형식 | 영문 대문자+숫자 6자리, 중복 시 최대 10회 재시도 | `src/lib/session.ts` (`generateRoomCode`) |

## Seating / 좌석 배치 에디터

| 이름 | 값 | 위치 |
|------|-----|------|
| 운영자 좌석 강제 이동 롱프레스 시간 | 2,000ms | `src/app/room/[code]/page.tsx` (`LONG_PRESS_MS`) |
| 좌석/배치 요소 좌표계 | 캔버스 대비 0~100% (`position_x`/`position_y` = 중심) | `venue_seats`, `venue_layout_items` 공통 |
| 배치 요소 최소/최대 크기 | ~~4%(`MIN_SIZE_PCT`)~~ **제한 폐지 완료** (2026-08-12, ADR-0008). 0 이하만 무시 | `src/app/api/venues/[id]/layout/route.ts` (`sanitizeSize`) |
| 배치 요소 기본 크기 (%) | box 24×22 · door 18×6 · text 20×6 · line 40(길이) — ~~table 26×16~~은 폐지 | `src/app/api/venues/[id]/layout/route.ts` |
| **좌석 렌더링 크기 — 네모 비례 fit** (2026-08-13 정정 반영, ADR-0008) | 고정 상수가 아니라 그 매장 `box` 평균에서 매번 계산하는 파생값. **좌석 지름 = 평균 box의 짧은 변 × 0.4** (`SEAT_TO_BOX_RATIO`). 짧은 변 기준인 이유는 좌석이 어느 방향으로 놓여도 안 넘치게, 0.4인 이유는 네모 한 변에 두 자리가 나란히 들어가고 사이 간격도 남기 때문. 캔버스가 정사각형이 아니라 width%/height%를 px로 환산한 뒤 비교한다 | `src/lib/seatSize.ts` (`seatSizePx`) |
| 좌석 크기 — 네모 0개일 때 기본값 | 캔버스 너비의 **8%** (`SEAT_FALLBACK_PCT`) — 비례 도입 전 쓰던 고정값과 같아서, 네모 없이 좌석만 배치해둔 기존 매장은 배치가 그대로 유지된다 | `src/lib/seatSize.ts` |
| 좌석 크기 — 상·하한 | 캔버스 **짧은 변의 3%~16%** (`SEAT_MIN_PCT`/`SEAT_MAX_PCT`). 네모 크기 제한을 폐지해서 평균이 극단으로 갈 수 있는데, 너무 작으면 못 누르고 너무 크면 배치도를 덮는다. 긴 변이 아니라 짧은 변 기준인 이유: 가로로 긴 캔버스에서 하한이 비례값보다 커져 비례 자체를 덮어버린다 | `src/lib/seatSize.ts` |
| 선(line) 두께 | 2px 고정 (`LINE_THICKNESS_PX`) — 저장값이 아니라 렌더링 상수. 확대해도 굵어지지 않아야 구역 구분선으로 읽힌다 | `src/components/LayoutItemShape.tsx` |
| **자리배치도 확대 배율 범위** (2026-08-12, ADR-0008) | 1.0~4.0배, 연속값 (`ZOOM_MIN`/`ZOOM_MAX`) — 버튼 없이 두 손가락 핀치 / 트랙패드 Ctrl+휠로만 조작 | `src/hooks/useZoomPan.ts` |
| 드래그/탭 구분 임계값 | 6px (`DRAG_THRESHOLD_PX`) — 이보다 적게 움직였으면 화면 이동이 아니라 탭으로 본다 | `src/hooks/useZoomPan.ts` |
| 미니맵 너비 | 손님 화면 104px · 운영자 편집 화면 92px (`MINIMAP_WIDTH`, 높이는 캔버스와 같은 비율로 자동 계산) | `src/components/SeatMap.tsx`, `src/app/operator/settings/[id]/seats/page.tsx` |
| 좌석 복제 시 위치 오프셋 | 원본 대비 +4%, +4% — 원본을 가리지 않으면서 관계가 보이는 거리 | `src/app/operator/settings/[id]/seats/page.tsx` |

## 디자인 토큰 (2026-08-17, ADR-0009)

인라인 스타일이 주된 표현 수단이라 토큰도 CSS 변수가 아니라 TS 객체로 둔다 — **색만** 예외로
`globals.css`의 CSS 변수가 원천이다(두 곳에 쓰지 않기 위해). 전부 `src/lib/design.ts`.

| 이름 | 값 | 비고 |
|------|-----|------|
| `GAP` (간격) | tight 4 · snug 8 · base 12 · loose 16 · **section 24** · region 40 | **핵심 규칙: 그룹 안은 tight~snug, 그룹 사이는 section 이상** — 사이 간격이 안 간격의 2배 이상이어야 덩어리가 눈에 끊긴다(근접성). 이전엔 4~28이 전부 쓰여 이 비율이 우연에 맡겨져 있었다 |
| `TYPE` (타이포) | title 26/800 · heading 16/800 · eyebrow 11/800(자간 .08em) · body 14/600 · caption 12/500 · metric 22/800 | 역할별로 하나씩만. 같은 역할의 글자가 11·12·13·14px로 제각각이던 것을 정리(유사성) |
| `ICON` (아이콘 크기) | inline 16 · row 20 · card 28 · hero 48 | 이전엔 13~64px가 흩어져 있어 같은 줄의 글자와 시각적 무게가 항목마다 달랐다 |
| `SURFACE` (전경-배경 층) | page `--bg` < area `--bg2` < group `--card` < item `--card2` | 이 순서로만 쌓는다. 이전엔 card/card2가 순서 없이 섞여 "무엇이 무엇 위인지"가 화면마다 뒤집혔다 |
| `RADIUS` | item 12 · group 16 · card 20 · pill 999 | |
| `SEMANTIC` (의미색) | success `#10b981` · warning `#f59e0b` · danger `#ff6b6b` · score `#f5c518` | 화면마다 다른 hex로 적던 것(#10b981/#0f9e6e, #f59e0b/#fbbf24 등)을 하나로. `score`는 별점 노랑 — `StarRow`가 쓰던 값 |
| 버튼 아이콘 간격 | `.btn { gap: 6px }` | 호출부마다 정하면 버튼마다 달라지므로 CSS에서 한 번에 |
| 404 폴백 대기 시간 | 1,200ms 후 `/`로 `replace` | `src/app/not-found.tsx`. 즉시 이동하면 흰 화면만 스쳐서 손님이 "아무 일도 안 일어났다"고 느낀다 |

## 아이콘 (2026-08-17, ADR-0009)

이모지는 **전면 금지**다. 아이콘은 `src/components/Icon.tsx`의 `Icon` 컴포넌트만 쓴다.

| 항목 | 값 |
|------|-----|
| 출처 | Google Material Symbols **Rounded, weight 400** — npm `@material-symbols/svg-400@0.46.0`의 `rounded/<이름>.svg` |
| 이름 규칙 | Google 카탈로그 이름 그대로(`local_fire_department`, `volume_off` 등). 새 아이콘은 fonts.google.com/icons에서 이름을 찾아 같은 패키지에서 path를 복사 |
| 심는 방식 | 인라인 SVG path (웹폰트 아님 — 폰트 로딩 중 리거처 원문이 노출되는 구간을 피하려고) |
| 현재 개수 | 46개 |
| 색 | `currentColor` — 부모의 `color`를 따른다 |
| viewBox | `0 -960 960 960` (Material Symbols 좌표계 규약, 원본 path를 손대지 않기 위해 유지) |

## 기타

| 이름 | 값 | 위치 |
|------|-----|------|
| 매장 소개(`description`) 최대 길이 | 200자 | `src/app/operator/settings/[id]/page.tsx` |
