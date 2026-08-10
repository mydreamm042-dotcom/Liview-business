-- B2B Pivot Phase 6: Staff 도메인(직원 교대 + 친절도 투표) + operation_events 메모
-- 설계 근거: BUSINESS_RULES.md §2.4(Staff), §2.10(Operator Analytics 이벤트 기록 예외),
-- ROADMAP_V2.md "Phase 6 상세". 전부 additive이며 PERSONAL 방에는 영향 없음.

-- 직원 명부. 매장(Venue)에 귀속되는 정식 엔티티 — 자유 텍스트가 아니라 목록에서 선택.
-- 하드 삭제 대신 is_active로 소프트 삭제한다: 과거 staff_shifts/staff_evaluations가 이
-- 행을 참조하므로, 하드 삭제하면 지난 영업일 리포트가 깨진다 (§2.4 "직원 삭제 방식").
CREATE TABLE IF NOT EXISTS staff_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_members_venue_id ON staff_members(venue_id);

ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_members_select" ON staff_members FOR SELECT USING (true);
CREATE POLICY "staff_members_insert" ON staff_members FOR INSERT WITH CHECK (true);
CREATE POLICY "staff_members_update" ON staff_members FOR UPDATE USING (true);
-- DELETE 정책 없음 — 소프트 삭제(is_active)만 쓴다.

-- 직원 교대(출근/퇴근) 기록. 방 화면에서 트리거되므로 room_id에 직접 귀속된다 (§2.4
-- "교대는 영업일(Room)에 귀속" — 추상적인 시각 매칭이 아니다). 삭제되지 않는 감사
-- 이력이며, ended_at이 null이면 아직 근무 중이라는 뜻이다.
CREATE TABLE IF NOT EXISTS staff_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_staff_shifts_room_id ON staff_shifts(room_id);
CREATE INDEX IF NOT EXISTS idx_staff_shifts_staff_id ON staff_shifts(staff_id);

-- 같은 방에서 같은 직원이 동시에 두 개의 "진행 중" 교대를 가질 수 없도록 DB가 최종
-- 보장한다 (출근 버튼 연타/동시 요청 방지 — venue_seats의 좌석 중복 배정 방지와 같은
-- 종류의 레이스 방지).
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_shifts_one_active
  ON staff_shifts(room_id, staff_id)
  WHERE ended_at IS NULL;

ALTER TABLE staff_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_shifts_select" ON staff_shifts FOR SELECT USING (true);
CREATE POLICY "staff_shifts_insert" ON staff_shifts FOR INSERT WITH CHECK (true);
CREATE POLICY "staff_shifts_update" ON staff_shifts FOR UPDATE USING (true);
-- DELETE 정책 없음 — 감사 이력이라 삭제하지 않는다.

-- 참여자의 직원 친절도 투표. "가장 친절했던 직원 1명"을 고르는 단일 선택 투표이며
-- 별점이 아니다 (§2.4 "친절도 투표 방식"). Room 1회당 참여자 1인 1표 — 스킵은 그냥
-- 이 테이블에 행을 만들지 않는 것으로 표현한다 (star rating 스킵과 같은 패턴).
CREATE TABLE IF NOT EXISTS staff_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_evaluations_staff_id ON staff_evaluations(staff_id);

ALTER TABLE staff_evaluations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_evaluations_select" ON staff_evaluations FOR SELECT USING (true);
CREATE POLICY "staff_evaluations_insert" ON staff_evaluations FOR INSERT WITH CHECK (true);
-- UPDATE/DELETE 정책 없음 — 투표는 익명 집계 원본이라 수정/취소 경로를 열지 않는다
-- (§2.13 "운영자는 원본 데이터를 직접 수정할 수 없다"와 같은 결의 원칙).

-- 운영자가 방 화면에서 남기는 자유 텍스트 타임스탬프 메모 (operation_events). 사전
-- 정의된 이벤트 타입 목록이 아니다 (§2.10 "이벤트 기록 예외, 갱신 확정") — "게임 시작"/
-- "음악 변경" 등은 그냥 메모 내용의 예시일 뿐 고정 enum이 아니다.
CREATE TABLE IF NOT EXISTS operation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operation_events_room_id ON operation_events(room_id);

ALTER TABLE operation_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "operation_events_select" ON operation_events FOR SELECT USING (true);
CREATE POLICY "operation_events_insert" ON operation_events FOR INSERT WITH CHECK (true);
-- UPDATE/DELETE 정책 없음 — 운영 메모도 기록/감사 성격이라 수정 경로를 열지 않는다.
