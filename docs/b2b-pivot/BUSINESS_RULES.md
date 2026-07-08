# MySTAR Business Rule 문서

## 목적
이 문서는 (1) 시스템을 구성하는 **도메인을 먼저 정의**하고, (2) 각 도메인이 소유한 Business Rule을 코드 근거와 함께 정리하여, "기존 Business Rule은 최대한 유지한다"는 개발 원칙의 기준선(baseline)을 명확히 한다. 모든 기존 규칙 항목에는 소스 근거 파일 경로를 표기했다.

규칙은 테이블이나 화면 단위가 아니라 **도메인 단위**로 조직한다. 도메인이란 "하나의 핵심 개념을 중심으로, 그 개념의 생성·상태 전이·불변식(invariant)을 스스로 책임지는 경계"를 말한다. 예를 들어 HOT 지수는 `reactions` 테이블의 일부(type='hot')지만, 감쇠·증가율 계산이라는 독자적인 규칙을 가지므로 별도 도메인으로 분리한다.

---

## Part 0. 도메인 정의 (Domain Definitions)

### 0.1 도메인 총괄표

| 도메인 | 정의 | 핵심 엔티티(테이블) | 의존 도메인 |
|--------|------|---------------------|--------------|
| **Room** (방) | 참여자들이 모이는 세션 하나의 생성·상태·생명주기를 책임지는 도메인 | `rooms` | Venue(선택적) |
| **Participant** (참여자) | 특정 방에 대한 한 사람의 참여 정체성(입장/나가기/재입장)을 책임지는 도메인 | `participants` | Room |
| **Reaction** (리액션) | 하트/자제시그널/별점/HOT탭이라는 4종 상호작용의 생성 규칙과 쿨타임을 책임지는 도메인 | `reactions` | Room, Participant |
| **Atmosphere Index** (분위기 지수/HOT) | Reaction 중 `hot` 타입 데이터로부터 "지금 이 순간의 분위기 수치(0~100)"를 계산해내는 파생 도메인 | (reactions 기반 계산, 별도 테이블 없음) | Reaction |
| **Mutual Match** (쌍방 매칭) | Reaction 중 `heart` 타입 데이터로부터 "서로 호감이 오갔는가"를 판정하는 파생 도메인 | (reactions 기반 계산, 별도 테이블 없음) | Reaction |
| **Chat** (채팅) | 방 내부의 공용 메시지 기록을 책임지는 도메인 | `messages` | Room, Participant |
| **End Vote** (종료 투표) | 참여자들이 방 종료를 합의하는 투표를 책임지는 도메인 | `end_votes` | Room, Participant |
| **Venue** (매장) 🆕 | 하나의 물리적 매장이 시간에 걸쳐 여러 방(세션)을 만들어도 유지되는 브랜딩·위치·설정을 책임지는 도메인 | `venues` | (최상위, 다른 도메인이 참조) |
| **Staff** (직원) 🆕 | 매장 소속 직원의 목록, 교대 근무, 참여자로부터 받는 친절도 평가를 책임지는 도메인 | `staff_members`, `staff_shifts`, `staff_evaluations` | Venue, Room, Participant |
| **Review** (검증 리뷰) 🆕 | 참여자의 실제 세션 데이터를 근거로 한 "조작 불가능한 방문 인증 리뷰"의 생성·공개여부를 책임지는 도메인 | `venue_reviews` | Venue, Room, Participant, Reaction |
| **Public Transparency** (공개 채팅) 🆕 | 매장이 opt-in한 경우에 한해, 방 채팅을 비참여자에게도 노출하는 규칙을 책임지는 도메인 | (Chat 도메인 데이터를 조건부로 재노출, 별도 테이블 없음) | Chat, Venue |
| **Discovery** (탐색/주변추천) 🆕 | 참여자의 현재 위치를 기준으로, 실시간으로 분위기가 좋은 주변 매장을 찾아주는 도메인 | (Venue + Room + Reaction 기반 계산, 별도 테이블 없음) | Venue, Room, Reaction |
| **Operator Analytics** (운영 분석) 🆕 | 위 모든 도메인의 데이터를 읽기 전용으로 재가공해 대시보드/퍼널/리포트/이벤트 타임라인을 제공하는 도메인 (자체 상태를 쓰지 않음) | `operation_events` (기록용) + 그 외는 조회 함수 | 전 도메인 |

### 0.2 도메인 관계도

```
Venue (매장) ──1:N── Room (방) ──1:N── Participant (참여자)
   │                    │                    │
   │                    │                    ├──1:N── Reaction (하트/경고/별점/HOT)
   │                    │                    │            │
   │                    │                    │            ├─ 파생 ─> Atmosphere Index (HOT 지수)
   │                    │                    │            └─ 파생 ─> Mutual Match (쌍방 매칭)
   │                    │                    │
   │                    │                    ├──1:N── Chat (메시지)
   │                    │                    │            └─ 조건부 재노출 ─> Public Transparency
   │                    │                    │
   │                    │                    └──1:N── End Vote (종료 투표)
   │                    │
   │                    ├──1:N── Venue Review (Room+Participant 스냅샷 기반)
   │                    └──ref── Staff Shift (해당 시각 근무자)
   │
   ├──1:N── Staff Member ──1:N── Staff Evaluation (Participant 투표, Room에 귀속)
   │
   └──조회 대상──> Discovery (위치 기반 실시간 랭킹)

Operator Analytics: 위 전체 도메인을 읽기 전용으로 가로질러 재가공 (자체 쓰기 없음, operation_events 제외)
```

### 0.3 도메인 경계 원칙

- **Room ≠ Venue**: Room은 "한 번의 세션"이고 Venue는 "그 세션들을 만드는 주체(매장)"이다. PERSONAL 방은 Venue에 속하지 않는다(venue_id가 없음).
- **Reaction은 원본, Atmosphere Index/Mutual Match는 파생**: 원본 리액션 데이터는 절대 수정되지 않으며, HOT 지수와 쌍방 매칭은 매번 원본으로부터 재계산되는 읽기 전용 파생값이다. 파생 도메인은 자신만의 저장 상태를 갖지 않는다.
- **Chat과 Public Transparency는 같은 데이터, 다른 노출 규칙**: 별도 테이블을 만들지 않고, 동일한 `messages` 데이터에 대해 "누구에게 보여줄 것인가"라는 노출 규칙만 다르게 적용한다.
- **Review는 Reaction의 스냅샷이지 새로운 입력이 아니다**: Review 도메인은 참여자가 직접 작성하는 자유 입력을 받지 않는다. 오직 Reaction/Room 도메인에 이미 존재하는 값을 특정 시점에 복사(snapshot)해서 저장할 뿐이다.
- **Operator Analytics는 상태를 소유하지 않는다**: 이 도메인은 다른 모든 도메인의 데이터를 읽어 집계할 뿐, `operation_events`(운영자가 직접 기록하는 이벤트 로그)를 제외하면 자체 쓰기 규칙이 없다.

---

## Part 1. 도메인별 Business Rule — 기존 B2C (변경 금지, 그대로 유지)

### 1.1 Room 도메인

**정의**: 참여자들이 모이는 세션 하나의 생성·상태·생명주기를 책임진다.

| 규칙 | 내용 | 근거 |
|------|------|------|
| 방 코드 형식 | 영문 대문자+숫자 6자리, 중복 시 최대 10회 재시도 후 생성 | `src/lib/session.ts` (generateRoomCode), `src/app/api/rooms/route.ts` |
| 방 생성자 = 호스트 | 방 생성 시 자동으로 닉네임 "호스트"인 참여자 1명이 함께 생성됨 (Participant 도메인과의 경계: Room 생성이 Participant 생성을 트리거) | `src/app/api/rooms/route.ts` |
| host_session 비공개 | 방 생성/조회 응답에서 `host_session`은 항상 제거 후 반환 (devtools로 탈취해 타인이 호스트 행세하는 것을 방지) | `src/app/api/rooms/route.ts`, `src/app/api/rooms/[code]/join/route.ts` |
| 방 상태 | `active` → `ended` 2단계. `ended` 방은 입장 불가 | `supabase/schema.sql`, `join/route.ts` |
| 자동 정리 (Cleanup) | `ended` 상태로 24시간 경과 시 삭제 / `active` 상태로 2일 경과 시(방치된 방) 삭제. Vercel Cron이 주기 호출 | `supabase/schema.sql` (delete_old_rooms), `src/app/api/cron/cleanup-rooms/route.ts` |
| 연쇄 삭제 | 방 삭제 시 Participant/Reaction/End Vote/Chat 도메인 데이터가 모두 `ON DELETE CASCADE`로 함께 삭제 (Room이 하위 도메인의 생명주기를 소유) | `supabase/schema.sql` |

### 1.2 Participant 도메인

**정의**: 특정 방에 대한 한 사람의 참여 정체성(입장/나가기/재입장)을 책임진다.

| 규칙 | 내용 | 근거 |
|------|------|------|
| 참여자 유니크 제약 | (room_id, session_token) 유니크 — 동시 이중 입장 요청 레이스를 DB 레벨에서 방지 | `supabase/schema.sql` 주석, `join/route.ts` |
| 나가기 = Soft Leave | 참여자 "나가기"는 행 삭제가 아니라 `left_at` 타임스탬프만 기록. 삭제 시 Reaction/Chat/End Vote 도메인에 남은 이 참여자 관련 데이터가 연쇄 삭제되어 재입장 시 초기화되는 것을 방지 | `src/app/api/participants/route.ts` (DELETE) |
| 재입장 = 동일 인물 복귀 | 같은 세션 토큰으로 재입장 시 새 참여자를 만들지 않고 기존 행의 `left_at`을 비우고 닉네임만 갱신 → 받은 하트, 매칭 이력, HOT 기여분이 그대로 유지됨 | `join/route.ts` |
| 입장 레이스 처리 | 동시 입장 요청으로 유니크 제약(23505) 충돌 시, 실패 처리하지 않고 먼저 생성된 참여자를 그대로 반환 | `join/route.ts` |
| 참여도 이벤트 1회 기록 | `result_viewed_at`, `chat_opened_at`은 최초 1회만 기록하고 이후 갱신하지 않음 (몇 번 열었는지가 아니라 "열어봤는지/언제 처음"만 필요) | `src/app/api/participants/route.ts` (PATCH) |

### 1.3 Reaction 도메인

**정의**: 하트/자제시그널/별점/HOT탭 4종 상호작용의 생성 규칙과 쿨타임을 책임진다. Atmosphere Index와 Mutual Match 도메인은 이 도메인의 데이터를 읽기만 하며 직접 쓰지 않는다.

| 규칙 | 내용 | 근거 |
|------|------|------|
| 리액션 타입 | `heart`(하트) / `warning`(자제 시그널) / `star`(별점) / `hot`(HOT 탭) 4종 고정 | `supabase/schema.sql` CHECK 제약 |
| 자기 자신 제외 | `heart`, `warning` 타입은 수신자가 발신자 본인이면 거부 (`star`, `hot`은 대상이 없거나 방 전체 대상이라 예외) | `src/app/api/reactions/route.ts` |
| 별점 범위 | `star` 타입의 value는 1~5 사이만 허용 | `src/app/api/reactions/route.ts` |
| 자제 시그널(warning) 쿨타임 | 5분 (300,000ms) | `src/lib/cooldown.ts` (WARNING_COOLDOWN_MS) |
| 별점(star) 쿨타임 | 30분 (1,800,000ms) | `src/lib/cooldown.ts` (STAR_COOLDOWN_MS) |
| 쿨타임 원자적 처리 | 쿨타임 확인과 저장을 `pg_advisory_xact_lock` 기반 DB 함수(`submit_cooldown_reaction`) 안에서 하나의 트랜잭션으로 처리 — "확인 후 저장" 사이 레이스로 쿨타임이 뚫리는 것을 방지. 잠금 키는 (발신자+리액션 타입) 조합이라 다른 발신자/다른 타입끼리는 서로 대기하지 않음 | `supabase/schema.sql` (submit_cooldown_reaction) |
| 서버 사이드 집계 | 하트/경고 카운트, 평균 만족도는 클라이언트가 원본 리액션 전체를 내려받아 계산하지 않고 DB 함수(`get_reaction_summary`)가 미리 계산해서 반환 — 폴링(3초 주기)이 참여자가 많아질수록 느려지는 것을 방지 | `supabase/schema.sql` |

### 1.4 Atmosphere Index 도메인 (HOT 지수)

**정의**: Reaction 도메인의 `hot` 타입 데이터로부터 "지금 이 순간의 분위기 수치(0~100)"를 계산하는 파생 도메인. 자체 저장 상태를 갖지 않고 매번 원본 리액션에서 재계산한다.

| 규칙 | 내용 | 근거 |
|------|------|------|
| 유지 구간 | 탭 이후 5분(HOT_HOLD_MS)간 값 그대로 유지 | `src/lib/hotIndex.ts` |
| 감쇠 구간 | 유지 구간 이후 10분(HOT_DECAY_MS)에 걸쳐 선형적으로 0까지 감소, 이후 0 고정 | `src/lib/hotIndex.ts` |
| 탭당 증가율 | 탭이 발생한 "그 순간"의 활성 참여자 수에 반비례 (`4 / sqrt(참여자수)`) — 참여자 4명일 때 정확히 2%가 되도록 보정된 기준값. 인원이 적을수록 한 탭의 임팩트가 크다 | `src/lib/hotIndex.ts` (HOT_BASE_INCREMENT) |
| 증가율 고정 시점 | 탭 순간의 참여자 수는 Reaction 도메인의 `value` 컬럼에 스냅샷으로 기록되며, 이후 참여자 수가 바뀌어도 이미 반영된 탭의 증가율은 재계산되지 않음 | `src/app/api/reactions/route.ts`, `src/lib/hotIndex.ts` |
| 최댓값 | 100 상한 (그 이상 누적되지 않음) | `src/lib/hotIndex.ts` (simulateHotTaps) |
| 계산 방식 | "평생 누적 탭 개수" 기반이 아니라 "시간순 시뮬레이션" 기반 — 오래 조용하다가 탭 1번만 눌러도 과거 히스토리 때문에 값이 튀지 않음 | `src/lib/hotIndex.ts` 주석 |
| 화면 표시 최적화 | 히스토리 전체 재계산(`simulateHotTaps`)은 탭 목록이 바뀔 때만 수행하고, 1초 단위로 갱신되는 "지금 이 순간" 표시값은 O(1) 연산(`hotIndexAt`)으로 구함 | `src/lib/hotIndex.ts` |

### 1.5 Mutual Match 도메인 (쌍방 매칭)

**정의**: Reaction 도메인의 `heart` 타입 데이터로부터 "서로 호감이 오갔는가"를 판정하는 파생 도메인.

| 규칙 | 내용 | 근거 |
|------|------|------|
| 매칭 판정 기준 | 방금 하트를 보낸 직후, "받은 쪽이 보낸 쪽 못지않게(개수 이상) 하트를 보내온 상태"면 매칭 성립 (`receiverCount > 0 && receiverCount >= senderCount`) | `src/lib/server/mutual.ts` |
| 판정 로직 단일화 | 전송 시 배너(발신자 화면)와 수신 확인 폴링(수신자 화면) 두 곳 모두 동일한 `checkMutualHeart` 함수를 공유 — 기준이 어긋나지 않도록 함 | `src/lib/server/mutual.ts` 주석 |

### 1.6 Chat 도메인

**정의**: 방 내부의 공용 메시지 기록을 책임진다.

| 규칙 | 내용 | 근거 |
|------|------|------|
| 발신자 나가도 기록 보존 | `sender_participant_id`는 `ON DELETE SET NULL` (다른 도메인과 달리 CASCADE 아님) — Participant가 나가도 채팅 기록 자체는 삭제되지 않음 | `supabase/schema.sql` |
| 닉네임 스냅샷 | `sender_nickname`을 전송 당시 값으로 저장 — Participant 행이 사라져도 누가 보낸 메시지인지 표시 유지 | `supabase/schema.sql` |

### 1.7 End Vote 도메인

**정의**: 참여자들이 방 종료를 합의하는 투표를 책임진다.

| 규칙 | 내용 | 근거 |
|------|------|------|
| 1인 1표 | (room_id, voter_session) 유니크 — 한 사람은 방 전체에 대해 한 표만 행사 가능 (특정 대상 1인당이 아님) | `supabase/schema.sql`, `src/app/api/end-votes/route.ts` |
| 중복 투표 거부 | 이미 투표한 세션이 재투표 시 400 + "이미 투표했습니다" 오류 | `src/app/api/end-votes/route.ts` |
| 새로고침 복원 | 결과 조회 시 `voter_session`을 함께 전달하면 "내가 이미 투표한 대상"을 함께 반환하여 새로고침해도 투표 상태 유지 | `src/app/api/end-votes/route.ts` |

---

## Part 2. 도메인별 Business Rule — 신규 B2B (BUSINESS 방 전용)

> 아래 규칙은 모두 **BUSINESS 타입 방에서만 적용**되며, PERSONAL 방에는 어떠한 영향도 주지 않는다. (설계 근거: `B2B_PIVOT_DESIGN.md`, `B2B_PIVOT_ADDENDUM.md`)

### 2.1 Room 도메인 확장 규칙 (Room Type / 마감)

| 규칙 | 내용 |
|------|------|
| 기본값 | 방 생성 시 `room_type`을 지정하지 않으면 `PERSONAL`로 간주 (하위 호환) |
| 기능 게이팅 | Venue/Staff/Review/Public Transparency/Discovery/Operator Analytics 등 모든 B2B 도메인 기능은 `room_type = 'BUSINESS'`일 때만 노출/동작 |
| 되돌리기 금지 | 방 생성 이후 `room_type`은 변경 불가 (PERSONAL ↔ BUSINESS 전환 시나리오는 지원하지 않음 — 운영 데이터 정합성을 위해) |
| 상태값 확장 | `rooms.status`에 `closed`를 추가 (`active`/`ended`/`closed`) |
| BUSINESS 방 전용 상태 | BUSINESS 방은 `active → closed`로만 전이하며, `ended` 상태를 사용하지 않는다 |
| 삭제 금지 | `closed` 상태의 BUSINESS 방은 어떤 자동 정리(cleanup) 로직에서도 삭제 대상이 되지 않는다 — Venue 도메인의 리뷰/직원평가/이벤트 이력이 영구 보존되어야 하기 때문 |
| Cleanup 범위 제한 | 기존 `delete_old_rooms()`는 `room_type = 'PERSONAL'` 조건이 추가되어, PERSONAL 방에 대해서만 기존 24시간/2일 정리 정책이 계속 적용된다 |

### 2.2 Venue 도메인

**정의**: 하나의 물리적 매장이 시간에 걸쳐 여러 방(세션)을 만들어도 유지되는 브랜딩·위치·설정을 책임진다. Room 도메인의 상위이자, Staff/Review/Discovery 도메인이 참조하는 최상위 엔티티다.

| 규칙 | 내용 |
|------|------|
| 방과 매장의 관계 | BUSINESS 방은 하나의 `venue_id`에 연결되며, 한 매장은 여러 방(세션)을 시간에 걸쳐 생성할 수 있다 (1 venue : N rooms) |
| 브랜딩 소속 | 매장명/로고/컬러/리뷰 URL은 Room이 아니라 Venue에 귀속되어 방이 바뀌어도 유지된다 |
| 방별 오버라이드 | 특정 방만 예외적으로 다른 테마를 쓰고 싶은 경우에 한해 `room_configs`로 개별 오버라이드 가능 (기본은 Venue 설정을 상속) |

### 2.3 Staff 도메인

**정의**: 매장 소속 직원의 목록, 교대 근무, 참여자로부터 받는 친절도 평가를 책임진다.

| 규칙 | 내용 |
|------|------|
| 직원 엔티티 | 직원은 Venue에 귀속되는 정식 엔티티(`staff_members`)로 관리되며, 자유 텍스트가 아니라 목록에서 선택하는 방식 |
| 교대 기록 | 교대 이벤트(`staff_shifts`)는 시작/종료 시각을 기록하며 삭제되지 않는다 (감사 이력 성격) |
| 친절도 투표 1인 1표 | Participant 1인은 Room 1회당 직원 친절도 투표를 1표만 행사 가능 (`UNIQUE(room_id, participant_id)`) |
| 투표 스킵 가능 | 직원 친절도 평가는 필수가 아니며 스킵 가능 (기존 UX 흐름을 방해하지 않는다는 원칙과 일관) |
| 실명 미노출 | 참여자의 투표 행위 자체는 Venue/Staff 도메인에 익명 집계로만 제공되며, "누가 누구에게 투표했는지"는 운영자 화면에 개별 노출되지 않는다 (랭킹/집계만 제공) |

### 2.4 Review 도메인 (검증 리뷰)

**정의**: 참여자의 실제 세션 데이터(Reaction 도메인)를 근거로 한 "조작 불가능한 방문 인증 리뷰"의 생성·공개여부를 책임진다. 새로운 입력을 받지 않고 기존 도메인 데이터의 스냅샷만 저장한다.

| 규칙 | 내용 |
|------|------|
| 생성 조건 | `venue_reviews`는 참여자가 실제로 QR 입장 후 세션 중 Reaction(별점/HOT)을 발생시킨 경우에만 생성 가능 — 임의의 텍스트 리뷰 작성 API는 존재하지 않는다 |
| 데이터 불변 | `satisfaction_snapshot`, `venue_hot_snapshot`, `visited_at` 값은 생성 이후 어떤 API로도 수정할 수 없다 |
| 운영자 권한 범위 | 운영자는 `is_hidden` 필드(공개/비공개)만 변경 가능하며, 이는 소프트 삭제로 처리된다 |
| 통계 정합성 | `is_hidden = true`로 숨긴 리뷰라도, Operator Analytics 도메인의 리포트 계산(`get_operation_summary` 등)에는 원본 데이터가 계속 포함된다 — 숨김은 "외부 공개 화면"에서만 제외를 의미 |
| AI 추론 금지 | 리뷰 문구, 코멘트 등 어떤 형태의 자유 텍스트도 AI가 생성하지 않는다. 오직 실제 발생한 수치의 스냅샷만 사용 |

### 2.5 Public Transparency 도메인 (실시간 공개 채팅)

**정의**: 매장이 opt-in한 경우에 한해, Chat 도메인의 데이터를 비참여자에게도 노출하는 규칙을 책임진다. 별도 테이블 없이 Chat 도메인 데이터를 조건부로 재노출한다.

| 규칙 | 내용 |
|------|------|
| 기본값 | `public_chat_enabled = false` (비활성화) |
| 활성화 권한 | 오직 매장 운영자만 Venue 설정에서 명시적으로 켤 수 있다 (opt-in, 참여자나 시스템이 임의로 켤 수 없음) |
| 고지 의무 | 공개 채팅이 활성화된 방에 참여자가 입장할 때 "이 방의 채팅은 외부에 공개될 수 있습니다" 고지를 표시해야 한다 |
| 노출 범위 제한 | 공개 API 응답에는 `sender_nickname`, `content`, `created_at`만 포함되며, 참여자의 개인 식별 정보(`phone_number` 등)는 어떤 경우에도 공개 API 응답에 포함되지 않는다 |
| 노출 대상 | 오직 `status = 'active'`인 방의 채팅만 공개되며, `closed` 방의 과거 채팅은 공개 API로 노출되지 않는다 |

### 2.6 Discovery 도메인 (주변 추천 / 실시간 HOT 랭킹)

**정의**: 참여자의 현재 위치를 기준으로, Venue + Room + Reaction 도메인 데이터를 조합해 실시간으로 분위기가 좋은 주변 매장을 찾아준다. 자체 저장 상태 없이 조회 시점에 계산한다.

**진입 경로 (v2 갱신)**: Discovery는 이제 두 가지 경로를 모두 가진다 — (1) 기존 설계대로 BUSINESS 방 참여자의 "방 나가기" 흐름에서 제공되는 다음 추천, (2) **앱의 기본 홈 화면**(지도 기반) 자체가 Discovery를 진입점으로 사용 — 로그인/입장 없이 누구나 주변 실시간 HOT 매장을 지도에서 먼저 보고, 그중 한 곳을 실제로 방문해야만 입장할 수 있다.

| 규칙 | 내용 |
|------|------|
| 대상 매장 조건 | 위치(위경도)가 등록되어 있고, 현재 `status = 'active'`인 방을 보유한 Venue만 랭킹/지도에 포함 |
| 정규화 원칙 | 단순 HOT 총량이 아니라 "현재 활성 참여자 수 대비 최근 N분간 HOT 발생 밀도"로 점수를 계산 — 대형 매장이 항상 유리해지는 편향을 방지 |
| 실시간 윈도우 | 기본 15분 이동 윈도우 내 HOT 리액션만 집계 (오래된 활동은 반영하지 않음) |
| 조작 불가 | 랭킹 점수는 실제 참여자의 HOT 탭(Reaction 도메인)에서만 산출되며, 매장이 직접 점수를 입력/수정할 수 있는 경로는 없다 |
| **방 코드/QR 비노출 (신규, v2)** | **Discovery 화면(홈 지도 포함)은 어떤 형태로도 방의 `code`나 QR 이미지를 응답에 포함하거나 화면에 노출하지 않는다.** 노출 가능한 것은 오직 매장명/카테고리/실시간 HOT 지수/평균 만족도/(opt-in 매장만) 공개 채팅 프리뷰뿐이다. 참여(join)는 반드시 해당 매장에 실제로 방문해 QR을 스캔해야만 가능하다 — 이는 "원격으로 코드만 알아내 실제 방문 없이 리액션을 조작·도배하는 것"을 구조적으로 차단하기 위함이며, Review 도메인의 "실제 방문 검증" 원칙과 근거를 공유한다 |
| 노출 범위 | 기본은 PERSONAL/BUSINESS 구분 없이 앱 전체 진입점(홈)에서 접근 가능. 단, 지도/목록에 표시되는 매장은 BUSINESS 방을 보유한 Venue로 한정된다 (PERSONAL 방은 애초에 Venue가 없어 대상이 아님) |

### 2.7 Operator Analytics 도메인

**정의**: 위 모든 도메인의 데이터를 읽기 전용으로 재가공해 대시보드/퍼널/리포트를 제공한다. `operation_events`(운영자가 직접 기록하는 이벤트 타임라인)를 제외하면 자체 쓰기 상태를 갖지 않는다.

| 규칙 | 내용 |
|------|------|
| 원본 데이터 미수정 | 대시보드/퍼널/리포트는 Reaction/Chat/Participant 등 다른 도메인의 데이터를 조회만 할 뿐, 어떤 값도 직접 쓰거나 수정하지 않는다 |
| 이벤트 기록 예외 | `operation_events`(직원 교대 외 운영자가 직접 기록하는 이벤트: 게임 시작, 음악 변경, 서비스 제공 등)만 이 도메인이 직접 쓰기를 소유한다 |
| AI 추론 금지 | 리포트/분석은 오직 저장된 이벤트만 근거로 하며, 저장되지 않은 상황(예: "단체 손님이 나갔다", "건배해서 분위기가 좋아졌다")은 어떤 형태로도 추론·생성하지 않는다 |

### 2.8 참여자 방 나가기(Exit Flow) — 도메인 간 순서 규칙

BUSINESS 방의 참여자 나가기는 여러 도메인에 걸친 아래 순서를 따르며, 각 단계는 스킵 가능(강제 아님):

```
만족도 별점 (Reaction 도메인, 기존 규칙 유지)
  → 직원 친절도 평가 (Staff 도메인, 신규, 스킵 가능)
  → 리뷰 유도 (Review 도메인, venue_reviews 자동 생성)
  → 주변 HOT 매장 추천 (Discovery 도메인, 신규)
```

PERSONAL 방은 위 순서 중 어떤 신규 단계도 노출되지 않으며, 기존 결과 화면 흐름을 그대로 유지한다.

### 2.9 도메인 횡단 무결성 원칙

- 운영자는 어떤 경우에도 **Reaction 도메인의 원본 데이터(hearts/warnings/stars/hot)를 직접 수정하는 API를 갖지 않는다**. 운영자가 통제 가능한 범위는 항상 "공개/비공개 전환"(Review 도메인의 `is_hidden`, Public Transparency 도메인의 `public_chat_enabled`)으로 한정된다.
- 파생 도메인(Atmosphere Index, Mutual Match, Discovery)은 원본 도메인(Reaction)의 데이터를 매번 재계산할 뿐, 별도의 상태를 저장하거나 운영자가 값을 주입할 수 있는 경로를 갖지 않는다.
- Review 도메인은 새로운 입력을 받는 도메인이 아니라 다른 도메인 데이터의 스냅샷 도메인이다 — 이 경계를 넘어 자유 텍스트 리뷰 작성 기능을 추가하지 않는다.

---

## Part 3. 문서 관리

- 이 문서는 기존 코드(`supabase/schema.sql`, `src/lib/*.ts`, `src/app/api/**/*.ts`)를 근거로 작성되었으며, 구현 중 규칙이 변경될 경우 반드시 이 문서를 함께 갱신한다.
- Part 1(기존 도메인/규칙)은 원칙적으로 수정하지 않는다. 수정이 필요하다고 판단되면 별도로 사용자 승인을 받는다.
- Part 2(신규 도메인/규칙)는 `B2B_PIVOT_DESIGN.md` / `B2B_PIVOT_ADDENDUM.md`의 스키마·API 설계와 항상 동기화되어야 한다.
- 새로운 기능을 추가할 때는 먼저 "이것이 기존 도메인의 규칙 확장인지, 새로운 도메인인지"를 판단한 뒤 이 문서의 Part 0(도메인 정의)부터 갱신한다.
