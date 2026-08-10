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
| 배치 요소 최소 크기 | 4% (`MIN_SIZE_PCT`) | `src/app/operator/settings/[id]/seats/page.tsx` |
| 배치 요소 기본 크기 (%) | table 26×16 · box 24×22 · door 18×6 · text 20×6 | `src/app/api/venues/[id]/layout/route.ts` |

## 기타

| 이름 | 값 | 위치 |
|------|-----|------|
| 매장 소개(`description`) 최대 길이 | 200자 | `src/app/operator/settings/[id]/page.tsx` |
