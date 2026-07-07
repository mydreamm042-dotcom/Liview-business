# MySTAR B2B Pivot - 설계 추가안 (Addendum v2)

## 배경

기존 설계(B2B_PIVOT_DESIGN.md)는 "방(room) = 매장의 특정 세션"을 기준으로 설계되었다. 그러나 아래 4가지 신규 요구사항은 방 하나의 생명주기를 넘어서 **매장(venue) 단위로 누적되는 정보**를 필요로 한다.

1. 방 나가기 → 주변 실시간 HOT 술집 추천
2. 실제 현장 검증 리뷰 (조작 불가) + 타임로그, 사장님 확인/숨김 가능
3. 실시간 채팅 공개 (인터넷 방송 댓글처럼 투명하게)
4. 직원 친절도 평가 (방 나가기 시 "어느 직원이 가장 친절했나요?")

이를 위해 **`venues`(매장) 테이블을 최상위 엔티티로 신설**하고, 방(room)은 특정 시점에 열린 매장의 세션으로 재정의한다. 기존 room_configs 설계에 있던 브랜딩 필드는 venues로 이관한다(중복 방지).

---

## 1. 핵심 구조 변경: venues 테이블 신설

### 왜 필요한가
- 매장은 영업일마다(또는 상시) 새 방을 만들 수 있음 → 방마다 브랜딩/직원 목록을 다시 입력하면 안 됨
- 주변 추천/실시간 HOT 랭킹은 "지금 활성화된 방들이 속한 매장들"을 위치 기반으로 조회해야 함 → 매장의 위치(위경도)는 방이 아니라 매장에 귀속되어야 함
- 리뷰와 직원 평가는 "이 매장에 대한" 누적 데이터여야 의미가 있음 (방 하나 끝났다고 리뷰 이력이 리셋되면 안 됨)

### 스키마
```sql
CREATE TABLE venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_owner_token text NOT NULL,   -- 최초 생성 운영자 토큰 (추후 정식 계정 시스템으로 대체 예정)
  name text NOT NULL,
  category text CHECK (category IN ('bar','pub','pocha','wine_bar','cafe','event_hall','etc')),
  address text,
  latitude double precision,
  longitude double precision,
  logo_url text,
  hero_image_url text,
  primary_color text DEFAULT '#667eea',
  secondary_color text DEFAULT '#764ba2',
  naver_review_url text,
  google_review_url text,
  kakao_review_url text,
  public_chat_enabled boolean NOT NULL DEFAULT false,  -- 기본 비활성화 (opt-in)
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS venue_id uuid REFERENCES venues(id) ON DELETE SET NULL;
```

- `venue_id`는 `ON DELETE SET NULL` — venue 삭제 API는 설계하지 않지만, 혹시라도 삭제될 경우 과거 방 데이터 자체는 보존
- 기존 `room_configs`(Phase 2 설계)의 브랜딩 필드(logo_url, hero_image_url, primary_color 등)는 **venues로 이관**되고, room_configs는 "이 방만의 예외적 오버라이드"용으로 역할 축소 (예: 특별 이벤트 1회성 테마). 값이 없으면 venue 설정을 기본값으로 사용.

---

## 2. "종료" → "마감(close)" 개념 전환 — 방 삭제 방지

### 결정 사항
- BUSINESS 방은 **"종료(ended)"가 아니라 "마감(closed)"** 상태로 전환된다.
- `closed` 상태의 방은 cleanup cron(`delete_old_rooms`)에서 **영구적으로 제외**된다 → 삭제될 일이 없음.
- PERSONAL 방은 기존과 동일하게 `active → ended` 흐름 유지, 기존 24시간/2일 정리 정책 그대로 적용.

### 스키마 변경
```sql
ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_status_check;
ALTER TABLE rooms ADD CONSTRAINT rooms_status_check
  CHECK (status IN ('active', 'ended', 'closed'));
```

### cleanup 함수 수정 (기존 delete_old_rooms 대체)
```sql
CREATE OR REPLACE FUNCTION delete_old_rooms()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- PERSONAL 방만 정리 대상. BUSINESS 방(마감/closed 포함)은 절대 삭제하지 않는다.
  DELETE FROM rooms
  WHERE status = 'ended'
    AND room_type = 'PERSONAL'
    AND created_at < now() - INTERVAL '24 hours';

  DELETE FROM rooms
  WHERE status = 'active'
    AND room_type = 'PERSONAL'
    AND created_at < now() - INTERVAL '2 days';
END;
$$;
```

**결과**: 매장의 모든 영업 세션(방) 이력이 영구 보존되어, `/operator/venue/[venueId]/rooms`에서 과거 전체 이력을 조회할 수 있고, 리뷰/직원평가/이벤트 타임로그도 함께 영구 보존된다.

---

## 3. 직원 친절도 평가 (Staff Kindness Evaluation)

### 기존 설계와의 관계
기존 설계(Phase 4)의 `staff_shifts`는 "근무 중인 직원 이름"을 자유 텍스트로만 기록했다. 친절도 투표를 특정 직원에게 귀속시키려면 직원이 **선택 가능한 목록**이어야 하므로, 직원을 매장(venue)에 속한 정식 엔티티로 승격한다.

### 스키마
```sql
CREATE TABLE staff_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 기존 staff_shifts에 구조화된 참조 추가 (staff_name은 과거 호환용으로 유지)
ALTER TABLE staff_shifts ADD COLUMN IF NOT EXISTS staff_member_id uuid REFERENCES staff_members(id) ON DELETE SET NULL;

CREATE TABLE staff_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  participant_id uuid REFERENCES participants(id) ON DELETE SET NULL,
  staff_member_id uuid NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(room_id, participant_id)  -- 한 참여자는 한 세션당 1표만
);
```

### 참여자 흐름
방 나가기 시, 해당 세션에 근무 중이던(`staff_shifts` 기준) 직원 목록 중에서 선택:
> "어느 직원이 가장 친절했나요?" [직원A] [직원B] [건너뛰기]

투표는 익명(닉네임만 연결) 처리되며, 스킵 가능(강제 아님).

### 활용
`staff_evaluations` + `staff_shifts`를 JOIN하면 "언제 누가 근무했고 몇 표를 받았는가"까지 분석 가능 — 기존 설계서의 미래 항목이었던 "직원별 만족도/직원별 분위기 분석"의 데이터 기반을 지금 단계에서 미리 확보한다.

---

## 4. 실시간 검증 리뷰 + 타임로그 (venue_reviews)

### 핵심 원칙: "리뷰"가 아니라 "실제 세션 데이터의 스냅샷"
자유 텍스트로 작성하는 일반적인 리뷰가 아니다. 참여자가 **실제로 QR을 찍고 입장해 실시간 리액션(별점, HOT)을 발생시켜야만** 생성될 수 있는 데이터이므로, 조작이 원천적으로 불가능하다. 운영자는 이 값 자체를 수정하는 API를 갖지 않는다 — 오직 "공개 여부"만 제어할 수 있다.

### 스키마
```sql
CREATE TABLE venue_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  participant_id uuid REFERENCES participants(id) ON DELETE SET NULL,

  satisfaction_snapshot numeric,       -- 해당 참여자가 세션 중 남긴 마지막 별점
  venue_hot_snapshot int,               -- 방 나갈 당시 방 전체 누적 HOT 수치
  visited_at timestamptz NOT NULL,      -- 실제 방문(참여) 타임로그

  is_hidden boolean NOT NULL DEFAULT false,  -- 사장님이 '숨김' 처리 (soft delete)
  hidden_at timestamptz,

  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venue_reviews_venue_id ON venue_reviews(venue_id, visited_at DESC);
```

### 사장님 확인/삭제 동작
- `/operator/venue/[venueId]/reviews`에서 타임로그 순으로 전체 리스트 확인
- "삭제"는 실제로는 `is_hidden = true` 전환 (soft delete)
- **중요**: 숨김 처리해도 내부 운영 리포트(`get_operation_summary` 등) 계산에는 원본 reactions 데이터가 그대로 포함된다 — 오직 "외부 공개 화면"에서만 제외된다. 사장님이 원본 통계를 조작/삭제할 수 있는 경로는 없다 (무결성 보존).

### 참여자 화면과의 연결
기존 Phase 5 "리뷰 유도" 화면(네이버/구글/카카오 링크 노출)과 함께, 방 나가기 시점에 `venue_reviews` row가 자동 생성된다. 이는 외부 플랫폼 리뷰(네이버 등)와는 별개로, MySTAR 자체의 "실시간 인증 방문 기록"으로 매장 페이지 등에 노출 가능하다.

---

## 5. 실시간 채팅 공개 (투명성) — 기본 비활성화, Opt-in

### 결정 사항 (확인됨)
- 기본값: **비활성화**
- 사장님이 매장 설정에서 명시적으로 켜야만(`venues.public_chat_enabled = true`) 활성화

### 동작 방식
- 운영자 설정 화면(`/operator/venue/[venueId]/chat-settings`)에서 토글
- 토글이 켜진 매장의 **현재 active 상태인 방** 채팅이 공개 엔드포인트로 노출됨 (인터넷 방송 댓글창처럼 스크롤되는 형태)
- 참여자가 해당 방에 입장(join)할 때 "이 방의 채팅은 외부에 공개될 수 있습니다" 고지 배너 표시 — 참여 자체를 막지는 않되 명확히 인지시킴
- 공개 API 응답에는 `sender_nickname + content + created_at`만 포함 (기존 `messages` 테이블 재사용, 신규 테이블 불필요). `phone_number` 등 식별 정보는 응답에 절대 포함되지 않음

### API
```
GET /api/venue/[venueId]/live-chat   -- public_chat_enabled=true인 매장만 200 응답, 아니면 403
```

---

## 6. 주변 술집 추천 + 실시간 HOT 랭킹

### 개념
방을 나간 참여자에게 "2차 어디 갈까요?"처럼, 주변에서 **지금 실제로 분위기가 좋은(HOT 반응이 활발한)** 매장을 추천한다. 이때 HOT 지표는 각 매장의 실제 진행 중인 방에서 발생한 실제 리액션 데이터이므로 조작 불가능하다.

### 정규화 원칭
단순 HOT 총량으로 순위를 매기면 대형 매장이 항상 유리해진다. **"현재 활성 참여자 수 대비 최근 HOT 발생 밀도"**로 계산해야 소규모 매장도 실제 분위기가 좋으면 상위에 노출되는 공정한 랭킹이 된다.

### 함수
```sql
CREATE OR REPLACE FUNCTION get_live_hot_venues(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision DEFAULT 5,
  p_window_minutes int DEFAULT 15
)
RETURNS json LANGUAGE sql STABLE AS $$
  SELECT json_agg(v ORDER BY v.hot_score DESC)
  FROM (
    SELECT
      venues.id, venues.name, venues.category, venues.logo_url,
      venues.latitude, venues.longitude,
      rooms.id AS room_id,
      COALESCE(hot_recent.cnt, 0)::float / GREATEST(active_participants.cnt, 1) AS hot_score,
      (
        6371 * acos(
          cos(radians(p_lat)) * cos(radians(venues.latitude)) *
          cos(radians(venues.longitude) - radians(p_lng)) +
          sin(radians(p_lat)) * sin(radians(venues.latitude))
        )
      ) AS distance_km
    FROM venues
    JOIN rooms ON rooms.venue_id = venues.id AND rooms.status = 'active'
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS cnt FROM reactions
      WHERE reactions.room_id = rooms.id AND reactions.type = 'hot'
        AND reactions.created_at >= now() - (p_window_minutes || ' minutes')::interval
    ) hot_recent ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS cnt FROM participants
      WHERE participants.room_id = rooms.id AND participants.left_at IS NULL
    ) active_participants ON true
    WHERE venues.latitude IS NOT NULL AND venues.longitude IS NOT NULL
  ) v
  WHERE v.distance_km <= p_radius_km
$$;

GRANT EXECUTE ON FUNCTION get_live_hot_venues(double precision, double precision, double precision, int) TO anon, authenticated;
```

### 참여자 화면
`/discover` — 브라우저 위치 권한 요청 → 반경 내 실시간 HOT 매장 리스트 (거리순/HOT순 정렬 토글)

---

## 7. 참여자 방 나가기 시퀀스 (업데이트)

### BUSINESS 방
```
방 나가기
  ↓
만족도 별점 (기존 유지)
  ↓
[신규] 직원 친절도 평가 — "어느 직원이 가장 친절했나요?" (스킵 가능)
  ↓
리뷰 유도 (기존 Phase 5, venue_reviews 자동 생성과 연결)
  ↓
[신규] 주변 HOT 술집 추천 — "2차 어디 갈까요?"
```

### PERSONAL 방
기존 흐름 그대로 유지, 위 신규 화면 어느 것도 노출되지 않음.

> 참고: "주변 HOT 술집 추천"은 특정 매장 소속이 아닌 플랫폼 성장 기능 성격이 있어, 향후 PERSONAL 참여자에게도 노출할지는 별도 정책 결정이 필요하다. 초기 버전은 BUSINESS 참여자 전용으로 한정한다.

---

## 8. 신규 페이지 & API 요약

### 참여자용 페이지
```
/discover                       주변 실시간 HOT 매장 리스트
/venue/[venueId]/live           매장별 실시간 공개 채팅 (opt-in 매장만)
```

### 운영자용 페이지
```
/operator/venue/[venueId]/staff           직원 관리 + 친절도 랭킹
/operator/venue/[venueId]/reviews         검증 리뷰 리스트(타임로그), 숨김 처리
/operator/venue/[venueId]/chat-settings   공개 채팅 opt-in 토글
/operator/venue/[venueId]/rooms           매장의 전체 방(세션) 이력 (영구 보존)
```

### API
```
GET    /api/discover/venues                          위치 기반 실시간 HOT 매장
GET    /api/venue/[venueId]/live-chat                공개 채팅 피드
POST   /api/rooms/[code]/staff-evaluation            직원 평가 제출
GET    /api/operator/venue/[venueId]/staff           직원 목록/랭킹 조회
POST   /api/operator/venue/[venueId]/staff           직원 추가
GET    /api/operator/venue/[venueId]/reviews         검증 리뷰 리스트
PATCH  /api/operator/venue/[venueId]/reviews/[id]    is_hidden 토글
PATCH  /api/operator/venue/[venueId]/chat-settings   공개 채팅 opt-in 토글
POST   /api/rooms/[code]/close                       방 마감 (BUSINESS 전용, ended 대신 closed)
```

---

## 9. 무결성 원칙 (기존 설계서 원칙과 일관)

- HOT/만족도/리뷰 스냅샷은 오직 실제 `reactions` 테이블 데이터에서 계산되며, 운영자가 값 자체를 수정할 수 있는 API는 존재하지 않는다.
- 운영자가 통제 가능한 범위는 **오직 "공개 여부"** — 리뷰 숨김(`is_hidden`), 채팅 공개 여부(`public_chat_enabled`) — 뿐이며, 원본 데이터 변조는 불가능하다.
- 리뷰 숨김은 soft-delete이며, 내부 리포트/analytics 계산에는 숨겨진 리뷰의 원본 데이터도 계속 포함된다 (운영 리포트 정확성 보존). 오직 "외부 공개 노출"에서만 제외된다.
- 기존 설계서의 "존재하지 않는 데이터는 AI가 추론하지 않는다"는 원칙이 여기서도 동일하게 적용된다 — venue_reviews는 실제 발생한 satisfaction/HOT 값의 스냅샷일 뿐, 별도 텍스트를 생성하지 않는다.

---

## 10. 이번 추가로 인한 기존 설계 변경 사항 요약

| 항목 | 기존 설계 | 변경 후 |
|------|----------|---------|
| 브랜딩 소속 | room_configs (방별) | venues (매장별, 누적) — room_configs는 선택적 오버라이드로 축소 |
| 방 종료 상태 | active → ended | BUSINESS: active → **closed** (삭제 안 됨) / PERSONAL: active → ended (기존 유지) |
| cleanup 대상 | 모든 방 | **PERSONAL 방만** (room_type = 'PERSONAL' 조건 추가) |
| 직원 기록 | staff_shifts.staff_name (자유 텍스트) | staff_members 엔티티 추가, staff_shifts.staff_member_id로 구조화 |
| 리뷰 | 외부 링크 클릭 유도만 | venue_reviews 테이블로 실제 세션 데이터 스냅샷 기록 + 타임로그 + 숨김 처리 |
| 채팅 | 방 내부 참여자만 열람 | (opt-in 시) 외부 공개 가능, 기본은 기존과 동일하게 비공개 |

**모든 변경은 추가적(additive)이며, 기존 PERSONAL 방 동작에는 영향이 없다.**

---

## 11. 신규 DB 객체 요약

| 유형 | 이름 | 목적 |
|------|------|------|
| 신규 테이블 | `venues` | 매장 마스터 엔티티 (브랜딩, 위치, 리뷰 URL 등) |
| 신규 테이블 | `staff_members` | 매장 소속 직원 목록 |
| 신규 테이블 | `staff_evaluations` | 참여자의 직원 친절도 투표 |
| 신규 테이블 | `venue_reviews` | 실제 세션 데이터 기반 검증 리뷰 + 타임로그 |
| 컬럼 추가 | `rooms.venue_id` | 방이 속한 매장 연결 |
| 컬럼 추가 | `staff_shifts.staff_member_id` | 구조화된 직원 참조 |
| 제약 변경 | `rooms.status` CHECK | 'closed' 상태 추가 |
| 함수 수정 | `delete_old_rooms()` | BUSINESS 방 삭제 완전 배제 |
| 함수 신규 | `get_live_hot_venues()` | 위치 기반 실시간 HOT 랭킹 |

---

## 12. 다음 단계

이 추가안은 기존 IMPLEMENTATION_CHECKLIST.md의 Phase 2(브랜딩)와 Phase 4(직원/이벤트)에 통합되어야 하며, 신규 Phase로 분리하는 것을 권장한다:

- **Phase 2 수정**: room_configs 대신 venues 테이블 기준으로 브랜딩 구현
- **Phase 4 수정**: staff_shifts에 staff_members 참조 추가, 직원 친절도 투표 UI 추가
- **Phase 7 (신규)**: venue_reviews, 실시간 HOT 랭킹, 주변 추천, 공개 채팅 — 별도 단계로 분리 (약 4~5일 추가 소요 예상)

설계 승인 시 B2B_MIGRATION.sql에 위 스키마를 반영한 v2 마이그레이션 파일을 별도로 작성하겠습니다.
